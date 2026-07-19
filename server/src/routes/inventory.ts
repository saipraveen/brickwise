import { type Router as RouterType, Router, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { brickInventory, catalogPart, catalogColor } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import type {
  BulkAddBricksRequest,
  UpdateBrickRequest,
  InventoryQueryParams,
} from "shared";

const router: RouterType = Router();

// All inventory routes require authentication
router.use(authenticate);

/**
 * GET /api/inventory
 * Returns the user's inventory with optional grouping and status breakdown.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { groupBy, status, partNumber, colorId, page, pageSize } = req.query as unknown as InventoryQueryParams;

  const currentPage = Math.max(1, Number(page) || 1);
  const currentPageSize = Math.min(50, Math.max(1, Number(pageSize) || 50));
  const offset = (currentPage - 1) * currentPageSize;

  // Build base conditions
  const conditions = [eq(brickInventory.userId, userId)];

  if (status) {
    conditions.push(eq(brickInventory.status, status));
  }
  if (partNumber) {
    conditions.push(eq(brickInventory.partNumber, partNumber));
  }
  if (colorId) {
    conditions.push(eq(brickInventory.colorId, Number(colorId)));
  }

  const whereClause = and(...conditions);

  if (groupBy) {
    // Grouped query - aggregate by the groupBy field
    let groupedResults;

    if (groupBy === "partNumber") {
      groupedResults = await db
        .select({
          partNumber: brickInventory.partNumber,
          totalQuantity: sql<number>`sum(${brickInventory.quantity})::int`.as("total_quantity"),
          entryCount: sql<number>`count(*)::int`.as("entry_count"),
        })
        .from(brickInventory)
        .where(whereClause)
        .groupBy(brickInventory.partNumber)
        .limit(currentPageSize)
        .offset(offset);

      res.status(200).json({ data: groupedResults, groupBy });
      return;
    }

    if (groupBy === "color") {
      groupedResults = await db
        .select({
          colorId: brickInventory.colorId,
          totalQuantity: sql<number>`sum(${brickInventory.quantity})::int`.as("total_quantity"),
          entryCount: sql<number>`count(*)::int`.as("entry_count"),
        })
        .from(brickInventory)
        .where(whereClause)
        .groupBy(brickInventory.colorId)
        .limit(currentPageSize)
        .offset(offset);

      // Enrich with color names from catalog
      const colorIds = groupedResults.map((r) => r.colorId);
      const colors = colorIds.length > 0
        ? await db
            .select({ colorId: catalogColor.colorId, name: catalogColor.name })
            .from(catalogColor)
            .where(sql`${catalogColor.colorId} = ANY(${colorIds})`)
        : [];
      const colorMap = new Map(colors.map((c) => [c.colorId, c.name]));

      const enriched = groupedResults.map((r) => ({
        ...r,
        colorName: colorMap.get(r.colorId) ?? "Unknown",
      }));

      res.status(200).json({ data: enriched, groupBy });
      return;
    }

    if (groupBy === "category") {
      // Join with catalog_part to get category info
      groupedResults = await db
        .select({
          categoryId: catalogPart.categoryId,
          categoryName: catalogPart.categoryName,
          totalQuantity: sql<number>`sum(${brickInventory.quantity})::int`.as("total_quantity"),
          entryCount: sql<number>`count(*)::int`.as("entry_count"),
        })
        .from(brickInventory)
        .leftJoin(catalogPart, eq(brickInventory.partNumber, catalogPart.partNumber))
        .where(whereClause)
        .groupBy(catalogPart.categoryId, catalogPart.categoryName)
        .limit(currentPageSize)
        .offset(offset);

      res.status(200).json({ data: groupedResults, groupBy });
      return;
    }
  }

  // Non-grouped: return individual entries with pagination
  const items = await db
    .select()
    .from(brickInventory)
    .where(whereClause)
    .limit(currentPageSize)
    .offset(offset)
    .orderBy(brickInventory.lastModified);

  // Status breakdown for this user
  const breakdown = await db
    .select({
      status: brickInventory.status,
      count: sql<number>`sum(${brickInventory.quantity})::int`.as("count"),
    })
    .from(brickInventory)
    .where(eq(brickInventory.userId, userId))
    .groupBy(brickInventory.status);

  const summary = {
    totalCount: 0,
    availableCount: 0,
    inUseCount: 0,
    inStorageCount: 0,
  };

  for (const row of breakdown) {
    const count = row.count ?? 0;
    summary.totalCount += count;
    if (row.status === "available") summary.availableCount = count;
    else if (row.status === "in-use") summary.inUseCount = count;
    else if (row.status === "in-storage") summary.inStorageCount = count;
  }

  // Count total items for pagination
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int`.as("count") })
    .from(brickInventory)
    .where(whereClause);

  const totalItems = totalResult?.count ?? 0;
  const totalPages = Math.ceil(totalItems / currentPageSize);

  res.status(200).json({
    data: items,
    summary,
    pagination: {
      page: currentPage,
      pageSize: currentPageSize,
      totalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
    },
  });
});

/**
 * POST /api/inventory/bulk-add
 * Adds bricks to inventory. Increments quantity for existing entries or creates new entries.
 */
router.post("/bulk-add", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { bricks } = req.body as BulkAddBricksRequest;

  if (!bricks || !Array.isArray(bricks) || bricks.length === 0) {
    res.status(400).json({
      error: "validation_error",
      message: "bricks array is required and must not be empty",
      statusCode: 400,
    });
    return;
  }

  // Validate each entry
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

  const addedEntries = [];

  for (const brick of bricks) {
    // Check if an entry already exists for this user + part + color + status (available)
    const [existing] = await db
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

    if (existing) {
      // Increment quantity
      const [updated] = await db
        .update(brickInventory)
        .set({
          quantity: existing.quantity + brick.quantity,
          lastModified: new Date(),
        })
        .where(eq(brickInventory.id, existing.id))
        .returning();
      addedEntries.push(updated);
    } else {
      // Create new entry
      const [created] = await db
        .insert(brickInventory)
        .values({
          userId,
          partNumber: brick.partNumber,
          colorId: brick.colorId,
          quantity: brick.quantity,
          status: "available",
          bagNumber: brick.bagNumber ?? null,
          sourceSetNumber: brick.sourceSetNumber ?? null,
        })
        .returning();
      addedEntries.push(created);
    }
  }

  res.status(201).json({
    success: true,
    message: `Added ${bricks.length} brick type(s) to inventory`,
    entries: addedEntries,
  });
});

/**
 * PATCH /api/inventory/:id
 * Updates a brick entry (quantity, status, bagNumber).
 */
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = req.params["id"] as string;
  const updates = req.body as UpdateBrickRequest;

  if (!id) {
    res.status(400).json({
      error: "validation_error",
      message: "Brick entry ID is required",
      statusCode: 400,
    });
    return;
  }

  // Verify ownership
  const [entry] = await db
    .select()
    .from(brickInventory)
    .where(and(eq(brickInventory.id, id), eq(brickInventory.userId, userId)))
    .limit(1);

  if (!entry) {
    res.status(404).json({
      error: "not_found",
      message: "Brick entry not found",
      statusCode: 404,
    });
    return;
  }

  // Build update object
  const updateFields: Record<string, unknown> = { lastModified: new Date() };

  if (updates.quantity !== undefined) {
    if (typeof updates.quantity !== "number" || updates.quantity < 1) {
      res.status(400).json({
        error: "validation_error",
        message: "Quantity must be a positive integer",
        statusCode: 400,
      });
      return;
    }
    updateFields["quantity"] = updates.quantity;
  }

  if (updates.status !== undefined) {
    const validStatuses = ["available", "in-use", "in-storage"];
    if (!validStatuses.includes(updates.status)) {
      res.status(400).json({
        error: "validation_error",
        message: "Status must be one of: available, in-use, in-storage",
        statusCode: 400,
      });
      return;
    }
    updateFields["status"] = updates.status;
  }

  if (updates.bagNumber !== undefined) {
    updateFields["bagNumber"] = updates.bagNumber;
  }

  const [updated] = await db
    .update(brickInventory)
    .set(updateFields)
    .where(eq(brickInventory.id, id))
    .returning();

  res.status(200).json(updated);
});

/**
 * DELETE /api/inventory/:id
 * Removes bricks (decrements quantity). Removes entry when quantity reaches 0.
 * Query param: quantity (default: removes all)
 * Rejects if removal exceeds available quantity.
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const id = req.params["id"] as string;
  const removeQuantity = Number(req.query["quantity"]) || undefined;

  // Verify ownership
  const [entry] = await db
    .select()
    .from(brickInventory)
    .where(and(eq(brickInventory.id, id), eq(brickInventory.userId, userId)))
    .limit(1);

  if (!entry) {
    res.status(404).json({
      error: "not_found",
      message: "Brick entry not found",
      statusCode: 404,
    });
    return;
  }

  // If no quantity specified, remove entire entry
  const quantityToRemove = removeQuantity ?? entry.quantity;

  if (quantityToRemove < 1) {
    res.status(400).json({
      error: "validation_error",
      message: "Quantity to remove must be at least 1",
      statusCode: 400,
    });
    return;
  }

  // Reject if removal exceeds available quantity
  if (quantityToRemove > entry.quantity) {
    res.status(400).json({
      error: "quantity_exceeded",
      message: `Cannot remove ${quantityToRemove} bricks. Only ${entry.quantity} available.`,
      statusCode: 400,
      maxAvailable: entry.quantity,
    });
    return;
  }

  if (quantityToRemove === entry.quantity) {
    // Remove entire entry
    await db
      .delete(brickInventory)
      .where(eq(brickInventory.id, id));

    res.status(200).json({
      success: true,
      message: "Brick entry removed from inventory",
      removed: true,
    });
  } else {
    // Decrement quantity
    const [updated] = await db
      .update(brickInventory)
      .set({
        quantity: entry.quantity - quantityToRemove,
        lastModified: new Date(),
      })
      .where(eq(brickInventory.id, id))
      .returning();

    res.status(200).json({
      success: true,
      message: `Removed ${quantityToRemove} brick(s)`,
      removed: false,
      entry: updated,
    });
  }
});

export default router;
