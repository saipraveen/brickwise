import type { BrickEntry, RequiredPart, CoverageResult, MissingPart } from "shared";

/**
 * Calculate part coverage for a MOC or rebuild idea against a user's inventory.
 *
 * Coverage = (number of required part-color pairs fully satisfied) /
 *            (total distinct required part-color pairs) * 100, rounded to nearest integer.
 *
 * Only inventory items with status "available" count toward coverage.
 */
export function calculateCoverage(
  requiredParts: RequiredPart[],
  availableInventory: BrickEntry[],
): CoverageResult {
  if (requiredParts.length === 0) {
    return {
      percentage: 100,
      matchedParts: 0,
      totalRequired: 0,
      missingParts: [],
    };
  }

  // Build a lookup of available inventory quantities keyed by "partNumber:colorId"
  const inventoryMap = new Map<string, { quantity: number; colorName: string }>();

  for (const entry of availableInventory) {
    if (entry.status !== "available") {
      continue;
    }
    const key = `${entry.partNumber}:${entry.colorId}`;
    const existing = inventoryMap.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      inventoryMap.set(key, { quantity: entry.quantity, colorName: entry.colorName });
    }
  }

  // Aggregate required parts by part-color pair (in case of duplicates in input)
  const requiredMap = new Map<string, { partNumber: string; colorId: number; quantity: number }>();

  for (const part of requiredParts) {
    const key = `${part.partNumber}:${part.colorId}`;
    const existing = requiredMap.get(key);
    if (existing) {
      existing.quantity += part.quantity;
    } else {
      requiredMap.set(key, { partNumber: part.partNumber, colorId: part.colorId, quantity: part.quantity });
    }
  }

  const totalRequired = requiredMap.size;
  let matchedParts = 0;
  const missingParts: MissingPart[] = [];

  for (const [key, required] of requiredMap) {
    const available = inventoryMap.get(key);
    const quantityOwned = available?.quantity ?? 0;

    if (quantityOwned >= required.quantity) {
      matchedParts++;
    } else {
      missingParts.push({
        partNumber: required.partNumber,
        colorId: required.colorId,
        colorName: available?.colorName ?? "",
        quantityNeeded: required.quantity,
        quantityOwned,
      });
    }
  }

  const percentage = Math.round((matchedParts / totalRequired) * 100);

  return {
    percentage,
    matchedParts,
    totalRequired,
    missingParts,
  };
}
