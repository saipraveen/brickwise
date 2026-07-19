import { type Router as RouterType, Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { setCollection, brickInventory } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import { getRebrickableClient } from "../services/rebrickableClient.js";
import { calculateCoverage } from "../services/partCoverage.js";
import type {
  MocSummary,
  MocDetail,
  BuildabilityResponse,
  PaginatedResponse,
  RequiredPart,
  BrickEntry,
} from "shared";

const router: RouterType = Router();

// All MOC routes require authentication
router.use(authenticate);

/**
 * GET /api/mocs
 * Browse alternate builds (MOCs) sourced from Rebrickable based on the user's owned sets.
 * Supports pagination (max 50 per page) and theme filtering.
 * Sorts by Part_Coverage descending when the user has inventory.
 *
 * Query params:
 *   page (number, default 1)
 *   pageSize (number, default 20, max 50)
 *   theme (string, optional filter)
 *
 * Requirements: 5.1, 5.2, 5.6
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const page = Math.max(1, Number(req.query["page"]) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query["pageSize"]) || 20));
  const themeFilter = req.query["theme"] as string | undefined;

  // Get the user's owned sets (disassembled sets have available bricks)
  const userSets = await db
    .select({ setNumber: setCollection.setNumber })
    .from(setCollection)
    .where(eq(setCollection.userId, userId));

  if (userSets.length === 0) {
    const emptyResponse: PaginatedResponse<MocSummary> = {
      data: [],
      pagination: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    res.status(200).json(emptyResponse);
    return;
  }

  // Fetch alternates from Rebrickable for the user's sets
  const rebrickable = getRebrickableClient();
  const allAlternates: MocSummary[] = [];

  try {
    for (const userSet of userSets) {
      const { results } = await rebrickable.fetchSetAlternatesPaginated(
        userSet.setNumber,
        1,
        100, // Fetch more per set to aggregate
      );

      for (const alt of results) {
        allAlternates.push({
          id: alt.id,
          title: alt.title,
          designer: alt.designer,
          thumbnailUrl: alt.thumbnailUrl,
          pieceCount: alt.pieceCount,
          theme: alt.theme,
        });
      }
    }
  } catch (error: unknown) {
    res.status(503).json({
      error: "service_unavailable",
      message: "MOC data cannot be loaded from Rebrickable. Please retry.",
      statusCode: 503,
    });
    return;
  }

  // Deduplicate by ID
  const uniqueMap = new Map<string, MocSummary>();
  for (const moc of allAlternates) {
    if (!uniqueMap.has(moc.id)) {
      uniqueMap.set(moc.id, moc);
    }
  }
  let filteredMocs = Array.from(uniqueMap.values());

  // Apply theme filter (Requirement 5.2)
  if (themeFilter) {
    filteredMocs = filteredMocs.filter(
      (moc) => moc.theme?.toLowerCase() === themeFilter.toLowerCase(),
    );
  }

  // Calculate Part_Coverage for sorting (Requirement 5.6)
  const userInventory = await db
    .select({
      id: brickInventory.id,
      partNumber: brickInventory.partNumber,
      colorId: brickInventory.colorId,
      quantity: brickInventory.quantity,
      status: brickInventory.status,
    })
    .from(brickInventory)
    .where(
      and(
        eq(brickInventory.userId, userId),
        eq(brickInventory.status, "available"),
      ),
    );

  if (userInventory.length > 0) {
    // Build BrickEntry-compatible array for the coverage calculator
    const inventoryEntries: BrickEntry[] = userInventory.map((inv) => ({
      id: inv.id,
      partNumber: inv.partNumber,
      colorId: inv.colorId,
      colorName: "",
      categoryId: 0,
      categoryName: "",
      quantity: inv.quantity,
      status: inv.status as BrickEntry["status"],
      lastModified: new Date(),
    }));

    // For each MOC, fetch parts and calculate coverage
    for (const moc of filteredMocs) {
      try {
        const parts = await rebrickable.fetchAlternateParts(moc.id);
        const requiredParts: RequiredPart[] = parts
          .filter((p) => !p.isSpare)
          .map((p) => ({
            partNumber: p.partNumber,
            colorId: p.colorId,
            quantity: p.quantity,
          }));

        const coverage = calculateCoverage(requiredParts, inventoryEntries);
        moc.coveragePercentage = coverage.percentage;
      } catch {
        // If we can't fetch parts for a specific MOC, leave coverage undefined
        moc.coveragePercentage = undefined;
      }
    }

    // Sort by Part_Coverage descending (undefined coverage goes last)
    filteredMocs.sort((a, b) => {
      const aCov = a.coveragePercentage ?? -1;
      const bCov = b.coveragePercentage ?? -1;
      return bCov - aCov;
    });
  }

  // Paginate results
  const totalItems = filteredMocs.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const paginatedData = filteredMocs.slice(startIndex, startIndex + pageSize);

  const response: PaginatedResponse<MocSummary> = {
    data: paginatedData,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };

  res.status(200).json(response);
});

/**
 * GET /api/mocs/:id
 * Get details for a specific alternate build (MOC), including required parts list.
 *
 * Requirements: 5.3
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const mocId = req.params["id"] as string;

  if (!mocId) {
    res.status(400).json({
      error: "validation_error",
      message: "MOC ID is required",
      statusCode: 400,
    });
    return;
  }

  const rebrickable = getRebrickableClient();

  try {
    // Fetch MOC details
    const detail = await rebrickable.fetchAlternateBuildDetail(mocId);

    if (!detail) {
      res.status(404).json({
        error: "not_found",
        message: `MOC ${mocId} not found`,
        statusCode: 404,
      });
      return;
    }

    // Fetch parts list
    const parts = await rebrickable.fetchAlternateParts(mocId);
    const requiredParts: RequiredPart[] = parts
      .filter((p) => !p.isSpare)
      .map((p) => ({
        partNumber: p.partNumber,
        colorId: p.colorId,
        quantity: p.quantity,
      }));

    const response: MocDetail = {
      id: detail.id,
      title: detail.title,
      designer: detail.designer,
      thumbnailUrl: detail.thumbnailUrl,
      pieceCount: detail.pieceCount,
      theme: detail.theme,
      instructionsUrl: detail.instructionsUrl,
      requiredParts,
    };

    res.status(200).json(response);
  } catch {
    res.status(503).json({
      error: "service_unavailable",
      message: "MOC data cannot be loaded from Rebrickable. Please retry.",
      statusCode: 503,
    });
  }
});

/**
 * GET /api/mocs/:id/buildability
 * Calculate and return Part_Coverage for a specific MOC against the user's inventory.
 *
 * Requirements: 5.4, 5.5
 */
router.get("/:id/buildability", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const mocId = req.params["id"] as string;

  if (!mocId) {
    res.status(400).json({
      error: "validation_error",
      message: "MOC ID is required",
      statusCode: 400,
    });
    return;
  }

  const rebrickable = getRebrickableClient();

  // Fetch the MOC's required parts
  let requiredParts: RequiredPart[];
  try {
    const parts = await rebrickable.fetchAlternateParts(mocId);
    if (parts.length === 0) {
      res.status(404).json({
        error: "not_found",
        message: `Parts list for MOC ${mocId} not found`,
        statusCode: 404,
      });
      return;
    }

    requiredParts = parts
      .filter((p) => !p.isSpare)
      .map((p) => ({
        partNumber: p.partNumber,
        colorId: p.colorId,
        quantity: p.quantity,
      }));
  } catch {
    res.status(503).json({
      error: "service_unavailable",
      message: "MOC data cannot be loaded from Rebrickable. Please retry.",
      statusCode: 503,
    });
    return;
  }

  // Get user's available inventory
  const userInventory = await db
    .select({
      id: brickInventory.id,
      partNumber: brickInventory.partNumber,
      colorId: brickInventory.colorId,
      quantity: brickInventory.quantity,
      status: brickInventory.status,
    })
    .from(brickInventory)
    .where(eq(brickInventory.userId, userId));

  // Build BrickEntry-compatible array
  const inventoryEntries: BrickEntry[] = userInventory.map((inv) => ({
    id: inv.id,
    partNumber: inv.partNumber,
    colorId: inv.colorId,
    colorName: "",
    categoryId: 0,
    categoryName: "",
    quantity: inv.quantity,
    status: inv.status as BrickEntry["status"],
    lastModified: new Date(),
  }));

  // Calculate coverage
  const coverage = calculateCoverage(requiredParts, inventoryEntries);

  const response: BuildabilityResponse = {
    mocId,
    coverage,
  };

  res.status(200).json(response);
});

export default router;
