// Catalog domain types

/** A LEGO part from the reference catalog */
export interface CatalogPart {
  partNumber: string;
  name: string;
  categoryId: number;
  categoryName: string;
  imageUrl: string;
  lastSynced: Date;
}

/** A LEGO set from the reference catalog */
export interface CatalogSet {
  setNumber: string;
  name: string;
  theme: string;
  year: number;
  pieceCount: number;
  imageUrl: string;
  lastSynced: Date;
}

/** A LEGO color from the reference catalog */
export interface CatalogColor {
  colorId: number;
  name: string;
  hexCode: string;
  isTransparent: boolean;
}

/** A part within a set (from the catalog set parts list) */
export interface CatalogSetPart {
  setNumber: string;
  partNumber: string;
  colorId: number;
  quantity: number;
  isSpare: boolean;
}

/** Status of a catalog sync operation */
export interface SyncStatus {
  lastSyncTime: Date | null;
  nextScheduledSync: Date;
  isRunning: boolean;
  lastError?: string;
  retryCount: number;
}
