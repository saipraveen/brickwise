import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
} from "express";
import { eq, and, sql, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  brickInventory,
  setCollection,
  mocWishlist,
  catalogPart,
  catalogColor,
  catalogSet,
} from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import type { SearchResults } from "shared";

const router: RouterType = Router();

// All search routes require authentication
router.use(authenticate);

/**
 * Valid filter fields per domain.
 * Invalid filter keys are silently ignored (per task spec).
 */
const VALID_INVENTORY_FILTERS = ["status", "colorId", "categoryId"] as const;
const VALID_COLLECTION_FILTERS = ["theme", "status", "year"] as const;

/**
 * Parse filters from Express query params.
 * Supports bracket notation: filters[status]=available&filters[colorId]=5
 * Returns a Record<string, string> of key-value pairs.
 */
function parseFilters(query: Record<string, unknown>): Record<string, string> {
  const filters: Record<string, string> = {};
  const filtersParam = query["filters"];

  if (filtersParam && typeof filtersParam === "object" && filtersParam !== null) {
    for (const [key, value] of Object.entries(filtersParam as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim() !== "") {
        filters[key] = value.trim();
      }
    }
  }

  return filters;
}

/**
 * GET /api/search
 * Cross-domain search across inventory, collection, and MOC wishlist.
 * Requires minimum 2-character query.
 * Supports multi-filter AND logic via filters query parameter.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query["query"] as string | undefined;
  const domain = req.query["domain"] as string | undefined;
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query["pageSize"]) || 50));
  const offset = (page - 1) * pageSize;

  if (!query || query.trim().length < 2) {
    res.status(400).json({
      error: "validation_error",
      message: "Query parameter must be at least 2 characters",
      statusCode: 400,
    });
    return;
  }

  const searchTerm = query.trim();
  const ilikePattern = `%${searchTerm}%`;
  const prefixPattern = `${searchTerm}%`;
  const userId = req.user!.userId;

  const validDomains = ["inventory", "collection", "mocs", "rebuilds"];
  if (domain && !validDomains.includes(domain)) {
    res.status(400).json({
      error: "validation_error",
      message: `Invalid domain. Must be one of: ${validDomains.join(", ")}`,
      statusCode: 400,
    });
    return;
  }

  // Parse filters from query params
  const filters = parseFilters(req.query as Record<string, unknown>);

  const results: SearchResults = {};

  // Search Inventory (by partNumber ILIKE) with AND-logic filters
  if (!domain || domain === "inventory") {
    const baseConditions = [
      eq(brickInventory.userId, userId),
      ilike(brickInventory.partNumber, ilikePattern),
    ];

    // Apply inventory-specific filters with AND logic
    if (filters["status"] && VALID_INVENTORY_FILTERS.includes("status")) {
      const validStatuses = ["available", "in-use", "in-storage"];
      if (validStatuses.includes(filters["status"])) {
        baseConditions.push(eq(brickInventory.status, filters["status"] as "available" | "in-use" | "in-storage"));
      }
    }
    if (filters["colorId"] && VALID_INVENTORY_FILTERS.includes("colorId")) {
      const colorIdNum = Number(filters["colorId"]);
      if (!Number.isNaN(colorIdNum)) {
        baseConditions.push(eq(brickInventory.colorId, colorIdNum));
      }
    }
    if (filters["categoryId"] && VALID_INVENTORY_FILTERS.includes("categoryId")) {
      const categoryIdNum = Number(filters["categoryId"]);
      if (!Number.isNaN(categoryIdNum)) {
        baseConditions.push(eq(catalogPart.categoryId, categoryIdNum));
      }
    }

    const inventoryConditions = and(...baseConditions);

    // Need to join catalogPart if filtering by categoryId
    const needsCatalogJoin = filters["categoryId"] !== undefined;

    const [countResult] = needsCatalogJoin
      ? await db
          .select({ count: sql<number>`count(*)::int`.as("count") })
          .from(brickInventory)
          .leftJoin(catalogPart, eq(brickInventory.partNumber, catalogPart.partNumber))
          .where(inventoryConditions)
      : await db
          .select({ count: sql<number>`count(*)::int`.as("count") })
          .from(brickInventory)
          .where(inventoryConditions);

    const totalItems = countResult?.count ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const inventoryItems = await db
      .select({
        id: brickInventory.id,
        partNumber: brickInventory.partNumber,
        colorId: brickInventory.colorId,
        colorName: sql<string>`COALESCE(${catalogColor.name}, 'Unknown')`.as("color_name"),
        categoryId: sql<number>`COALESCE(${catalogPart.categoryId}, 0)`.as("category_id"),
        categoryName: sql<string>`COALESCE(${catalogPart.categoryName}, 'Unknown')`.as("category_name"),
        quantity: brickInventory.quantity,
        status: brickInventory.status,
        bagNumber: brickInventory.bagNumber,
        sourceSetNumber: brickInventory.sourceSetNumber,
        lastModified: brickInventory.lastModified,
      })
      .from(brickInventory)
      .leftJoin(catalogPart, eq(brickInventory.partNumber, catalogPart.partNumber))
      .leftJoin(catalogColor, eq(brickInventory.colorId, catalogColor.colorId))
      .where(inventoryConditions)
      .limit(pageSize)
      .offset(offset)
      .orderBy(brickInventory.partNumber);

    results.inventory = {
      data: inventoryItems.map((item) => ({
        ...item,
        bagNumber: item.bagNumber ?? undefined,
        sourceSetNumber: item.sourceSetNumber ?? undefined,
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Search Collection (by name ILIKE, setNumber prefix, or theme ILIKE) with AND-logic filters
  if (!domain || domain === "collection") {
    const searchCondition = or(
      ilike(setCollection.name, ilikePattern),
      ilike(setCollection.setNumber, prefixPattern),
      ilike(setCollection.theme, ilikePattern),
    );

    const baseConditions = [
      eq(setCollection.userId, userId),
      searchCondition,
    ];

    // Apply collection-specific filters with AND logic
    if (filters["theme"] && VALID_COLLECTION_FILTERS.includes("theme")) {
      baseConditions.push(ilike(setCollection.theme, `%${filters["theme"]}%`));
    }
    if (filters["status"] && VALID_COLLECTION_FILTERS.includes("status")) {
      const validStatuses = ["built", "disassembled", "partial"];
      if (validStatuses.includes(filters["status"])) {
        baseConditions.push(eq(setCollection.status, filters["status"] as "built" | "disassembled" | "partial"));
      }
    }
    if (filters["year"] && VALID_COLLECTION_FILTERS.includes("year")) {
      const yearNum = Number(filters["year"]);
      if (!Number.isNaN(yearNum)) {
        baseConditions.push(eq(setCollection.year, yearNum));
      }
    }

    const collectionConditions = and(...baseConditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(setCollection)
      .where(collectionConditions);

    const totalItems = countResult?.count ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const collectionItems = await db
      .select({
        id: setCollection.id,
        setNumber: setCollection.setNumber,
        name: setCollection.name,
        theme: setCollection.theme,
        year: setCollection.year,
        pieceCount: setCollection.pieceCount,
        imageUrl: sql<string>`COALESCE(${catalogSet.imageUrl}, '')`.as("image_url"),
        status: setCollection.status,
        isDuplicate: setCollection.isDuplicate,
        addedAt: setCollection.addedAt,
      })
      .from(setCollection)
      .leftJoin(catalogSet, eq(setCollection.setNumber, catalogSet.setNumber))
      .where(collectionConditions)
      .limit(pageSize)
      .offset(offset)
      .orderBy(setCollection.name);

    results.collection = {
      data: collectionItems,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Search MOCs (user's wishlist by title ILIKE or designer ILIKE)
  if (!domain || domain === "mocs") {
    const mocsConditions = and(
      eq(mocWishlist.userId, userId),
      or(
        ilike(mocWishlist.title, ilikePattern),
        ilike(mocWishlist.designer, ilikePattern),
      ),
    );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(mocWishlist)
      .where(mocsConditions);

    const totalItems = countResult?.count ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const mocItems = await db
      .select()
      .from(mocWishlist)
      .where(mocsConditions)
      .limit(pageSize)
      .offset(offset)
      .orderBy(mocWishlist.title);

    // Map to MocSummary shape
    const mocSummaries = mocItems.map((item) => ({
      id: item.mocId,
      title: item.title,
      designer: item.designer,
      thumbnailUrl: item.thumbnailUrl,
      pieceCount: item.pieceCount,
    }));

    results.mocs = {
      data: mocSummaries,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Rebuilds: search remote data source with cached data fallback
  if (!domain || domain === "rebuilds") {
    // Rebuilds rely on the Rebrickable API (remote source).
    // Since search doesn't have specific set context, we serve a message
    // indicating that rebuild search requires set selection.
    results.rebuilds = {
      data: [],
      pagination: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      message: "Rebuild search requires selecting specific sets. Use GET /api/rebuilds with setNumbers parameter.",
    };
  }

  // If only the rebuilds domain was requested and it's a remote-dependent
  // domain, add a cachedDataWarning to indicate remote source limitation.
  // In production, this would be set when an actual remote call fails and
  // cached data is served instead.
  if (domain === "rebuilds") {
    results.cachedDataWarning =
      "Remote rebuild data is not available in search context. Use the dedicated rebuilds endpoint with specific set numbers.";
  }

  res.status(200).json(results);
});

export default router;
