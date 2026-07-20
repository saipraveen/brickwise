import { type Router as RouterType, Router, type Request, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getPurchaseOptions,
  generateBrickLinkWantedListXml,
  generateWobrickBulkUrl,
} from "../services/marketplaceClient.js";
import type { MissingPart } from "shared";

const router: RouterType = Router();

// All marketplace routes require authentication
router.use(authenticate);

/**
 * POST /api/marketplace/missing-parts
 * Accepts an array of missing parts (from coverage calculation) and returns:
 * - Purchase options for each part (BrickLink, BrickOwl, Wobrick URLs + pricing stubs)
 * - BrickLink Wanted List XML download link
 * - Wobrick bulk order URL
 *
 * Requirements: Design (Buy Missing Parts)
 */
router.post("/missing-parts", (req: Request, res: Response): void => {
  const { missingParts } = req.body as { missingParts?: MissingPart[] };

  if (!missingParts || !Array.isArray(missingParts) || missingParts.length === 0) {
    res.status(400).json({
      error: "validation_error",
      message: "missingParts array is required and must not be empty",
      statusCode: 400,
    });
    return;
  }

  // Validate each missing part has required fields
  for (const part of missingParts) {
    if (!part.partNumber || part.colorId == null || part.quantityNeeded == null) {
      res.status(400).json({
        error: "validation_error",
        message: "Each missing part must have partNumber, colorId, and quantityNeeded",
        statusCode: 400,
      });
      return;
    }
  }

  // Get purchase options for each part across all marketplaces
  const purchaseOptions = getPurchaseOptions(missingParts);

  // Generate BrickLink Wanted List XML download URL (points to our GET endpoint)
  const wantedListUrl = "/api/marketplace/wanted-list";

  // Generate Wobrick bulk order URL
  const wobrickBulkUrl = generateWobrickBulkUrl(missingParts);

  res.status(200).json({
    purchaseOptions,
    wantedListUrl,
    wobrickBulkUrl,
    totalMissingParts: missingParts.length,
  });
});

/**
 * GET /api/marketplace/wanted-list
 * Returns BrickLink Wanted List XML as downloadable content.
 * Accepts parts as a JSON-encoded query parameter.
 *
 * Query params:
 *   parts (string) - JSON-encoded array of MissingPart objects
 *
 * Requirements: Design (Buy Missing Parts)
 */
router.get("/wanted-list", (req: Request, res: Response): void => {
  const partsParam = req.query["parts"] as string | undefined;

  if (!partsParam) {
    res.status(400).json({
      error: "validation_error",
      message: "parts query parameter is required (JSON-encoded MissingPart array)",
      statusCode: 400,
    });
    return;
  }

  let missingParts: MissingPart[];
  try {
    missingParts = JSON.parse(partsParam) as MissingPart[];
  } catch {
    res.status(400).json({
      error: "validation_error",
      message: "parts query parameter must be valid JSON",
      statusCode: 400,
    });
    return;
  }

  if (!Array.isArray(missingParts) || missingParts.length === 0) {
    res.status(400).json({
      error: "validation_error",
      message: "parts must be a non-empty array",
      statusCode: 400,
    });
    return;
  }

  const xml = generateBrickLinkWantedListXml(missingParts);

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", "attachment; filename=\"wanted-list.xml\"");
  res.status(200).send(xml);
});

export default router;
