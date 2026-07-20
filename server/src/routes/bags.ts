import { type Router as RouterType, Router, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { storageBag, brickInventory } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import type { AssignBricksToBagRequest, BagOverview, BagLocation } from "shared";

const router: RouterType = Router();

// All bag routes require authentication
router.use(authenticate);

/**
 * GET /api/bags
 * Returns all bags with bag number, distinct brick types count, and total brick count.
 * Requirement 3.7
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  // Get all bags for the user
  const bags = await db
    .select()
    .from(storageBag)
    .where(eq(storageBag.userId, userId))
    .orderBy(storageBag.bagNumber);

  // For each bag, compute the overview stats from brick_inventory
  const overviews: (BagOverview & { id: string })[] = [];

  for (const bag of bags) {
    const [stats] = await db
      .select({
        distinctTypes: sql<number>`count(distinct (${brickInventory.partNumber}, ${brickInventory.colorId}))::int`.as("distinct_types"),
        totalCount: sql<number>`coalesce(sum(${brickInventory.quantity}), 0)::int`.as("total_count"),
      })
      .from(brickInventory)
      .where(
        and(
          eq(brickInventory.userId, userId),
          eq(brickInventory.bagNumber, bag.bagNumber),
          eq(brickInventory.status, "in-storage"),
        ),
      );

    overviews.push({
      id: bag.id,
      bagNumber: bag.bagNumber,
      distinctBrickTypes: stats?.distinctTypes ?? 0,
      totalBrickCount: stats?.totalCount ?? 0,
    });
  }

  res.status(200).json({ data: overviews });
});

/**
 * GET /api/bags/locate
 * Find all bags containing a given brick by part number and optionally color.
 * Returns bag numbers with quantity per bag.
 * Requirements 3.3, 3.8
 */
router.get("/locate", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const partNumber = req.query["partNumber"] as string | undefined;
  const colorIdParam = req.query["colorId"] as string | undefined;

  if (!partNumber) {
    res.status(400).json({
      error: "validation_error",
      message: "partNumber query parameter is required",
      statusCode: 400,
    });
    return;
  }

  const conditions = [
    eq(brickInventory.userId, userId),
    eq(brickInventory.partNumber, partNumber),
    eq(brickInventory.status, "in-storage"),
  ];

  if (colorIdParam !== undefined) {
    const colorId = Number(colorIdParam);
    if (isNaN(colorId) || colorId < 0) {
      res.status(400).json({
        error: "validation_error",
        message: "colorId must be a non-negative number",
        statusCode: 400,
      });
      return;
    }
    conditions.push(eq(brickInventory.colorId, colorId));
  }

  const results = await db
    .select({
      bagNumber: brickInventory.bagNumber,
      quantity: sql<number>`sum(${brickInventory.quantity})::int`.as("quantity"),
    })
    .from(brickInventory)
    .where(and(...conditions))
    .groupBy(brickInventory.bagNumber)
    .orderBy(brickInventory.bagNumber);

  // Filter out null bag numbers (shouldn't happen for in-storage, but defensive)
  const locations: BagLocation[] = results
    .filter((r) => r.bagNumber !== null)
    .map((r) => ({
      bagNumber: r.bagNumber!,
      quantity: r.quantity,
    }));

  res.status(200).json({ data: locations });
});

/**
 * GET /api/bags/:id/bricks
 * Returns all bricks stored in a specific bag.
 */
router.get("/:id/bricks", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const bagId = req.params["id"] as string;

  // Verify bag belongs to user
  const [bag] = await db
    .select()
    .from(storageBag)
    .where(and(eq(storageBag.id, bagId), eq(storageBag.userId, userId)))
    .limit(1);

  if (!bag) {
    res.status(404).json({
      error: "not_found",
      message: "Storage bag not found",
      statusCode: 404,
    });
    return;
  }

  const bricks = await db
    .select({
      id: brickInventory.id,
      partNumber: brickInventory.partNumber,
      colorId: brickInventory.colorId,
      quantity: brickInventory.quantity,
    })
    .from(brickInventory)
    .where(
      and(
        eq(brickInventory.userId, userId),
        eq(brickInventory.bagNumber, bag.bagNumber),
        eq(brickInventory.status, "in-storage"),
      ),
    );

  res.status(200).json({ data: bricks });
});

/**
 * POST /api/bags
 * Create a new storage bag with the next sequential number.
 * Requirement 3.1
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  // Get the current max bag number for this user
  const [maxResult] = await db
    .select({
      maxBagNumber: sql<number | null>`max(${storageBag.bagNumber})`.as("max_bag_number"),
    })
    .from(storageBag)
    .where(eq(storageBag.userId, userId));

  const nextBagNumber = (maxResult?.maxBagNumber ?? 0) + 1;

  const [newBag] = await db
    .insert(storageBag)
    .values({
      userId,
      bagNumber: nextBagNumber,
    })
    .returning();

  res.status(201).json({
    success: true,
    message: `Storage bag #${nextBagNumber} created`,
    bag: {
      id: newBag!.id,
      bagNumber: newBag!.bagNumber,
      createdAt: newBag!.createdAt,
    },
  });
});

/**
 * POST /api/bags/:id/bricks
 * Assign bricks to a bag. Validates that bricks are present in user's available inventory.
 * Marks those bricks as "in-storage" and sets bagNumber.
 * Requirements 3.2, 3.9
 */
router.post("/:id/bricks", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const bagId = req.params["id"] as string;
  const { bricks } = req.body as AssignBricksToBagRequest;

  if (!bricks || !Array.isArray(bricks) || bricks.length === 0) {
    res.status(400).json({
      error: "validation_error",
      message: "bricks array is required and must not be empty",
      statusCode: 400,
    });
    return;
  }

  // Verify bag belongs to user
  const [bag] = await db
    .select()
    .from(storageBag)
    .where(and(eq(storageBag.id, bagId), eq(storageBag.userId, userId)))
    .limit(1);

  if (!bag) {
    res.status(404).json({
      error: "not_found",
      message: "Storage bag not found",
      statusCode: 404,
    });
    return;
  }

  // Validate each brick entry
  for (const brick of bricks) {
    if (!brick.partNumber || typeof brick.partNumber !== "string") {
      res.status(400).json({
        error: "validation_error",
        message: "Each brick must have a valid partNumber",
        statusCode: 400,
      });
      return;
    }
    if (typeof brick.colorId !== "number" || brick.colorId < 0) {
      res.status(400).json({
        error: "validation_error",
        message: "Each brick must have a valid colorId (non-negative number)",
        statusCode: 400,
      });
      return;
    }
    if (typeof brick.quantity !== "number" || brick.quantity < 1) {
      res.status(400).json({
        error: "validation_error",
        message: "Each brick must have a quantity of at least 1",
        statusCode: 400,
      });
      return;
    }
  }

  // Validate that each brick is available in inventory (Req 3.9)
  const unavailableBricks: Array<{ partNumber: string; colorId: number; requested: number; available: number }> = [];

  for (const brick of bricks) {
    const [availableEntry] = await db
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

    const availableQty = availableEntry?.quantity ?? 0;
    if (availableQty < brick.quantity) {
      unavailableBricks.push({
        partNumber: brick.partNumber,
        colorId: brick.colorId,
        requested: brick.quantity,
        available: availableQty,
      });
    }
  }

  if (unavailableBricks.length > 0) {
    res.status(400).json({
      error: "insufficient_inventory",
      message: "Some bricks are not available in your inventory for storage",
      statusCode: 400,
      unavailableBricks,
    });
    return;
  }

  // Assign bricks to the bag
  const assignedEntries = [];

  for (const brick of bricks) {
    // Find the available inventory entry
    const [availableEntry] = await db
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

    if (!availableEntry) continue;

    if (availableEntry.quantity === brick.quantity) {
      // Convert entire entry to in-storage
      const [updated] = await db
        .update(brickInventory)
        .set({
          status: "in-storage",
          bagNumber: bag.bagNumber,
          lastModified: new Date(),
        })
        .where(eq(brickInventory.id, availableEntry.id))
        .returning();
      assignedEntries.push(updated);
    } else {
      // Split: reduce available quantity, create in-storage entry
      await db
        .update(brickInventory)
        .set({
          quantity: availableEntry.quantity - brick.quantity,
          lastModified: new Date(),
        })
        .where(eq(brickInventory.id, availableEntry.id));

      // Check if there's already an in-storage entry for this part+color+bag
      const [existingStorageEntry] = await db
        .select()
        .from(brickInventory)
        .where(
          and(
            eq(brickInventory.userId, userId),
            eq(brickInventory.partNumber, brick.partNumber),
            eq(brickInventory.colorId, brick.colorId),
            eq(brickInventory.status, "in-storage"),
            eq(brickInventory.bagNumber, bag.bagNumber),
          ),
        )
        .limit(1);

      if (existingStorageEntry) {
        // Increment existing storage entry
        const [updated] = await db
          .update(brickInventory)
          .set({
            quantity: existingStorageEntry.quantity + brick.quantity,
            lastModified: new Date(),
          })
          .where(eq(brickInventory.id, existingStorageEntry.id))
          .returning();
        assignedEntries.push(updated);
      } else {
        // Create new in-storage entry
        const [created] = await db
          .insert(brickInventory)
          .values({
            userId,
            partNumber: brick.partNumber,
            colorId: brick.colorId,
            quantity: brick.quantity,
            status: "in-storage",
            bagNumber: bag.bagNumber,
            sourceSetNumber: availableEntry.sourceSetNumber,
          })
          .returning();
        assignedEntries.push(created);
      }
    }
  }

  res.status(201).json({
    success: true,
    message: `Assigned ${bricks.length} brick type(s) to bag #${bag.bagNumber}`,
    entries: assignedEntries,
  });
});

/**
 * DELETE /api/bags/:id/bricks/:brickId
 * Remove a brick from a bag. Decreases quantity, removes association at zero.
 * Marks bricks back as "available".
 * Requirements 3.4, 3.5
 *
 * Query param: quantity (optional, defaults to all)
 */
router.delete("/:id/bricks/:brickId", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const bagId = req.params["id"] as string;
  const brickId = req.params["brickId"] as string;
  const removeQuantity = Number(req.query["quantity"]) || undefined;

  // Verify bag belongs to user
  const [bag] = await db
    .select()
    .from(storageBag)
    .where(and(eq(storageBag.id, bagId), eq(storageBag.userId, userId)))
    .limit(1);

  if (!bag) {
    res.status(404).json({
      error: "not_found",
      message: "Storage bag not found",
      statusCode: 404,
    });
    return;
  }

  // Find the brick entry in this bag
  const [brickEntry] = await db
    .select()
    .from(brickInventory)
    .where(
      and(
        eq(brickInventory.id, brickId),
        eq(brickInventory.userId, userId),
        eq(brickInventory.bagNumber, bag.bagNumber),
        eq(brickInventory.status, "in-storage"),
      ),
    )
    .limit(1);

  if (!brickEntry) {
    res.status(404).json({
      error: "not_found",
      message: "Brick not found in this bag",
      statusCode: 404,
    });
    return;
  }

  const quantityToRemove = removeQuantity ?? brickEntry.quantity;

  if (quantityToRemove < 1) {
    res.status(400).json({
      error: "validation_error",
      message: "Quantity to remove must be at least 1",
      statusCode: 400,
    });
    return;
  }

  if (quantityToRemove > brickEntry.quantity) {
    res.status(400).json({
      error: "quantity_exceeded",
      message: `Cannot remove ${quantityToRemove} bricks. Only ${brickEntry.quantity} in this bag.`,
      statusCode: 400,
      maxAvailable: brickEntry.quantity,
    });
    return;
  }

  // Move bricks back to available status
  // Check if there's already an available entry for this part+color
  const [existingAvailable] = await db
    .select()
    .from(brickInventory)
    .where(
      and(
        eq(brickInventory.userId, userId),
        eq(brickInventory.partNumber, brickEntry.partNumber),
        eq(brickInventory.colorId, brickEntry.colorId),
        eq(brickInventory.status, "available"),
      ),
    )
    .limit(1);

  if (existingAvailable) {
    // Increment existing available entry
    await db
      .update(brickInventory)
      .set({
        quantity: existingAvailable.quantity + quantityToRemove,
        lastModified: new Date(),
      })
      .where(eq(brickInventory.id, existingAvailable.id));
  } else {
    // Create new available entry
    await db.insert(brickInventory).values({
      userId,
      partNumber: brickEntry.partNumber,
      colorId: brickEntry.colorId,
      quantity: quantityToRemove,
      status: "available",
      sourceSetNumber: brickEntry.sourceSetNumber,
    });
  }

  // Handle the in-storage entry
  if (quantityToRemove === brickEntry.quantity) {
    // Remove association entirely (Req 3.5)
    await db
      .delete(brickInventory)
      .where(eq(brickInventory.id, brickId));

    res.status(200).json({
      success: true,
      message: "Brick removed from bag entirely",
      removed: true,
    });
  } else {
    // Decrease quantity in bag (Req 3.4)
    const [updated] = await db
      .update(brickInventory)
      .set({
        quantity: brickEntry.quantity - quantityToRemove,
        lastModified: new Date(),
      })
      .where(eq(brickInventory.id, brickId))
      .returning();

    res.status(200).json({
      success: true,
      message: `Removed ${quantityToRemove} brick(s) from bag`,
      removed: false,
      entry: updated,
    });
  }
});

export default router;
