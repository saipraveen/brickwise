// Recognition domain types

/** Bounding box coordinates for an identified brick in the image */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A brick identified by the recognition service */
export interface IdentifiedBrick {
  partNumber: string;
  colorId: number;
  colorName: string;
  quantity: number;
  confidence: number; // 0.0 to 1.0
  boundingBox?: BoundingBox;
  needsReview: boolean; // true if confidence < 0.7
}

/** Result of a scan session containing identified bricks */
export interface ScanResult {
  sessionId: string;
  identifiedBricks: IdentifiedBrick[];
  processingTimeMs: number;
}

/** A part recognized by the AI model */
export interface RecognizedPart {
  partNumber: string;
  colorId: number;
  colorName: string;
  quantity: number;
  confidence: number;
  alternatives?: AlternativePart[];
}

/** An alternative identification for an ambiguous part */
export interface AlternativePart {
  partNumber: string;
  colorId: number;
  confidence: number;
}

/** Result returned by the recognition backend */
export interface RecognitionResult {
  parts: RecognizedPart[];
  processingTimeMs: number;
  modelVersion: string;
}

/** Options for the recognition backend */
export interface RecognitionOptions {
  maxParts?: number;
  minConfidence?: number;
  includeAlternatives?: boolean;
}

/** A captured image from the camera module */
export interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
  timestamp: Date;
}

/** Health status of a service */
export interface ServiceStatus {
  available: boolean;
  latencyMs?: number;
  lastChecked: Date;
  error?: string;
}
