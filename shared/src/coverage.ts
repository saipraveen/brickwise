// Coverage domain types

/** A part required by a MOC or rebuild idea */
export interface RequiredPart {
  partNumber: string;
  colorId: number;
  quantity: number;
}

/** Result of a part coverage calculation */
export interface CoverageResult {
  percentage: number; // 0-100, rounded to nearest whole number
  matchedParts: number;
  totalRequired: number;
  missingParts: MissingPart[];
}

/** A part that is missing or insufficient for a build */
export interface MissingPart {
  partNumber: string;
  colorId: number;
  colorName: string;
  quantityNeeded: number;
  quantityOwned: number;
}
