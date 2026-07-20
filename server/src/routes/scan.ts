import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
} from "express";
import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { catalogPart } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import { recognitionBackend } from "../services/recognition.js";
import type {
  ScanIdentifyRequest,
  ScanIdentifyResponse,
  IdentifiedBrick,
} from "shared";

// --- Constants ---

const SCAN_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// --- R2 Client Setup ---

function createR2Client(): S3Client {
  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 configuration missing: R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required",
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = createR2Client();
  }
  return r2Client;
}

function getBucketName(): string {
  const bucket = process.env["R2_BUCKET_NAME"];
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME environment variable is not set");
  }
  return bucket;
}

// --- Cached Result Interface ---

interface CachedScanResult {
  sessionId: string;
  identifiedBricks: IdentifiedBrick[];
  processingTimeMs: number;
  cachedAt: string;
}

// --- Helper Functions ---

/**
 * Compute SHA-256 hash of image data for cache key.
 */
function computeImageHash(imageBase64: string): string {
  return createHash("sha256").update(imageBase64).digest("hex");
}

/**
 * Check R2 for a cached recognition result by image hash.
 */
async function getCachedResult(
  hash: string,
): Promise<CachedScanResult | null> {
  try {
    const client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: getBucketName(),
      Key: `results/${hash}.json`,
    });

    const response = await client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as CachedScanResult;
  } catch (error: unknown) {
    // NoSuchKey or other errors mean cache miss
    const err = error as { name?: string };
    if (err.name === "NoSuchKey") return null;
    // Log but don't fail on cache errors
    console.error("R2 cache read error:", error);
    return null;
  }
}

/**
 * Store image in R2.
 */
async function storeImage(hash: string, imageBuffer: Buffer): Promise<void> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: `images/${hash}.jpeg`,
    Body: imageBuffer,
    ContentType: "image/jpeg",
    Metadata: {
      "cache-ttl": String(CACHE_TTL_SECONDS),
    },
  });

  await client.send(command);
}

/**
 * Cache recognition result in R2.
 */
async function cacheResult(
  hash: string,
  result: CachedScanResult,
): Promise<void> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: `results/${hash}.json`,
    Body: JSON.stringify(result),
    ContentType: "application/json",
    Metadata: {
      "cache-ttl": String(CACHE_TTL_SECONDS),
    },
  });

  await client.send(command);
}

/**
 * Validate identified part numbers against the local catalog.
 * Returns bricks with needsReview flag set if not found in catalog.
 */
async function validatePartNumbers(
  bricks: IdentifiedBrick[],
): Promise<IdentifiedBrick[]> {
  if (bricks.length === 0) return bricks;

  const partNumbers = [...new Set(bricks.map((b) => b.partNumber))];

  // Query catalog for valid part numbers
  const validParts = await db
    .select({ partNumber: catalogPart.partNumber })
    .from(catalogPart)
    .where(sql`${catalogPart.partNumber} = ANY(${partNumbers})`);

  const validPartSet = new Set<string>();
  for (const p of validParts) {
    validPartSet.add(p.partNumber);
  }

  return bricks.map((brick) => ({
    ...brick,
    // Keep the brick but mark it as needing review if not in catalog
    needsReview: brick.needsReview || !validPartSet.has(brick.partNumber),
  }));
}

/**
 * Execute recognition with timeout.
 */
async function identifyWithTimeout(
  imageBuffer: Buffer,
  options: { maxParts?: number; minConfidence?: number },
): Promise<{ parts: IdentifiedBrick[]; processingTimeMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      recognitionBackend.identify(imageBuffer, options),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("Recognition service timeout"));
        });
      }),
    ]);

    const identifiedBricks: IdentifiedBrick[] = result.parts.map((part) => ({
      partNumber: part.partNumber,
      colorId: part.colorId,
      colorName: part.colorName,
      quantity: part.quantity,
      confidence: part.confidence,
      needsReview: part.confidence < 0.7,
    }));

    return {
      parts: identifiedBricks,
      processingTimeMs: result.processingTimeMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// --- Router ---

const router: RouterType = Router();

// All scan routes require authentication
router.use(authenticate);

/**
 * POST /api/scan/identify
 * Accepts a base64 image, identifies bricks using AI recognition with R2 caching.
 */
router.post(
  "/identify",
  async (req: Request, res: Response): Promise<void> => {
    const { image, maxParts, minConfidence } =
      req.body as ScanIdentifyRequest;

    // Validate request
    if (!image || typeof image !== "string") {
      res.status(400).json({
        error: "validation_error",
        message: "image field is required and must be a base64 encoded string",
        statusCode: 400,
      });
      return;
    }

    // Compute image hash for cache lookup
    const imageHash = computeImageHash(image);
    const sessionId = randomUUID();
    const startTime = Date.now();

    // Check cache
    try {
      const cached = await getCachedResult(imageHash);
      if (cached) {
        const response: ScanIdentifyResponse = {
          sessionId,
          identifiedBricks: cached.identifiedBricks,
          processingTimeMs: cached.processingTimeMs,
          cached: true,
        };
        res.status(200).json(response);
        return;
      }
    } catch {
      // Cache check failed, proceed without cache
    }

    // Decode base64 image
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(image, "base64");
    } catch {
      res.status(400).json({
        error: "validation_error",
        message: "Invalid base64 image data",
        statusCode: 400,
      });
      return;
    }

    // Store image in R2 (fire and forget, don't block on this)
    storeImage(imageHash, imageBuffer).catch((err) => {
      console.error("Failed to store image in R2:", err);
    });

    // Call recognition service with timeout
    let identifiedBricks: IdentifiedBrick[];
    let processingTimeMs: number;

    try {
      const result = await identifyWithTimeout(imageBuffer, {
        maxParts,
        minConfidence,
      });
      identifiedBricks = result.parts;
      processingTimeMs = result.processingTimeMs;
    } catch (error: unknown) {
      const err = error as Error;

      if (err.message === "Recognition service timeout") {
        res.status(503).json({
          error: "service_timeout",
          message:
            "Recognition service did not respond within 10 seconds. Please try again.",
          statusCode: 503,
        });
        return;
      }

      // Service unavailable (Requirement 1.8)
      res.status(503).json({
        error: "service_unavailable",
        message:
          "Recognition service is temporarily unavailable. Please retry or cancel the scan session.",
        statusCode: 503,
      });
      return;
    }

    // No bricks detected (Requirement 1.9)
    if (identifiedBricks.length === 0) {
      const response: ScanIdentifyResponse = {
        sessionId,
        identifiedBricks: [],
        processingTimeMs: Date.now() - startTime,
        cached: false,
      };
      res.status(200).json(response);
      return;
    }

    // Validate part numbers against local catalog
    identifiedBricks = await validatePartNumbers(identifiedBricks);

    processingTimeMs = Date.now() - startTime;

    // Cache the result in R2 (fire and forget)
    const cachedResult: CachedScanResult = {
      sessionId,
      identifiedBricks,
      processingTimeMs,
      cachedAt: new Date().toISOString(),
    };
    cacheResult(imageHash, cachedResult).catch((err) => {
      console.error("Failed to cache result in R2:", err);
    });

    const response: ScanIdentifyResponse = {
      sessionId,
      identifiedBricks,
      processingTimeMs,
      cached: false,
    };

    res.status(200).json(response);
  },
);

export default router;
