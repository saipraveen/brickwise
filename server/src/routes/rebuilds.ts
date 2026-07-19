import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
} from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { brickInventory } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import { getRebrickableClient } from "../services/rebrickableClient.js";
import { calculateCoverage } from "../services/partCoverage.js";
import type {
  RebuildIdeaSummary,
  DifficultyLevel,
  BrickEntry,
  RequiredPart,
} from "shared";

const router: RouterType = Router();

// All rebuild routes require authentication
router.use(authenticate);

/**
 * Determine difficulty level based on piece count.
 * Rebrickable does not always provide difficulty - we infer it from piece count.
 */
function inferDifficulty(pieceCount: number): DifficultyLevel {
  if (pieceCount <= 100) return "Beginner";
  if (pieceCount <= 500) return "Intermediate";
  return "Advanced";
}

/**
 * GET /api/rebuilds
 * Returns alternative rebuild ideas for selected sets.
 * Query params:
 *   - setNumbers: comma-separated set numbers (up to 10)
 *   - theme: optional theme filter
 *   - difficulty: optional difficulty filter (Beginner, Intermediate, Advanced)
 *   - minCoverage: optional minimum coverage percentage (50-100, default 50)
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  // Parse query params
  const setNumbersParam = req.query["setNumbers"] as string | undefined;
  const themeFilter = req.query["theme"] as string | undefined;
  const difficultyFilter = req.query["difficulty"] as DifficultyLevel | undefined;
  const minCoverageParam = req.query["minCoverage"] as string | undefined;

  // Validate setNumbers
  if (!setNumbersParam || setNumbersParam.trim() === "") {
    res.status(400).json({
      error: "validation_error",
      message: "setNumbers query parameter is required",
      statusCode: 400,
    });
    return;
  }

  const setNumbers = setNumbersParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (setNumbers.length === 0) {
    res.status(400).json({
      error: "validation_error",
      message: "At least one set number is required",
      statusCode: 400,
    });
    return;
  }

  if (setNumbers.length > 10) {
    res.status(400).json({
      error: "validation_error",
      message: "Maximum of 10 set numbers allowed",
      statusCode: 400,
    });
    return;
  }

  // Validate difficulty filter
  const validDifficulties: DifficultyLevel[] = ["Beginner", "Intermediate", "Advanced"];
  if (difficultyFilter && !validDifficulties.includes(difficultyFilter)) {
    res.status(400).json({
      error: "validation_error",
      message: "difficulty must be one of: Beginner, Intermediate, Advanced",
      statusCode: 400,
    });
    return;
  }

  // Validate minCoverage
  let minCoverage = 50;
  if (minCoverageParam !== undefined) {
    minCoverage = Number(minCoverageParam);
    if (Number.isNaN(minCoverage) || minCoverage < 50 || minCoverage > 100) {
      res.status(400).json({
        error: "validation_error",
        message: "minCoverage must be a number between 50 and 100",
        statusCode: 400,
      });
      return;
    }
  }

  try {
    const client = getRebrickableClient();

    // Fetch the user's available inventory
    const inventoryRows = await db
      .select()
      .from(brickInventory)
      .where(eq(brickInventory.userId, userId));

    // Convert to BrickEntry format for coverage calculation
    const availableInventory: BrickEntry[] = inventoryRows.map((row) => ({
      id: row.id,
      partNumber: row.partNumber,
      colorId: row.colorId,
      colorName: "", // Not needed for coverage calc key
      categoryId: 0,
      categoryName: "",
      quantity: row.quantity,
      status: row.status as BrickEntry["status"],
      bagNumber: row.bagNumber ?? undefined,
      sourceSetNumber: row.sourceSetNumber ?? undefined,
      lastModified: row.lastModified,
    }));

    // Fetch alternates for each set in parallel
    const alternatePromises = setNumbers.map((setNum) =>
      client.fetchAlternates(setNum).catch(() => []),
    );
    const alternateResults = await Promise.all(alternatePromises);

    // Deduplicate alternates by set number
    const seenSetNumbers = new Set<string>();
    const allAlternates = alternateResults.flat().filter((alt) => {
      if (seenSetNumbers.has(alt.setNumber)) return false;
      seenSetNumbers.add(alt.setNumber);
      return true;
    });

    // For each alternate, fetch its parts and calculate coverage
    const rebuildResults: RebuildIdeaSummary[] = [];

    // Process alternates in batches to respect rate limits
    for (const alternate of allAlternates) {
      try {
        const parts = await client.fetchSetParts(alternate.setNumber);

        // Convert to RequiredPart format
        const requiredParts: RequiredPart[] = parts
          .filter((p) => !p.isSpare)
          .map((p) => ({
            partNumber: p.partNumber,
            colorId: p.colorId,
            quantity: p.quantity,
          }));

        // Calculate coverage against user's inventory
        const coverage = calculateCoverage(requiredParts, availableInventory);

        // Only include if meets minimum coverage
        if (coverage.percentage < minCoverage) continue;

        const difficulty = inferDifficulty(alternate.pieceCount);

        // Apply filters
        if (themeFilter && alternate.theme !== themeFilter) continue;
        if (difficultyFilter && difficulty !== difficultyFilter) continue;

        rebuildResults.push({
          id: alternate.setNumber,
          title: alternate.name,
          imageUrl: alternate.imageUrl,
          coveragePercentage: coverage.percentage,
          difficulty,
          theme: alternate.theme,
        });
      } catch {
        // Skip alternates that fail to fetch parts
        continue;
      }
    }

    // Sort by coverage descending
    rebuildResults.sort((a, b) => b.coveragePercentage - a.coveragePercentage);

    res.status(200).json({
      data: rebuildResults,
      totalResults: rebuildResults.length,
      ...(rebuildResults.length === 0 && {
        message:
          "No rebuild ideas meet the minimum coverage threshold. Try selecting additional sets to expand available bricks.",
      }),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Rebuild ideas fetch error:", err.message);
    res.status(503).json({
      error: "service_unavailable",
      message: "Unable to fetch rebuild ideas. Please try again later.",
      statusCode: 503,
    });
  }
});

export default router;
