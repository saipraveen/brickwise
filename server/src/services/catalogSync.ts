/**
 * Catalog Sync Scheduler
 *
 * Periodically synchronizes LEGO catalog data from the Rebrickable API
 * into the local PostgreSQL database.
 *
 * Schedule: Every 12 hours
 * Retry: Up to 3 retries, 1 hour apart on failure
 * Stores: last sync timestamp, next scheduled time, retry count, errors
 *
 * Requirements: 9.3, 9.4, 9.5, 9.9
 */

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  catalogPart,
  catalogColor,
  catalogSet,
  catalogSetPart,
} from "../db/schema.js";
import { getRebrickableClient } from "./rebrickableClient.js";

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RETRY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RETRIES = 3;

export interface SyncStatus {
  lastSyncTime: Date | null;
  nextScheduledSync: Date | null;
  isRunning: boolean;
  retryCount: number;
  lastError: string | null;
}

let syncStatus: SyncStatus = {
  lastSyncTime: null,
  nextScheduledSync: null,
  isRunning: false,
  retryCount: 0,
  lastError: null,
};

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Returns the current sync status including last sync time,
 * next scheduled sync, running state, retry count, and last error.
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

/**
 * Performs the actual catalog sync - fetches parts, colors, sets,
 * and set-parts from Rebrickable and upserts into the database.
 */
async function performSync(): Promise<void> {
  if (syncStatus.isRunning) {
    return;
  }

  syncStatus.isRunning = true;
  syncStatus.lastError = null;

  try {
    const client = getRebrickableClient();

    // Sync colors first (referenced by set-parts)
    const colors = await client.fetchColors();
    for (const color of colors) {
      await db
        .insert(catalogColor)
        .values({
          colorId: color.colorId,
          name: color.name,
          hexCode: color.hexCode,
          isTransparent: color.isTransparent,
        })
        .onConflictDoUpdate({
          target: catalogColor.colorId,
          set: {
            name: color.name,
            hexCode: color.hexCode,
            isTransparent: color.isTransparent,
          },
        });
    }

    // Sync parts (referenced by set-parts)
    const parts = await client.fetchParts();
    for (const part of parts) {
      await db
        .insert(catalogPart)
        .values({
          partNumber: part.partNumber,
          name: part.name,
          categoryId: part.categoryId,
          categoryName: "", // Rebrickable doesn't provide category name in parts list
          imageUrl: part.imageUrl,
          lastSynced: new Date(),
        })
        .onConflictDoUpdate({
          target: catalogPart.partNumber,
          set: {
            name: part.name,
            categoryId: part.categoryId,
            imageUrl: part.imageUrl,
            lastSynced: new Date(),
          },
        });
    }

    // Sync sets
    const sets = await client.fetchSets();
    for (const set of sets) {
      await db
        .insert(catalogSet)
        .values({
          setNumber: set.setNumber,
          name: set.name,
          theme: set.theme,
          year: set.year,
          pieceCount: set.pieceCount,
          imageUrl: set.imageUrl,
          lastSynced: new Date(),
        })
        .onConflictDoUpdate({
          target: catalogSet.setNumber,
          set: {
            name: set.name,
            theme: set.theme,
            year: set.year,
            pieceCount: set.pieceCount,
            imageUrl: set.imageUrl,
            lastSynced: new Date(),
          },
        });
    }

    // Sync set-parts for each set
    for (const set of sets) {
      const setParts = await client.fetchSetParts(set.setNumber);
      // Remove existing set-parts and re-insert
      await db
        .delete(catalogSetPart)
        .where(eq(catalogSetPart.setNumber, set.setNumber));

      for (const sp of setParts) {
        await db.insert(catalogSetPart).values({
          setNumber: sp.setNumber,
          partNumber: sp.partNumber,
          colorId: sp.colorId,
          quantity: sp.quantity,
          isSpare: sp.isSpare,
        });
      }
    }

    // Sync succeeded
    syncStatus.lastSyncTime = new Date();
    syncStatus.retryCount = 0;
    syncStatus.lastError = null;
    syncStatus.nextScheduledSync = new Date(
      Date.now() + SYNC_INTERVAL_MS,
    );

    // Clear any pending retry
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    syncStatus.lastError = errorMessage;
    syncStatus.retryCount++;

    console.error(
      `Catalog sync failed (attempt ${syncStatus.retryCount}/${MAX_RETRIES}): ${errorMessage}`,
    );

    if (syncStatus.retryCount < MAX_RETRIES) {
      // Schedule retry in 1 hour
      syncStatus.nextScheduledSync = new Date(
        Date.now() + RETRY_INTERVAL_MS,
      );
      retryTimeoutId = setTimeout(() => {
        retryTimeoutId = null;
        void performSync();
      }, RETRY_INTERVAL_MS);
    } else {
      // All retries exhausted - wait for next scheduled sync
      syncStatus.nextScheduledSync = new Date(
        Date.now() + SYNC_INTERVAL_MS,
      );
      console.error(
        "Catalog sync: all retries exhausted. Catalog data may be outdated. Next attempt at scheduled time.",
      );
    }
  } finally {
    syncStatus.isRunning = false;
  }
}

/**
 * Starts the catalog sync scheduler.
 * Runs an initial sync immediately, then schedules every 12 hours.
 */
export function startCatalogSync(): void {
  if (syncIntervalId) {
    return; // Already started
  }

  // Schedule recurring sync every 12 hours
  syncIntervalId = setInterval(() => {
    syncStatus.retryCount = 0; // Reset retries on scheduled run
    void performSync();
  }, SYNC_INTERVAL_MS);

  // Set initial next-scheduled time
  syncStatus.nextScheduledSync = new Date(Date.now() + SYNC_INTERVAL_MS);

  // Run initial sync
  void performSync();
}

/**
 * Triggers an immediate catalog sync. Resets retry count.
 * Returns immediately - sync runs in the background.
 */
export function triggerSyncNow(): { started: boolean; message: string } {
  if (syncStatus.isRunning) {
    return { started: false, message: "Sync is already in progress" };
  }

  syncStatus.retryCount = 0;

  // Clear any pending retry
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }

  void performSync();
  return { started: true, message: "Catalog sync started" };
}

/**
 * Stops the catalog sync scheduler. Used for cleanup/testing.
 */
export function stopCatalogSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
}
