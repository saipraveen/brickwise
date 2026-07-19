import { type Router as RouterType, Router, type Request, type Response } from "express";
import { eq, and, sql, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  setCollection,
  catalogSet,
  catalogSetPart,
  brickInventory,
} from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import type { AddSetRequest, UpdateSetStatusRequest } from "shared";

const router: RouterType = Router();

// All set routes require authentication
router.use(authenticate);

/**
 * GET /api/sets
 * Returns the user's set collection with images, names, themes, and build status.
 * Joins with catalogSet to get imageUrl.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const sets = await db
    .select({
      id: setCollection.id,
      setNumber: setCollection.setNumber,
      name: setCollection.name,
      theme: setCollection.theme,
      year: setCollection.year,
      pieceCount: setCollection.pieceCount,
      status: setCollection.status,
      isDuplicate: setCollection.isDuplicate,
      addedAt: setCollection.addedAt,
      imageUrl: catalogSet.imageUrl,
    })
    .from(setCollection)
    .leftJoin(catalogSet, eq(setCollection.setNumber, catalogSet.setNumber))
    .where(eq(setCollection.userId, userId))
    .orderBy(setCollection.addedAt);

  res.status(200).json({ data: sets });
});

/**
 * POST /api/sets
 * Add a set to the user's collection from the catalog.
 * Imports all the set's bricks into inventory as "available".
 * Detects duplicates and warns the user.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { setNumber } = req.body as AddSetRequest;

  if (!setNumber || typeof setNumber !== "string") {
    res.status(400).json({
      error: "validation_error",
      message: "setNumber is required",
      statusCode: 400,
    });
    return;
  }

  // Look up set in catalog
  const [catalogEntry] = await db
    .select()
    .from(catalogSet)
    .where(eq(catalogSet.setNumber, setNumber))
    .limit(1);

  if (!catalogEntry) {
    res.status(404).json({
      error: "not_found",
      message: `Set ${setNumber} not found in catalog`,
      statusCode: 404,
    });
    return;
  }

  // Check for duplicate in user's collection
  const [existingSet] = await db
    .select()
    .from(setCollection)
    .where(
      and(
        eq(setCollection.userId, userId),
        eq(setCollection.setNumber, setNumber),
      ),
    )
    .limit(1);

  const isDuplicate = !!existingSet;

  // If duplicate and no explicit confirmation, warn the user
  const confirmDuplicate = req.body.confirmDuplicate as boolean | undefined;
  if (isDuplicate && !confirmDuplicate) {
    res.status(409).json({
      error: "duplicate_set",
      message: `Set ${setNumber} already exists in your collection. Send confirmDuplicate: true to add another copy.`,
      statusCode: 409,
      existingSetId: existingSet.id,
    });
    return;
  }

  // Add the set to collection
  const [newSet] = await db
    .insert(setCollection)
    .values({
      userId,
      setNumber: catalogEntry.setNumber,
      name: catalogEntry.name,
      theme: catalogEntry.theme,
      year: catalogEntry.year,
      pieceCount: catalogEntry.pieceCount,
      status: "disassembled",
      isDuplicate,
    })
    .returning();

  // Import set's bricks into inventory (Req 1.11)
  const setParts = await db
    .select()
    .from(catalogSetPart)
    .where(eq(catalogSetPart.setNumber, setNumber));

  for (const part of setParts) {
    // Check if an entry already exists for this user + part + color + status (available)
    const [existing] = await db
      .select()
      .from(brickInventory)
      .where(
        and(
          eq(brickInventory.userId, userId),
          eq(brickInventory.partNumber, part.partNumber),
          eq(brickInventory.colorId, part.colorId),
          eq(brickInventory.status, "available"),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(brickInventory)
        .set({
          quantity: existing.quantity + part.quantity,
          lastModified: new Date(),
        })
        .where(eq(brickInventory.id, existing.id));
    } else {
      await db.insert(brickInventory).values({
        userId,
        partNumber: part.partNumber,
        colorId: part.colorId,
        quantity: part.quantity,
        status: "available",
        sourceSetNumber: setNumber,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: `Set ${setNumber} added to collection`,
    set: newSet,
    bricksImported: setParts.length,
    isDuplicate,
  });
});

/**
 * GET /api/sets/search
 * Search the catalog for sets by set number (prefix match), name (ILIKE), or theme (ILIKE).
 * Returns up to 50 matching sets.
 * Requires: Requirement 4.3
 */
router.get("/search", async (req: Request, res: Response): Promise<void> => {
  const query = req.query["query"] as string | undefined;

  if (!query || query.trim().length === 0) {
    res.status(400).json({
      error: "validation_error",
      message: "query parameter is required",
      statusCode: 400,
    });
    return;
  }

  const searchTerm = query.trim();
  const ilikePattern = `%${searchTerm}%`;
  const prefixPattern = `${searchTerm}%`;

  const results = await db
    .select({
      setNumber: catalogSet.setNumber,
      name: catalogSet.name,
      theme: catalogSet.theme,
      year: catalogSet.year,
      pieceCount: catalogSet.pieceCount,
      imageUrl: catalogSet.imageUrl,
    })
    .from(catalogSet)
    .where(
      or(
        ilike(catalogSet.setNumber, prefixPattern),
        ilike(catalogSet.name, ilikePattern),
        ilike(catalogSet.theme, ilikePattern),
      ),
    )
    .limit(50);

  res.status(200).json({ data: results });
});

/**
 * PATCH /api/sets/:id/status
 * Update set build status (built/disassembled/partial).
 * - "built": mark set's bricks as in-use. If bricks already in-use/in-storage, return conflict list (Req 2.7)
 * - "disassembled": mark set's bricks as available (Req 2.4)
 */
router.patch("/:id/status", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = req.params["id"] as string;
  const { status, confirmConflicts } = req.body as UpdateSetStatusRequest;

  if (!id) {
    res.status(400).json({
      error: "validation_error",
      message: "Set ID is required",
      statusCode: 400,
    });
    return;
  }

  const validStatuses = ["built", "disassembled", "partial"];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      error: "validation_error",
      message: "Status must be one of: built, disassembled, partial",
      statusCode: 400,
    });
    return;
  }

  // Verify ownership
  const [setEntry] = await db
    .select()
    .from(setCollection)
    .where(and(eq(setCollection.id, id), eq(setCollection.userId, userId)))
    .limit(1);

  if (!setEntry) {
    res.status(404).json({
      error: "not_found",
      message: "Set not found in collection",
      statusCode: 404,
    });
    return;
  }

  // Get set parts from catalog
  const setParts = await db
    .select()
    .from(catalogSetPart)
    .where(eq(catalogSetPart.setNumber, setEntry.setNumber));

  if (status === "built") {
    // Check for conflicts: bricks that are in-use or in-storage (Req 2.7)
    const conflictingBricks: Array<{
      partNumber: string;
      colorId: number;
      currentStatus: string;
      quantity: number;
    }> = [];

    for (const part of setParts) {
      // Look for bricks that are NOT available for this part+color
      const unavailableBricks = await db
        .select()
        .from(brickInventory)
        .where(
          and(
            eq(brickInventory.userId, userId),
            eq(brickInventory.partNumber, part.partNumber),
            eq(brickInventory.colorId, part.colorId),
            sql`${brickInventory.status} != 'available'`,
          ),
        );

      // Also check if there are enough available bricks
      const [availableEntry] = await db
        .select()
        .from(brickInventory)
        .where(
          and(
            eq(brickInventory.userId, userId),
            eq(brickInventory.partNumber, part.partNumber),
            eq(brickInventory.colorId, part.colorId),
            eq(brickInventory.status, "available"),
          ),
        )
        .limit(1);

      const availableQty = availableEntry?.quantity ?? 0;

      if (availableQty < part.quantity) {
        // Some or all bricks are unavailable
        for (const brick of unavailableBricks) {
          conflictingBricks.push({
            partNumber: brick.partNumber,
            colorId: brick.colorId,
            currentStatus: brick.status,
            quantity: brick.quantity,
          });
        }
      }
    }

    if (conflictingBricks.length > 0 && !confirmConflicts) {
      res.status(409).json({
        error: "brick_conflict",
        message: "Some bricks required for this set are already in-use or in-storage",
        statusCode: 409,
        hasConflicts: true,
        conflictingBricks,
      });
      return;
    }

    // Mark bricks as in-use (Req 2.3)
    for (const part of setParts) {
      const [availableEntry] = await db
        .select()
        .from(brickInventory)
        .where(
          and(
            eq(brickInventory.userId, userId),
            eq(brickInventory.partNumber, part.partNumber),
            eq(brickInventory.colorId, part.colorId),
            eq(brickInventory.status, "available"),
          ),
        )
        .limit(1);

      if (availableEntry) {
        if (availableEntry.quantity <= part.quantity) {
          // Update entire entry to in-use
          await db
            .update(brickInventory)
            .set({ status: "in-use", lastModified: new Date() })
            .where(eq(brickInventory.id, availableEntry.id));
        } else {
          // Split: reduce available quantity, create in-use entry
          await db
            .update(brickInventory)
            .set({
              quantity: availableEntry.quantity - part.quantity,
              lastModified: new Date(),
            })
            .where(eq(brickInventory.id, availableEntry.id));

          await db.insert(brickInventory).values({
            userId,
            partNumber: part.partNumber,
            colorId: part.colorId,
            quantity: part.quantity,
            status: "in-use",
            sourceSetNumber: setEntry.setNumber,
            lastModified: new Date(),
          });
        }
      }
    }
  } else if (status === "disassembled") {
    // Mark bricks as available (Req 2.4)
    // Find all in-use bricks from this set and transition them back to available
    for (const part of setParts) {
      const inUseBricks = await db
        .select()
        .from(brickInventory)
        .where(
          and(
            eq(brickInventory.userId, userId),
            eq(brickInventory.partNumber, part.partNumber),
            eq(brickInventory.colorId, part.colorId),
            eq(brickInventory.status, "in-use"),
          ),
        );

      for (const brick of inUseBricks) {
        // Check if there's already an available entry for this part+color
        const [existingAvailable] = await db
          .select()
          .from(brickInventory)
          .where(
            and(
              eq(brickInventory.userId, userId),
              eq(brickInventory.partNumber, brick.partNumber),
              eq(brickInventory.colorId, brick.colorId),
              eq(brickInventory.status, "available"),
            ),
          )
          .limit(1);

        if (existingAvailable) {
          // Merge into existing available entry
          await db
            .update(brickInventory)
            .set({
              quantity: existingAvailable.quantity + brick.quantity,
              lastModified: new Date(),
            })
            .where(eq(brickInventory.id, existingAvailable.id));

          // Remove the in-use entry
          await db
            .delete(brickInventory)
            .where(eq(brickInventory.id, brick.id));
        } else {
          // Just change status to available
          await db
            .update(brickInventory)
            .set({ status: "available", lastModified: new Date() })
            .where(eq(brickInventory.id, brick.id));
        }
      }
    }
  }

  // Update set status
  const [updatedSet] = await db
    .update(setCollection)
    .set({ status })
    .where(eq(setCollection.id, id))
    .returning();

  res.status(200).json({
    success: true,
    message: `Set status updated to ${status}`,
    set: updatedSet,
  });
});

/**
 * DELETE /api/sets/:id
 * Remove a set from the collection.
 * - Warn if built/partial before removal (Req 4.5)
 * - If disassembled, remove bricks from inventory (Req 4.4)
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = req.params["id"] as string;
  const confirmRemoval = req.query["confirm"] === "true";

  // Verify ownership
  const [setEntry] = await db
    .select()
    .from(setCollection)
    .where(and(eq(setCollection.id, id), eq(setCollection.userId, userId)))
    .limit(1);

  if (!setEntry) {
    res.status(404).json({
      error: "not_found",
      message: "Set not found in collection",
      statusCode: 404,
    });
    return;
  }

  // Warn if built or partial (Req 4.5)
  if ((setEntry.status === "built" || setEntry.status === "partial") && !confirmRemoval) {
    res.status(409).json({
      error: "set_in_use",
      message: `Set is currently marked as "${setEntry.status}". Some bricks are in use. Send ?confirm=true to proceed.`,
      statusCode: 409,
      setStatus: setEntry.status,
    });
    return;
  }

  // If disassembled, remove bricks from inventory (Req 4.4)
  if (setEntry.status === "disassembled") {
    const setParts = await db
      .select()
      .from(catalogSetPart)
      .where(eq(catalogSetPart.setNumber, setEntry.setNumber));

    for (const part of setParts) {
      const [availableEntry] = await db
        .select()
        .from(brickInventory)
        .where(
          and(
            eq(brickInventory.userId, userId),
            eq(brickInventory.partNumber, part.partNumber),
            eq(brickInventory.colorId, part.colorId),
            eq(brickInventory.status, "available"),
          ),
        )
        .limit(1);

      if (availableEntry) {
        if (availableEntry.quantity <= part.quantity) {
          // Remove entire entry
          await db
            .delete(brickInventory)
            .where(eq(brickInventory.id, availableEntry.id));
        } else {
          // Decrease quantity
          await db
            .update(brickInventory)
            .set({
              quantity: availableEntry.quantity - part.quantity,
              lastModified: new Date(),
            })
            .where(eq(brickInventory.id, availableEntry.id));
        }
      }
    }
  }

  // Remove set from collection
  await db
    .delete(setCollection)
    .where(eq(setCollection.id, id));

  res.status(200).json({
    success: true,
    message: `Set ${setEntry.setNumber} removed from collection`,
  });
});

export default router;
