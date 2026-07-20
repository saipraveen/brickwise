import { useState, useEffect, useCallback } from "react";
import type { SetBuildStatus, ConflictBrickInfo } from "shared";
import "./Sets.css";

interface SetWithImage {
  id: string;
  setNumber: string;
  name: string;
  theme: string;
  year: number;
  pieceCount: number;
  status: SetBuildStatus;
  isDuplicate: boolean;
  addedAt: string;
  imageUrl: string | null;
}

interface SearchResult {
  setNumber: string;
  name: string;
  theme: string;
  year: number;
  pieceCount: number;
  imageUrl: string | null;
}

interface ConflictData {
  setId: string;
  setName: string;
  targetStatus: SetBuildStatus;
  conflictingBricks: ConflictBrickInfo[];
}

interface DuplicateData {
  setNumber: string;
  setName: string;
}

interface RemoveData {
  setId: string;
  setName: string;
  setStatus: string;
}

const API_BASE = "/api/sets";

function getAuthToken(): string | null {
  return localStorage.getItem("accessToken");
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function Sets() {
  const [sets, setSets] = useState<SetWithImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Conflict dialog state
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);

  // Duplicate dialog state
  const [duplicateData, setDuplicateData] = useState<DuplicateData | null>(null);

  // Remove confirmation state
  const [removeData, setRemoveData] = useState<RemoveData | null>(null);

  // Status update loading
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const fetchSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error(`Failed to fetch sets: ${res.status}`);
      }
      const json = await res.json();
      setSets(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  // Search sets from catalog
  const handleSearch = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await fetch(
        `${API_BASE}/search?query=${encodeURIComponent(trimmed)}`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        throw new Error(`Search failed: ${res.status}`);
      }
      const json = await res.json();
      setSearchResults(json.data ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  // Add set to collection
  const handleAddSet = async (setNumber: string, confirmDuplicate = false) => {
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ setNumber, confirmDuplicate }),
      });
      if (res.status === 409) {
        const json = await res.json();
        if (json.error === "duplicate_set") {
          // Show duplicate warning
          const matchingResult = searchResults.find(
            (r) => r.setNumber === setNumber,
          );
          setDuplicateData({
            setNumber,
            setName: matchingResult?.name ?? setNumber,
          });
          return;
        }
      }
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message ?? `Failed to add set: ${res.status}`);
      }
      // Success - refresh sets
      await fetchSets();
      // Remove from search results
      setSearchResults((prev) =>
        prev.filter((r) => r.setNumber !== setNumber),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add set");
    }
  };

  // Confirm adding duplicate
  const confirmAddDuplicate = async () => {
    if (!duplicateData) return;
    setDuplicateData(null);
    await handleAddSet(duplicateData.setNumber, true);
  };

  // Update set status
  const handleStatusChange = async (
    setId: string,
    setName: string,
    newStatus: SetBuildStatus,
    confirmConflicts = false,
  ) => {
    setUpdatingStatus(setId);
    try {
      const res = await fetch(`${API_BASE}/${setId}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus, confirmConflicts }),
      });

      if (res.status === 409) {
        const json = await res.json();
        if (json.error === "brick_conflict") {
          setConflictData({
            setId,
            setName,
            targetStatus: newStatus,
            conflictingBricks: json.conflictingBricks ?? [],
          });
          return;
        }
      }

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message ?? `Failed to update status: ${res.status}`);
      }

      await fetchSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Confirm status change despite conflicts
  const confirmStatusWithConflicts = async () => {
    if (!conflictData) return;
    const { setId, setName, targetStatus } = conflictData;
    setConflictData(null);
    await handleStatusChange(setId, setName, targetStatus, true);
  };

  // Remove set
  const handleRemove = async (
    setId: string,
    setName: string,
    status: string,
  ) => {
    if (status === "built" || status === "partial") {
      setRemoveData({ setId, setName, setStatus: status });
      return;
    }
    await performRemove(setId);
  };

  const performRemove = async (setId: string, confirm = false) => {
    try {
      const url = confirm
        ? `${API_BASE}/${setId}?confirm=true`
        : `${API_BASE}/${setId}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message ?? `Failed to remove set: ${res.status}`);
      }
      await fetchSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove set");
    }
  };

  const confirmRemove = async () => {
    if (!removeData) return;
    const { setId } = removeData;
    setRemoveData(null);
    await performRemove(setId, true);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "built":
        return "status-badge status-built";
      case "disassembled":
        return "status-badge status-disassembled";
      case "partial":
        return "status-badge status-partial";
      default:
        return "status-badge";
    }
  };

  return (
    <div className="page sets-page">
      <h2>My Sets</h2>

      {error && (
        <div className="sets-error" role="alert">
          {error}
          <button
            className="dismiss-btn"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search section */}
      <section className="sets-search-section" aria-label="Search sets">
        <h3>Add Set</h3>
        <div className="search-input-row">
          <input
            type="text"
            placeholder="Search by name, number, or theme..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            aria-label="Search sets in catalog"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="search-btn"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {searchError && (
          <p className="search-error" role="alert">
            {searchError}
          </p>
        )}

        {searchResults.length > 0 && (
          <div className="search-results" role="list" aria-label="Search results">
            {searchResults.map((result) => (
              <div key={result.setNumber} className="search-result-item" role="listitem">
                {result.imageUrl && (
                  <img
                    src={result.imageUrl}
                    alt={result.name}
                    className="search-result-img"
                    loading="lazy"
                  />
                )}
                <div className="search-result-info">
                  <span className="search-result-name">{result.name}</span>
                  <span className="search-result-meta">
                    {result.setNumber} &middot; {result.theme} &middot;{" "}
                    {result.year} &middot; {result.pieceCount} pcs
                  </span>
                </div>
                <button
                  className="add-btn"
                  onClick={() => handleAddSet(result.setNumber)}
                  aria-label={`Add ${result.name} to collection`}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Collection list */}
      <section className="sets-collection" aria-label="Your set collection">
        <h3>Collection ({sets.length})</h3>

        {loading && <p className="sets-loading">Loading sets...</p>}

        {!loading && sets.length === 0 && (
          <p className="sets-empty">
            No sets in your collection yet. Search above to add sets.
          </p>
        )}

        <div className="sets-grid" role="list">
          {sets.map((set) => (
            <div key={set.id} className="set-card" role="listitem">
              <div className="set-card-image">
                {set.imageUrl ? (
                  <img src={set.imageUrl} alt={set.name} loading="lazy" />
                ) : (
                  <div className="set-card-placeholder" aria-label="No image">
                    📦
                  </div>
                )}
              </div>
              <div className="set-card-body">
                <h4 className="set-card-name">{set.name}</h4>
                <p className="set-card-meta">
                  {set.setNumber} &middot; {set.theme} &middot; {set.year}{" "}
                  &middot; {set.pieceCount} pcs
                </p>
                <span className={getStatusBadgeClass(set.status)}>
                  {set.status}
                </span>
                {set.isDuplicate && (
                  <span className="duplicate-badge">Duplicate</span>
                )}
              </div>
              <div className="set-card-actions">
                {set.status !== "built" && (
                  <button
                    className="action-btn built-btn"
                    onClick={() =>
                      handleStatusChange(set.id, set.name, "built")
                    }
                    disabled={updatingStatus === set.id}
                    aria-label={`Mark ${set.name} as built`}
                  >
                    Mark as Built
                  </button>
                )}
                {set.status !== "disassembled" && (
                  <button
                    className="action-btn disassembled-btn"
                    onClick={() =>
                      handleStatusChange(set.id, set.name, "disassembled")
                    }
                    disabled={updatingStatus === set.id}
                    aria-label={`Mark ${set.name} as disassembled`}
                  >
                    Mark as Disassembled
                  </button>
                )}
                <button
                  className="action-btn remove-btn"
                  onClick={() => handleRemove(set.id, set.name, set.status)}
                  aria-label={`Remove ${set.name} from collection`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Conflict Dialog */}
      {conflictData && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-dialog-title"
        >
          <div className="dialog">
            <h3 id="conflict-dialog-title">Brick Conflict</h3>
            <p>
              Some bricks needed to mark <strong>{conflictData.setName}</strong>{" "}
              as &ldquo;{conflictData.targetStatus}&rdquo; are currently
              unavailable:
            </p>
            <ul className="conflict-list">
              {conflictData.conflictingBricks.map((brick, idx) => (
                <li key={idx}>
                  Part {brick.partNumber} (Color {brick.colorId}) - Status:{" "}
                  {brick.currentStatus}, Qty: {brick.quantity}
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button
                className="dialog-btn confirm-btn"
                onClick={confirmStatusWithConflicts}
              >
                Proceed Anyway
              </button>
              <button
                className="dialog-btn cancel-btn"
                onClick={() => setConflictData(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Dialog */}
      {duplicateData && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-dialog-title"
        >
          <div className="dialog">
            <h3 id="duplicate-dialog-title">Duplicate Set</h3>
            <p>
              <strong>{duplicateData.setName}</strong> ({duplicateData.setNumber}
              ) is already in your collection. Add another copy?
            </p>
            <div className="dialog-actions">
              <button
                className="dialog-btn confirm-btn"
                onClick={confirmAddDuplicate}
              >
                Add Duplicate
              </button>
              <button
                className="dialog-btn cancel-btn"
                onClick={() => setDuplicateData(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      {removeData && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-dialog-title"
        >
          <div className="dialog">
            <h3 id="remove-dialog-title">Remove Set</h3>
            <p>
              <strong>{removeData.setName}</strong> is marked as &ldquo;
              {removeData.setStatus}&rdquo;. Some bricks may be in use. Are you
              sure you want to remove it?
            </p>
            <div className="dialog-actions">
              <button className="dialog-btn confirm-btn" onClick={confirmRemove}>
                Remove
              </button>
              <button
                className="dialog-btn cancel-btn"
                onClick={() => setRemoveData(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sets;
