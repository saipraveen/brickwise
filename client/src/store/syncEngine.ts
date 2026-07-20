import {
  addToSyncQueue,
  getPendingSyncOperations,
  updateSyncOperation,
  deleteSyncOperation,
  getAllSyncOperations,
  type SyncOperation,
  type SyncOperationStatus,
} from './db';

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // exponential-ish backoff
const SYNC_STORAGE_KEY = 'brickwise-last-sync';

// ─── API Base URL ────────────────────────────────────────────────────────────

function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? '/api';
}

// ─── Online/Offline Detection ────────────────────────────────────────────────

type ConnectionListener = (online: boolean) => void;

const listeners: Set<ConnectionListener> = new Set();
let initialized = false;

function handleOnline(): void {
  listeners.forEach((fn) => fn(true));
  void replaySyncQueue();
}

function handleOffline(): void {
  listeners.forEach((fn) => fn(false));
}

export function initConnectionListeners(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

export function destroyConnectionListeners(): void {
  if (!initialized) return;
  initialized = false;
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  listeners.clear();
}

export function onConnectionChange(fn: ConnectionListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isOnline(): boolean {
  return navigator.onLine;
}

// ─── Queue Pending Writes ────────────────────────────────────────────────────

export interface QueuedWrite {
  type: 'create' | 'update' | 'delete';
  store: string;
  key: string;
  payload?: unknown;
}

/**
 * Enqueue a write operation for later sync.
 * If online, immediately attempts replay.
 */
export async function enqueueWrite(write: QueuedWrite): Promise<void> {
  await addToSyncQueue({
    type: write.type,
    store: write.store,
    key: write.key,
    payload: write.payload ?? null,
    timestamp: Date.now(),
    status: 'pending' as SyncOperationStatus,
    retryCount: 0,
  });

  if (isOnline()) {
    void replaySyncQueue();
  }
}

// ─── Replay Sync Queue ──────────────────────────────────────────────────────

let replaying = false;

/**
 * Process all pending sync operations against the server API.
 * Operations are replayed in timestamp order (FIFO).
 */
export async function replaySyncQueue(): Promise<void> {
  if (replaying) return;
  if (!isOnline()) return;

  replaying = true;

  try {
    const pending = await getPendingSyncOperations();

    // Sort by timestamp to preserve operation order
    pending.sort((a, b) => a.timestamp - b.timestamp);

    for (const op of pending) {
      try {
        await updateSyncOperation({ ...op, status: 'in-progress' });
        await executeOperation(op);
        await deleteSyncOperation(op.id!);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        const nextRetryCount = op.retryCount + 1;

        if (nextRetryCount >= MAX_RETRIES) {
          await updateSyncOperation({
            ...op,
            status: 'failed',
            retryCount: nextRetryCount,
            lastError: errorMessage,
          });
        } else {
          await updateSyncOperation({
            ...op,
            status: 'pending',
            retryCount: nextRetryCount,
            lastError: errorMessage,
          });
          // Wait before retrying the next operation
          await delay(RETRY_DELAYS[nextRetryCount - 1] ?? 15000);
        }
      }
    }

    // Update last sync time on successful queue drain
    const remaining = await getPendingSyncOperations();
    if (remaining.length === 0) {
      setLastSyncTime(new Date());
    }
  } finally {
    replaying = false;
  }
}

// ─── Execute a Single Sync Operation ─────────────────────────────────────────

async function executeOperation(op: SyncOperation): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const endpoint = resolveEndpoint(baseUrl, op);

  const method = resolveHttpMethod(op.type);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Attach auth token if available
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: method !== 'DELETE' ? JSON.stringify(op.payload) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
  }
}

function resolveEndpoint(baseUrl: string, op: SyncOperation): string {
  const storeToPath: Record<string, string> = {
    inventory: '/inventory',
    sets: '/sets',
    mocWishlist: '/mocs/wishlist',
    displayFavorites: '/display-ideas/favorites',
  };

  const path = storeToPath[op.store] ?? `/${op.store}`;

  if (op.type === 'delete' || op.type === 'update') {
    return `${baseUrl}${path}/${encodeURIComponent(op.key)}`;
  }

  return `${baseUrl}${path}`;
}

function resolveHttpMethod(type: SyncOperation['type']): string {
  switch (type) {
    case 'create':
      return 'POST';
    case 'update':
      return 'PATCH';
    case 'delete':
      return 'DELETE';
  }
}

function getAuthToken(): string | null {
  // Token is typically stored in memory by the auth layer.
  // For sync engine, read from sessionStorage as a fallback.
  return sessionStorage.getItem('brickwise-auth-token');
}

// ─── Public Sync API ─────────────────────────────────────────────────────────

/**
 * Get the count of pending changes waiting to sync.
 */
export async function getPendingChanges(): Promise<number> {
  const ops = await getAllSyncOperations();
  return ops.filter((op) => op.status === 'pending' || op.status === 'in-progress').length;
}

/**
 * Get the last successful sync time.
 */
export function getLastSyncTime(): Date | null {
  const stored = localStorage.getItem(SYNC_STORAGE_KEY);
  if (!stored) return null;
  const parsed = new Date(stored);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Force an immediate sync attempt.
 */
export async function forceSyncNow(): Promise<void> {
  if (!isOnline()) {
    throw new Error('Cannot sync while offline');
  }
  await replaySyncQueue();
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function setLastSyncTime(date: Date): void {
  localStorage.setItem(SYNC_STORAGE_KEY, date.toISOString());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
