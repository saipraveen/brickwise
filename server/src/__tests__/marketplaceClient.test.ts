import { describe, it, expect } from "vitest";
import {
  generateBrickLinkPartUrl,
  generateBrickOwlPartUrl,
  generateBrickLinkWantedListXml,
  generateWobrickBulkUrl,
  getPurchaseOptions,
} from "../services/marketplaceClient.js";
import type { MissingPart } from "shared";

describe("marketplaceClient", () => {
  describe("generateBrickLinkPartUrl", () => {
    it("generates correct BrickLink URL for a part and color", () => {
      const url = generateBrickLinkPartUrl("3001", 5);
      expect(url).toContain("bricklink.com");
      expect(url).toContain("P=3001");
      expect(url).toContain("idColor=5");
    });

    it("encodes special characters in part numbers", () => {
      const url = generateBrickLinkPartUrl("3001a", 1);
      expect(url).toContain("P=3001a");
    });
  });

  describe("generateBrickOwlPartUrl", () => {
    it("generates correct BrickOwl URL for a part", () => {
      const url = generateBrickOwlPartUrl("3001", 5);
      expect(url).toContain("brickowl.com");
      expect(url).toContain("query=3001");
      expect(url).toContain("color=5");
    });
  });

  describe("generateBrickLinkWantedListXml", () => {
    it("generates valid XML for a single missing part", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 4,
          quantityOwned: 2,
        },
      ];

      const xml = generateBrickLinkWantedListXml(missingParts);
      expect(xml).toBe(
        "<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>5</COLOR><MINQTY>2</MINQTY></ITEM></INVENTORY>",
      );
    });

    it("generates valid XML for multiple missing parts", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 4,
          quantityOwned: 2,
        },
        {
          partNumber: "3003",
          colorId: 1,
          colorName: "Blue",
          quantityNeeded: 6,
          quantityOwned: 0,
        },
      ];

      const xml = generateBrickLinkWantedListXml(missingParts);
      expect(xml).toContain("<INVENTORY>");
      expect(xml).toContain("</INVENTORY>");
      expect(xml).toContain("<ITEMID>3001</ITEMID>");
      expect(xml).toContain("<MINQTY>2</MINQTY>");
      expect(xml).toContain("<ITEMID>3003</ITEMID>");
      expect(xml).toContain("<MINQTY>6</MINQTY>");
    });

    it("generates empty inventory XML for no parts", () => {
      const xml = generateBrickLinkWantedListXml([]);
      expect(xml).toBe("<INVENTORY></INVENTORY>");
    });

    it("escapes XML special characters in part numbers", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "30<01&",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 2,
          quantityOwned: 0,
        },
      ];

      const xml = generateBrickLinkWantedListXml(missingParts);
      expect(xml).toContain("<ITEMID>30&lt;01&amp;</ITEMID>");
      expect(xml).not.toContain("<ITEMID>30<01&</ITEMID>");
    });
  });

  describe("generateWobrickBulkUrl", () => {
    it("generates a Wobrick URL with encoded parts list", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 4,
          quantityOwned: 2,
        },
        {
          partNumber: "3003",
          colorId: 1,
          colorName: "Blue",
          quantityNeeded: 6,
          quantityOwned: 0,
        },
      ];

      const url = generateWobrickBulkUrl(missingParts);
      expect(url).toContain("gobricks.cn");
      expect(url).toContain("3001");
      expect(url).toContain("3003");
    });
  });

  describe("getPurchaseOptions", () => {
    it("returns options for all three marketplaces per part", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 4,
          quantityOwned: 2,
        },
      ];

      const options = getPurchaseOptions(missingParts);
      expect(options).toHaveLength(3);

      const marketplaces = options.map((o) => o.marketplace);
      expect(marketplaces).toContain("bricklink");
      expect(marketplaces).toContain("brickowl");
      expect(marketplaces).toContain("wobrick");
    });

    it("calculates correct missing quantity", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 10,
          quantityOwned: 3,
        },
      ];

      const options = getPurchaseOptions(missingParts);
      for (const option of options) {
        expect(option.quantity).toBe(7);
      }
    });

    it("returns empty array for empty missing parts", () => {
      const options = getPurchaseOptions([]);
      expect(options).toHaveLength(0);
    });

    it("generates valid URLs for each marketplace", () => {
      const missingParts: MissingPart[] = [
        {
          partNumber: "3001",
          colorId: 5,
          colorName: "Red",
          quantityNeeded: 2,
          quantityOwned: 0,
        },
      ];

      const options = getPurchaseOptions(missingParts);
      const brickLink = options.find((o) => o.marketplace === "bricklink");
      const brickOwl = options.find((o) => o.marketplace === "brickowl");
      const wobrick = options.find((o) => o.marketplace === "wobrick");

      expect(brickLink?.directUrl).toContain("bricklink.com");
      expect(brickOwl?.directUrl).toContain("brickowl.com");
      expect(wobrick?.directUrl).toContain("gobricks.cn");
    });
  });
});
