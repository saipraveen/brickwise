// Inventory domain types

/** Status of a brick in the user's inventory */
export type BrickStatus = 'available' | 'in-use' | 'in-storage';

/** A single brick entry in the user's inventory */
export interface BrickEntry {
  id: string;
  partNumber: string;
  colorId: number;
  colorName: string;
  categoryId: number;
  categoryName: string;
  quantity: number;
  status: BrickStatus;
  bagNumber?: number;
  sourceSetNumber?: string;
  lastModified: Date;
}

/** Build status of a set in the user's collection */
export type SetBuildStatus = 'built' | 'disassembled' | 'partial';

/** A set in the user's collection */
export interface SetEntry {
  id: string;
  setNumber: string;
  name: string;
  theme: string;
  year: number;
  pieceCount: number;
  imageUrl: string;
  status: SetBuildStatus;
  isDuplicate: boolean;
  addedAt: Date;
}

/** A numbered storage bag for organizing bricks */
export interface StorageBag {
  id: string;
  userId: string;
  bagNumber: number;
  createdAt: Date;
}

/** A brick stored within a specific bag */
export interface BagBrickEntry {
  partNumber: string;
  colorId: number;
  colorName: string;
  quantity: number;
  bagNumber: number;
}

/** Location of a brick across bags */
export interface BagLocation {
  bagNumber: number;
  quantity: number;
}

/** Summary of inventory counts */
export interface InventorySummary {
  totalCount: number;
  availableCount: number;
  inUseCount: number;
  inStorageCount: number;
}

/** Filter options for querying inventory */
export interface InventoryFilter {
  partNumber?: string;
  colorId?: number;
  categoryId?: number;
  status?: BrickStatus;
  bagNumber?: number;
  groupBy?: 'category' | 'color' | 'partNumber';
}
