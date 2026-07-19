import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import sharp from "sharp";
import type {
  RecognitionResult,
  RecognitionOptions,
  RecognizedPart,
} from "shared";

// --- Interfaces ---

export interface HealthStatus {
  available: boolean;
  latencyMs?: number;
  lastChecked: Date;
  error?: string;
}

export interface RecognitionBackend {
  identify(
    image: Buffer,
    options?: RecognitionOptions,
  ): Promise<RecognitionResult>;
  getServiceHealth(): Promise<HealthStatus>;
}

// --- Constants ---

const HAIKU_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
const SONNET_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const MAX_IMAGE_DIMENSION = 1024;
const BEDROCK_TIMEOUT_MS = 10_000;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

// --- Image Preprocessing ---

/**
 * Resize an image buffer so its longest dimension is at most MAX_IMAGE_DIMENSION pixels.
 * If the image is already within bounds, returns the original buffer.
 * Output format is JPEG for consistent size and Bedrock compatibility.
 */
export async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
    // Convert to JPEG even if no resize needed, for consistency
    return sharp(imageBuffer).jpeg({ quality: 85 }).toBuffer();
  }

  return sharp(imageBuffer)
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: "inside" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// --- Prompt Construction ---

function buildIdentificationPrompt(options?: RecognitionOptions): string {
  const maxParts = options?.maxParts ?? 100;
  const minConfidence = options?.minConfidence ?? 0.0;
  const includeAlternatives = options?.includeAlternatives ?? false;

  return `You are an expert LEGO brick identification system. Analyze the image and identify all visible LEGO bricks/elements.

For each brick you identify, provide:
- partNumber: The official LEGO part number (e.g., "3001", "3003", "3010")
- colorId: The BrickLink/Rebrickable color ID number
- colorName: The human-readable color name (e.g., "Red", "Blue", "Dark Bluish Gray")
- quantity: How many of this exact brick (same part and color) are visible
- confidence: Your confidence in the identification from 0.0 to 1.0
${includeAlternatives ? '- alternatives: Array of alternative identifications if unsure, each with partNumber, colorId, and confidence' : ""}

Rules:
- Identify up to ${maxParts} bricks maximum
- Only include bricks with confidence >= ${minConfidence}
- Be precise with part numbers - use official LEGO element/design IDs
- Consider orientation and perspective when identifying parts
- If a brick is partially obscured, lower the confidence score accordingly

Respond ONLY with valid JSON in this exact format:
{
  "parts": [
    {
      "partNumber": "3001",
      "colorId": 5,
      "colorName": "Red",
      "quantity": 2,
      "confidence": 0.95${includeAlternatives ? ',\n      "alternatives": [{"partNumber": "3002", "colorId": 5, "confidence": 0.3}]' : ""}
    }
  ]
}`;
}

// --- Bedrock Claude Backend ---

export class BedrockClaudeBackend implements RecognitionBackend {
  private client: BedrockRuntimeClient;
  private region: string;

  constructor(region?: string) {
    this.region = region ?? process.env["AWS_REGION"] ?? "us-east-1";
    this.client = new BedrockRuntimeClient({
      region: this.region,
      requestHandler: {
        requestTimeout: BEDROCK_TIMEOUT_MS,
      } as never,
    });
  }

  async identify(
    image: Buffer,
    options?: RecognitionOptions,
  ): Promise<RecognitionResult> {
    const startTime = Date.now();

    // Preprocess image (resize to max 1024px)
    const processedImage = await preprocessImage(image);
    const base64Image = processedImage.toString("base64");

    // First attempt with Haiku (default, cheaper model)
    const haikuResult = await this.invokeModel(
      HAIKU_MODEL_ID,
      base64Image,
      options,
    );

    // Check if we need to escalate to Sonnet
    const lowConfidenceParts = haikuResult.parts.filter(
      (p) => p.confidence < LOW_CONFIDENCE_THRESHOLD,
    );

    if (lowConfidenceParts.length > 1) {
      // Multiple low-confidence bricks - retry with Sonnet for better accuracy
      const sonnetResult = await this.invokeModel(
        SONNET_MODEL_ID,
        base64Image,
        options,
      );
      const processingTimeMs = Date.now() - startTime;
      return {
        ...sonnetResult,
        processingTimeMs,
        modelVersion: `claude-3-sonnet (escalated from haiku)`,
      };
    }

    const processingTimeMs = Date.now() - startTime;
    return {
      ...haikuResult,
      processingTimeMs,
      modelVersion: "claude-3-haiku",
    };
  }

  async getServiceHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      // Use a minimal invocation to check health
      const command = new InvokeModelCommand({
        modelId: HAIKU_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 10,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "Reply with OK" }],
            },
          ],
        }),
      });

      await this.client.send(command);
      const latencyMs = Date.now() - startTime;

      return {
        available: true,
        latencyMs,
        lastChecked: new Date(),
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        available: false,
        latencyMs,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async invokeModel(
    modelId: string,
    base64Image: string,
    options?: RecognitionOptions,
  ): Promise<RecognitionResult> {
    const prompt = buildIdentificationPrompt(options);

    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody),
    });

    const response = await this.client.send(command, {
      requestTimeout: BEDROCK_TIMEOUT_MS,
    });

    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body),
    ) as BedrockResponse;

    return this.parseResponse(responseBody);
  }

  private parseResponse(response: BedrockResponse): RecognitionResult {
    // Extract text content from Claude's response
    const textContent = response.content?.find(
      (block) => block.type === "text",
    );

    if (!textContent?.text) {
      return { parts: [], processingTimeMs: 0, modelVersion: "" };
    }

    try {
      // Extract JSON from the response (Claude may wrap it in markdown code blocks)
      const jsonStr = extractJson(textContent.text);
      const parsed = JSON.parse(jsonStr) as ParsedIdentificationResult;

      const parts: RecognizedPart[] = (parsed.parts ?? []).map((p) => ({
        partNumber: String(p.partNumber ?? ""),
        colorId: Number(p.colorId ?? 0),
        colorName: String(p.colorName ?? "Unknown"),
        quantity: Math.max(1, Math.round(Number(p.quantity ?? 1))),
        confidence: Math.min(1, Math.max(0, Number(p.confidence ?? 0))),
        alternatives: p.alternatives?.map((a) => ({
          partNumber: String(a.partNumber ?? ""),
          colorId: Number(a.colorId ?? 0),
          confidence: Math.min(1, Math.max(0, Number(a.confidence ?? 0))),
        })),
      }));

      return { parts, processingTimeMs: 0, modelVersion: "" };
    } catch {
      // If JSON parsing fails, return empty result
      return { parts: [], processingTimeMs: 0, modelVersion: "" };
    }
  }
}

// --- Helper Types ---

interface BedrockResponse {
  content?: Array<{ type: string; text?: string }>;
}

interface ParsedIdentificationResult {
  parts?: Array<{
    partNumber?: string;
    colorId?: number;
    colorName?: string;
    quantity?: number;
    confidence?: number;
    alternatives?: Array<{
      partNumber?: string;
      colorId?: number;
      confidence?: number;
    }>;
  }>;
}

// --- Utility Functions ---

/**
 * Extract JSON from a string that may contain markdown code blocks or other text.
 */
function extractJson(text: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1];
  }

  // Try to find JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    return jsonMatch[0];
  }

  return text;
}

// --- Exported Instance ---

export const recognitionBackend: RecognitionBackend = new BedrockClaudeBackend();
