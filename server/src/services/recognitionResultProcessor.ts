import type { RecognitionResult, IdentifiedBrick } from "shared";

/** Confidence threshold below which bricks are flagged for manual review */
const CONFIDENCE_REVIEW_THRESHOLD = 0.7;

/**
 * Transforms a raw RecognitionResult from the AI backend into
 * client-facing IdentifiedBrick[] with review flagging.
 *
 * Bricks with confidence strictly less than 0.70 are flagged as needsReview: true.
 * All other fields (partNumber, colorId, colorName, quantity, confidence, boundingBox)
 * are preserved as-is.
 */
export function processRecognitionResult(
  result: RecognitionResult,
): IdentifiedBrick[] {
  return result.parts.map((part) => ({
    partNumber: part.partNumber,
    colorId: part.colorId,
    colorName: part.colorName,
    quantity: part.quantity,
    confidence: part.confidence,
    needsReview: part.confidence < CONFIDENCE_REVIEW_THRESHOLD,
  }));
}
