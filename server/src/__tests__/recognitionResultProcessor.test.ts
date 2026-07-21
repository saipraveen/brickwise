import { describe, it, expect } from "vitest";
import { processRecognitionResult } from "../services/recognitionResultProcessor.js";
import type { RecognitionResult } from "shared";

describe("processRecognitionResult", () => {
  it("flags bricks with confidence < 0.70 as needsReview: true", () => {
    const result: RecognitionResult = {
      parts: [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantity: 2,
          confidence: 0.69,
        },
      ],
      processingTimeMs: 500,
      modelVersion: "claude-3-haiku",
    };

    const bricks = processRecognitionResult(result);

    expect(bricks).toHaveLength(1);
    expect(bricks[0]!.needsReview).toBe(true);
  });

  it("does not flag bricks with confidence >= 0.70 for review", () => {
    const result: RecognitionResult = {
      parts: [
        {
          partNumber: "3003",
          colorId: 1,
          colorName: "White",
          quantity: 1,
          confidence: 0.7,
        },
        {
          partNumber: "3010",
          colorId: 4,
          colorName: "Blue",
          quantity: 3,
          confidence: 0.95,
        },
      ],
      processingTimeMs: 300,
      modelVersion: "claude-3-haiku",
    };

    const bricks = processRecognitionResult(result);

    expect(bricks).toHaveLength(2);
    expect(bricks[0]!.needsReview).toBe(false);
    expect(bricks[1]!.needsReview).toBe(false);
  });

  it("preserves all fields from the recognized part", () => {
    const result: RecognitionResult = {
      parts: [
        {
          partNumber: "3622",
          colorId: 11,
          colorName: "Dark Bluish Gray",
          quantity: 4,
          confidence: 0.85,
        },
      ],
      processingTimeMs: 200,
      modelVersion: "claude-3-sonnet",
    };

    const bricks = processRecognitionResult(result);

    expect(bricks[0]!).toEqual({
      partNumber: "3622",
      colorId: 11,
      colorName: "Dark Bluish Gray",
      quantity: 4,
      confidence: 0.85,
      needsReview: false,
    });
  });

  it("returns an empty array when no parts are recognized", () => {
    const result: RecognitionResult = {
      parts: [],
      processingTimeMs: 100,
      modelVersion: "claude-3-haiku",
    };

    const bricks = processRecognitionResult(result);

    expect(bricks).toEqual([]);
  });

  it("correctly handles the boundary at exactly 0.70", () => {
    const result: RecognitionResult = {
      parts: [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantity: 1,
          confidence: 0.7,
        },
        {
          partNumber: "3002",
          colorId: 5,
          colorName: "Red",
          quantity: 1,
          confidence: 0.6999,
        },
      ],
      processingTimeMs: 200,
      modelVersion: "claude-3-haiku",
    };

    const bricks = processRecognitionResult(result);

    expect(bricks[0]!.needsReview).toBe(false); // exactly 0.70
    expect(bricks[1]!.needsReview).toBe(true); // just below 0.70
  });
});
