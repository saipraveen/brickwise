import { describe, it, expect } from "vitest";
import { calculateCoverage } from "../services/partCoverage.js";
import type { BrickEntry, RequiredPart } from "shared";

function makeBrickEntry(overrides: Partial<BrickEntry> & Pick<BrickEntry, "partNumber" | "colorId" | "quantity">): BrickEntry {
  return {
    id: "test-id",
    colorName: "Red",
    categoryId: 1,
    categoryName: "Bricks",
    status: "available",
    lastModified: new Date(),
    ...overrides,
  };
}

describe("calculateCoverage", () => {
  it("returns 100% when no parts are required", () => {
    const result = calculateCoverage([], []);

    expect(result.percentage).toBe(100);
    expect(result.matchedParts).toBe(0);
    expect(result.totalRequired).toBe(0);
    expect(result.missingParts).toEqual([]);
  });

  it("returns 100% when all required parts are fully satisfied", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 4 },
      { partNumber: "3002", colorId: 2, quantity: 2 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 10 }),
      makeBrickEntry({ partNumber: "3002", colorId: 2, quantity: 5, colorName: "Blue" }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(100);
    expect(result.matchedParts).toBe(2);
    expect(result.totalRequired).toBe(2);
    expect(result.missingParts).toEqual([]);
  });

  it("returns 0% when no required parts are in inventory", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 4 },
      { partNumber: "3002", colorId: 2, quantity: 2 },
    ];
    const inventory: BrickEntry[] = [];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(0);
    expect(result.matchedParts).toBe(0);
    expect(result.totalRequired).toBe(2);
    expect(result.missingParts).toHaveLength(2);
  });

  it("returns partial coverage when some parts are satisfied", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 4 },
      { partNumber: "3002", colorId: 2, quantity: 2 },
      { partNumber: "3003", colorId: 3, quantity: 1 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 10 }),
      makeBrickEntry({ partNumber: "3003", colorId: 3, quantity: 1, colorName: "Green" }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(67); // 2/3 * 100 = 66.67 -> rounds to 67
    expect(result.matchedParts).toBe(2);
    expect(result.totalRequired).toBe(3);
    expect(result.missingParts).toHaveLength(1);
    expect(result.missingParts[0]).toEqual({
      partNumber: "3002",
      colorId: 2,
      colorName: "",
      quantityNeeded: 2,
      quantityOwned: 0,
    });
  });

  it("only counts inventory items with status 'available'", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 4 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 10, status: "in-use" }),
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 2, status: "available" }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(0);
    expect(result.missingParts).toEqual([
      {
        partNumber: "3001",
        colorId: 1,
        colorName: "Red",
        quantityNeeded: 4,
        quantityOwned: 2,
      },
    ]);
  });

  it("matches by both part number AND color", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 2 }, // Red
      { partNumber: "3001", colorId: 2, quantity: 3 }, // Blue
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 10, colorName: "Red" }),
      // No blue 3001 in inventory
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(50); // 1/2 = 50%
    expect(result.matchedParts).toBe(1);
    expect(result.totalRequired).toBe(2);
    expect(result.missingParts).toEqual([
      {
        partNumber: "3001",
        colorId: 2,
        colorName: "",
        quantityNeeded: 3,
        quantityOwned: 0,
      },
    ]);
  });

  it("aggregates multiple inventory entries for the same part-color", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 8 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 3, bagNumber: 1 }),
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 5, bagNumber: 2 }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(100);
    expect(result.matchedParts).toBe(1);
    expect(result.missingParts).toEqual([]);
  });

  it("aggregates duplicate required part-color pairs", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 3 },
      { partNumber: "3001", colorId: 1, quantity: 2 }, // Duplicate - should aggregate to 5
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 4 }),
    ];

    const result = calculateCoverage(required, inventory);

    // Need 5 total, have 4 -> not satisfied
    expect(result.percentage).toBe(0);
    expect(result.totalRequired).toBe(1); // 1 distinct part-color pair
    expect(result.missingParts).toEqual([
      {
        partNumber: "3001",
        colorId: 1,
        colorName: "Red",
        quantityNeeded: 5,
        quantityOwned: 4,
      },
    ]);
  });

  it("reports correct quantityOwned for partially available parts", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 10 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 6 }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(0);
    expect(result.missingParts[0]!.quantityNeeded).toBe(10);
    expect(result.missingParts[0]!.quantityOwned).toBe(6);
  });

  it("rounds coverage percentage to the nearest whole number", () => {
    // 1/3 = 33.33% -> rounds to 33
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 1 },
      { partNumber: "3002", colorId: 1, quantity: 1 },
      { partNumber: "3003", colorId: 1, quantity: 1 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 1 }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(33);
  });

  it("ignores inventory with 'in-storage' status", () => {
    const required: RequiredPart[] = [
      { partNumber: "3001", colorId: 1, quantity: 2 },
    ];
    const inventory: BrickEntry[] = [
      makeBrickEntry({ partNumber: "3001", colorId: 1, quantity: 10, status: "in-storage" }),
    ];

    const result = calculateCoverage(required, inventory);

    expect(result.percentage).toBe(0);
    expect(result.missingParts[0]!.quantityOwned).toBe(0);
  });
});
