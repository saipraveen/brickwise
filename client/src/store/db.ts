import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  BrickEntry,
  SetEntry,
  CatalogPart,
  CatalogSet,
} from 'shared';

// ─── Sync Queue Types ────────────────────────────────────────────────────────

export type SyncOperationStatus = 'pending' | 'in-progress' | 'failed';

export interface SyncOperation {
  id?: number;
  type: 'create' | 'update' | 'delete';
  store: string;
  key: string;
  payload: unknown;
  timestamp: number;
  status: SyncOperationStatus;
  retryCount: number;
  lastError?: string;
}

// ─── Wishlist and Favorites Types ────────────────────────────────────────────

export interface WishlistEntry {
  id: string;
  mocId: string;
  title: string;
  thumbnailUrl: string;
  designer: string;
  pieceCount: number;
  savedAt: Date;
}

export interface DisplayFavoriteEntry {
  id: string;
  displayIdeaId: string;
  title: string;
  category: string;
  savedAt: Date;
}

// ─── IndexedDB Schema ────────────────────────────────────────────────────────

export interface LegoDBSchema extends DBSchema {
  inventory: {
    key: string;
    value: BrickEntry;
    indexes: {
      'by-part': string;
      'by-color': number;
      'by-bag': number;
      'by-status': string;
      'by-category': number;
    };
  };
  sets: {
    key: string;
    value: SetEntry;
    indexes: {
      'by-theme': string;
      'by-status': string;
    };
  };
  catalogParts: {
    key: string;
    value: CatalogPart;
    indexes: {
      'by-name': string;
      'by-category': number;
    };
  };
  catalogSets: {
    key: string;
    value: CatalogSet;
    indexes: {
      'by-name': string;
      'by-theme': string;
    };
  };
  syncQueue: {
    key: number;
    value: SyncOperation;
    indexes: {
      'by-timestamp': number;
      'by-status': string;
    };
  };
  mocWishlist: {
    key: string;
    value: WishlistEntry;
  };
  displayFavorites: {
    key: string;
    value: DisplayFavoriteEntry;
  };
}

// ─── Database Version & Name ─────────────────────────────────────────────────

const DB_NAME = 'brickwise-local';
const DB_VERSION = 1;

// ─── Database Initialization ─────────────────────────────────────────────────

let dbInstance: IDBPDatabase<LegoDBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<LegoDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<LegoDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Inventory store
      const inventoryStore = db.createObjectStore('inventory', {
        keyPath: 'id',
      });
      inventoryStore.createIndex('by-part', 'partNumber');
      inventoryStore.createIndex('by-color', 'colorId');
      inventoryStore.createIndex('by-bag', 'bagNumber');
      inventoryStore.createIndex('by-status', 'status');
      inventoryStore.createIndex('by-category', 'categoryId');

      // Sets store
      const setsStore = db.createObjectStore('sets', {
        keyPath: 'setNumber',
      });
      setsStore.createIndex('by-theme', 'theme');
      setsStore.createIndex('by-status', 'status');

      // Catalog parts store
      const catalogPartsStore = db.createObjectStore('catalogParts', {
        keyPath: 'partNumber',
      });
      catalogPartsStore.createIndex('by-name', 'name');
      catalogPartsStore.createIndex('by-category', 'categoryId');

      // Catalog sets store
      const catalogSetsStore = db.createObjectStore('catalogSets', {
        keyPath: 'setNumber',
      });
      catalogSetsStore.createIndex('by-name', 'name');
      catalogSetsStore.createIndex('by-theme', 'theme');

      // Sync queue store (autoIncrement key)
      const syncQueueStore = db.createObjectStore('syncQueue', {
        keyPath: 'id',
        autoIncrement: true,
      });
      syncQueueStore.createIndex('by-timestamp', 'timestamp');
      syncQueueStore.createIndex('by-status', 'status');

      // MOC Wishlist store
      db.createObjectStore('mocWishlist', { keyPath: 'id' });

      // Display Favorites store
      db.createObjectStore('displayFavorites', { keyPath: 'id' });
    },
  });

  return dbInstance;
}

// ─── Inventory CRUD ──────────────────────────────────────────────────────────

export async function getAllInventory(): Promise<BrickEntry[]> {
  const db = await getDB();
  return db.getAll('inventory');
}

export async function getInventoryByKey(id: string): Promise<BrickEntry | undefined> {
  const db = await getDB();
  return db.get('inventory', id);
}

export async function getInventoryByPart(partNumber: string): Promise<BrickEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('inventory', 'by-part', partNumber);
}

export async function getInventoryByColor(colorId: number): Promise<BrickEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('inventory', 'by-color', colorId);
}

export async function getInventoryByStatus(status: string): Promise<BrickEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('inventory', 'by-status', status);
}

export async function getInventoryByCategory(categoryId: number): Promise<BrickEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('inventory', 'by-category', categoryId);
}

export async function putInventoryItem(item: BrickEntry): Promise<string> {
  const db = await getDB();
  return db.put('inventory', item);
}

export async function putInventoryItems(items: BrickEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('inventory', 'readwrite');
  await Promise.all([
    ...items.map((item) => tx.store.put(item)),
    tx.done,
  ]);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('inventory', id);
}

export async function clearInventory(): Promise<void> {
  const db = await getDB();
  await db.clear('inventory');
}

// ─── Sets CRUD ───────────────────────────────────────────────────────────────

export async function getAllSets(): Promise<SetEntry[]> {
  const db = await getDB();
  return db.getAll('sets');
}

export async function getSetByNumber(setNumber: string): Promise<SetEntry | undefined> {
  const db = await getDB();
  return db.get('sets', setNumber);
}

export async function getSetsByTheme(theme: string): Promise<SetEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('sets', 'by-theme', theme);
}

export async function getSetsByStatus(status: string): Promise<SetEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('sets', 'by-status', status);
}

export async function putSet(set: SetEntry): Promise<string> {
  const db = await getDB();
  return db.put('sets', set);
}

export async function putSets(sets: SetEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('sets', 'readwrite');
  await Promise.all([
    ...sets.map((s) => tx.store.put(s)),
    tx.done,
  ]);
}

export async function deleteSet(setNumber: string): Promise<void> {
  const db = await getDB();
  await db.delete('sets', setNumber);
}

// ─── Catalog Parts CRUD ──────────────────────────────────────────────────────

export async function getAllCatalogParts(): Promise<CatalogPart[]> {
  const db = await getDB();
  return db.getAll('catalogParts');
}

export async function getCatalogPart(partNumber: string): Promise<CatalogPart | undefined> {
  const db = await getDB();
  return db.get('catalogParts', partNumber);
}

export async function getCatalogPartsByName(name: string): Promise<CatalogPart[]> {
  const db = await getDB();
  return db.getAllFromIndex('catalogParts', 'by-name', name);
}

export async function getCatalogPartsByCategory(categoryId: number): Promise<CatalogPart[]> {
  const db = await getDB();
  return db.getAllFromIndex('catalogParts', 'by-category', categoryId);
}

export async function putCatalogPart(part: CatalogPart): Promise<string> {
  const db = await getDB();
  return db.put('catalogParts', part);
}

export async function putCatalogParts(parts: CatalogPart[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('catalogParts', 'readwrite');
  await Promise.all([
    ...parts.map((p) => tx.store.put(p)),
    tx.done,
  ]);
}

export async function clearCatalogParts(): Promise<void> {
  const db = await getDB();
  await db.clear('catalogParts');
}

// ─── Catalog Sets CRUD ───────────────────────────────────────────────────────

export async function getAllCatalogSets(): Promise<CatalogSet[]> {
  const db = await getDB();
  return db.getAll('catalogSets');
}

export async function getCatalogSet(setNumber: string): Promise<CatalogSet | undefined> {
  const db = await getDB();
  return db.get('catalogSets', setNumber);
}

export async function getCatalogSetsByName(name: string): Promise<CatalogSet[]> {
  const db = await getDB();
  return db.getAllFromIndex('catalogSets', 'by-name', name);
}

export async function getCatalogSetsByTheme(theme: string): Promise<CatalogSet[]> {
  const db = await getDB();
  return db.getAllFromIndex('catalogSets', 'by-theme', theme);
}

export async function putCatalogSet(set: CatalogSet): Promise<string> {
  const db = await getDB();
  return db.put('catalogSets', set);
}

export async function putCatalogSets(sets: CatalogSet[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('catalogSets', 'readwrite');
  await Promise.all([
    ...sets.map((s) => tx.store.put(s)),
    tx.done,
  ]);
}

export async function clearCatalogSets(): Promise<void> {
  const db = await getDB();
  await db.clear('catalogSets');
}

// ─── Sync Queue CRUD ─────────────────────────────────────────────────────────

export async function addToSyncQueue(op: Omit<SyncOperation, 'id'>): Promise<number> {
  const db = await getDB();
  return db.add('syncQueue', op as SyncOperation);
}

export async function getPendingSyncOperations(): Promise<SyncOperation[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncQueue', 'by-status', 'pending');
}

export async function getAllSyncOperations(): Promise<SyncOperation[]> {
  const db = await getDB();
  return db.getAll('syncQueue');
}

export async function updateSyncOperation(op: SyncOperation): Promise<number> {
  const db = await getDB();
  return db.put('syncQueue', op);
}

export async function deleteSyncOperation(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('syncQueue');
}

// ─── MOC Wishlist CRUD ───────────────────────────────────────────────────────

export async function getAllWishlistEntries(): Promise<WishlistEntry[]> {
  const db = await getDB();
  return db.getAll('mocWishlist');
}

export async function getWishlistEntry(id: string): Promise<WishlistEntry | undefined> {
  const db = await getDB();
  return db.get('mocWishlist', id);
}

export async function putWishlistEntry(entry: WishlistEntry): Promise<string> {
  const db = await getDB();
  return db.put('mocWishlist', entry);
}

export async function deleteWishlistEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('mocWishlist', id);
}

// ─── Display Favorites CRUD ──────────────────────────────────────────────────

export async function getAllDisplayFavorites(): Promise<DisplayFavoriteEntry[]> {
  const db = await getDB();
  return db.getAll('displayFavorites');
}

export async function getDisplayFavorite(id: string): Promise<DisplayFavoriteEntry | undefined> {
  const db = await getDB();
  return db.get('displayFavorites', id);
}

export async function putDisplayFavorite(entry: DisplayFavoriteEntry): Promise<string> {
  const db = await getDB();
  return db.put('displayFavorites', entry);
}

export async function deleteDisplayFavorite(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('displayFavorites', id);
}
