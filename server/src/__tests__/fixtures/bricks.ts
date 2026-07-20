/**
 * Sample brick data fixtures for testing.
 */

export const sampleBricks = [
  {
    partNumber: "3001",
    colorId: 1,
    colorName: "White",
    categoryId: 11,
    categoryName: "Bricks",
    quantity: 10,
    status: "available" as const,
  },
  {
    partNumber: "3002",
    colorId: 5,
    colorName: "Red",
    categoryId: 11,
    categoryName: "Bricks",
    quantity: 8,
    status: "available" as const,
  },
  {
    partNumber: "3010",
    colorId: 4,
    colorName: "Blue",
    categoryId: 11,
    categoryName: "Bricks",
    quantity: 5,
    status: "in-storage" as const,
    bagNumber: 1,
  },
  {
    partNumber: "3020",
    colorId: 14,
    colorName: "Yellow",
    categoryId: 14,
    categoryName: "Plates",
    quantity: 12,
    status: "in-use" as const,
    sourceSetNumber: "10281-1",
  },
] as const;

export const sampleSets = [
  {
    setNumber: "10281-1",
    name: "Bonsai Tree",
    theme: "Botanical Collection",
    year: 2021,
    pieceCount: 878,
    status: "built" as const,
  },
  {
    setNumber: "21327-1",
    name: "Typewriter",
    theme: "Ideas",
    year: 2021,
    pieceCount: 2079,
    status: "disassembled" as const,
  },
  {
    setNumber: "10497-1",
    name: "Galaxy Explorer",
    theme: "Icons",
    year: 2022,
    pieceCount: 1254,
    status: "disassembled" as const,
  },
] as const;

export const sampleScanResults = [
  {
    partNumber: "3001",
    colorId: 1,
    colorName: "White",
    quantity: 3,
    confidence: 0.95,
    needsReview: false,
  },
  {
    partNumber: "3002",
    colorId: 5,
    colorName: "Red",
    quantity: 2,
    confidence: 0.82,
    needsReview: false,
  },
  {
    partNumber: "3003",
    colorId: 0,
    colorName: "Black",
    quantity: 1,
    confidence: 0.55,
    needsReview: true,
  },
] as const;
