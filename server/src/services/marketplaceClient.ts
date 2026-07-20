/**
 * Marketplace client for BrickLink, BrickOwl, and Wobrick integrations.
 * Provides pricing lookups, direct URLs, and export formats for missing parts.
 *
 * Requirements: 9.7, Design (Buy Missing Parts)
 */

import type { MissingPart } from "shared";

/** Marketplace identifiers */
export type Marketplace = "bricklink" | "brickowl" | "wobrick";

/** Pricing and availability data for a single part on a marketplace */
export interface PurchaseOption {
  partNumber: string;
  colorId: number;
  quantity: number;
  marketplace: Marketplace;
  pricePerUnit?: number; // undefined if pricing unavailable
  currency?: string;
  directUrl: string;
  inStock: boolean;
}

/**
 * BrickLink color ID mapping from Rebrickable color IDs.
 * BrickLink uses its own color numbering system.
 * This is a simplified stub - a full mapping would be maintained via catalog sync.
 */
function toBrickLinkColorId(rebrickableColorId: number): number {
  // BrickLink and Rebrickable share many color IDs for common colors.
  // For a production app, this would use a lookup table synced from Rebrickable's color mapping.
  return rebrickableColorId;
}

/**
 * Generate the direct BrickLink URL for a specific part/color combination.
 */
export function generateBrickLinkPartUrl(partNumber: string, colorId: number): string {
  const blColorId = toBrickLinkColorId(colorId);
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(partNumber)}&idColor=${blColorId}#T=S&C=${blColorId}&O={"color":${blColorId},"iconly":0}`;
}

/**
 * Generate the direct BrickOwl URL for a specific part.
 * BrickOwl's search works well with just the part number.
 */
export function generateBrickOwlPartUrl(partNumber: string, colorId: number): string {
  const blColorId = toBrickLinkColorId(colorId);
  return `https://www.brickowl.com/search/catalog?query=${encodeURIComponent(partNumber)}&cat=1&color=${blColorId}`;
}

/**
 * Generate BrickLink Wanted List XML for importing into BrickLink.
 * This XML format is compatible with BrickLink's "Upload Wanted List" feature.
 *
 * Format: <INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>5</COLOR><MINQTY>2</MINQTY></ITEM>...</INVENTORY>
 */
export function generateBrickLinkWantedListXml(missingParts: MissingPart[]): string {
  const items = missingParts.map((part) => {
    const quantityMissing = part.quantityNeeded - part.quantityOwned;
    const blColorId = toBrickLinkColorId(part.colorId);
    return `<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${escapeXml(part.partNumber)}</ITEMID><COLOR>${blColorId}</COLOR><MINQTY>${quantityMissing}</MINQTY></ITEM>`;
  });

  return `<INVENTORY>${items.join("")}</INVENTORY>`;
}

/**
 * Generate Wobrick/Gobricks bulk order URL from a parts list.
 * Wobrick doesn't have a public API, so we construct a search/catalog URL.
 */
export function generateWobrickBulkUrl(missingParts: MissingPart[]): string {
  const partsList = missingParts
    .map((p) => `${p.partNumber}:${p.quantityNeeded - p.quantityOwned}`)
    .join(",");
  return `https://www.gobricks.cn/bricks/search?query=${encodeURIComponent(partsList)}`;
}

/**
 * Get purchase options for a list of missing parts.
 * Generates direct URLs for each marketplace. Pricing data is stubbed
 * (would require authenticated API calls to BrickLink/BrickOwl in production).
 */
export function getPurchaseOptions(missingParts: MissingPart[]): PurchaseOption[] {
  const options: PurchaseOption[] = [];

  for (const part of missingParts) {
    const quantityMissing = part.quantityNeeded - part.quantityOwned;

    // BrickLink option
    options.push({
      partNumber: part.partNumber,
      colorId: part.colorId,
      quantity: quantityMissing,
      marketplace: "bricklink",
      pricePerUnit: undefined,
      currency: "USD",
      directUrl: generateBrickLinkPartUrl(part.partNumber, part.colorId),
      inStock: true,
    });

    // BrickOwl option
    options.push({
      partNumber: part.partNumber,
      colorId: part.colorId,
      quantity: quantityMissing,
      marketplace: "brickowl",
      pricePerUnit: undefined,
      currency: "USD",
      directUrl: generateBrickOwlPartUrl(part.partNumber, part.colorId),
      inStock: true,
    });

    // Wobrick option (link-out only, no pricing)
    options.push({
      partNumber: part.partNumber,
      colorId: part.colorId,
      quantity: quantityMissing,
      marketplace: "wobrick",
      pricePerUnit: undefined,
      currency: undefined,
      directUrl: `https://www.gobricks.cn/bricks/search?query=${encodeURIComponent(part.partNumber)}`,
      inStock: true,
    });
  }

  return options;
}

/** Escape special XML characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
