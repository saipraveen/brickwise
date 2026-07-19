import { useState, useEffect, useCallback } from "react";
import type {
  MocSummary,
  BuildabilityResponse,
  PaginationMeta,
  CoverageResult,
  MissingPart,
} from "shared";
import "./Mocs.css";

type ViewMode = "browse" | "wishlist";

interface WishlistItem extends MocSummary {
  savedAt?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

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

function Mocs() {
  const [viewMode, setViewMode] = useState<ViewMode>("browse");
  const [mocs, setMocs] = useState<MocSummary[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [themeFilter, setThemeFilter] = useState("");

  // Buildability state
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [buildabilityResults, setBuildabilityResults] = useState<
    Record<string, CoverageResult>
  >({});

  // Wishlist save state
  const [savingId, setSavingId] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  const fetchMocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/mocs?page=${page}&pageSize=20`;
      if (themeFilter) {
        url += `&theme=${encodeURIComponent(themeFilter)}`;
      }
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 503) {
        const json = await res.json();
        setError(
          json.message ||
            "MOC data cannot be loaded. Please retry.",
        );
        setMocs([]);
        setPagination(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch MOCs: ${res.status}`);
      }
      const json = await res.json();
      setMocs(json.data ?? []);
      setPagination(json.pagination ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MOCs");
    } finally {
      setLoading(false);
    }
  }, [page, themeFilter]);

  const fetchWishlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/mocs/wishlist`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch wishlist: ${res.status}`);
      }
      const json = await res.json();
      const items: WishlistItem[] = json.data ?? [];
      setWishlist(items);
      setWishlistIds(new Set(items.map((item) => item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wishlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "browse") {
      void fetchMocs();
    } else {
      void fetchWishlist();
    }
  }, [viewMode, fetchMocs, fetchWishlist]);

  // Also fetch wishlist IDs when in browse mode to show "saved" status
  useEffect(() => {
    if (viewMode === "browse") {
      fetch(`${API_BASE}/mocs/wishlist`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((json) => {
          const ids = new Set<string>(
            (json.data ?? []).map((item: WishlistItem) => item.id),
          );
          setWishlistIds(ids);
        })
        .catch(() => {
          // Silently fail - wishlist status is non-critical
        });
    }
  }, [viewMode]);

  const handleCheckBuildability = async (mocId: string) => {
    setCheckingId(mocId);
    try {
      const res = await fetch(`${API_BASE}/mocs/${mocId}/buildability`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || "Failed to check buildability");
      }
      const json: BuildabilityResponse = await res.json();
      setBuildabilityResults((prev) => ({
        ...prev,
        [mocId]: json.coverage,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to check buildability",
      );
    } finally {
      setCheckingId(null);
    }
  };

  const handleSaveToWishlist = async (moc: MocSummary) => {
    setSavingId(moc.id);
    try {
      const res = await fetch(`${API_BASE}/mocs/wishlist`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          mocId: moc.id,
          title: moc.title,
          thumbnailUrl: moc.thumbnailUrl,
          designer: moc.designer,
          pieceCount: moc.pieceCount,
        }),
      });
      if (res.status === 409) {
        // Already in wishlist
        setWishlistIds((prev) => new Set([...prev, moc.id]));
        return;
      }
      if (res.status === 400) {
        const json = await res.json();
        if (json.error === "limit_exceeded") {
          setError(json.message);
          return;
        }
      }
      if (!res.ok) {
        throw new Error("Failed to save to wishlist");
      }
      setWishlistIds((prev) => new Set([...prev, moc.id]));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save to wishlist",
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleRemoveFromWishlist = async (mocId: string) => {
    try {
      const res = await fetch(`${API_BASE}/mocs/wishlist/${mocId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error("Failed to remove from wishlist");
      }
      setWishlistIds((prev) => {
        const updated = new Set(prev);
        updated.delete(mocId);
        return updated;
      });
      if (viewMode === "wishlist") {
        setWishlist((prev) => prev.filter((item) => item.id !== mocId));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove from wishlist",
      );
    }
  };

  const handleThemeFilterChange = (theme: string) => {
    setThemeFilter(theme);
    setPage(1);
  };

  const renderCoverageBar = (percentage: number) => {
    const barClass =
      percentage === 100
        ? "coverage-bar-fill full"
        : percentage >= 75
          ? "coverage-bar-fill high"
          : percentage >= 50
            ? "coverage-bar-fill medium"
            : "coverage-bar-fill low";

    return (
      <div className="coverage-bar" aria-label={`${percentage}% coverage`}>
        <div className={barClass} style={{ width: `${percentage}%` }} />
        <span className="coverage-text">{percentage}%</span>
      </div>
    );
  };

  const renderMissingParts = (missingParts: MissingPart[]) => {
    if (missingParts.length === 0) return null;

    return (
      <div className="missing-parts">
        <h5>Missing Parts ({missingParts.length})</h5>
        <ul className="missing-parts-list">
          {missingParts.slice(0, 10).map((part, idx) => (
            <li key={idx} className="missing-part-item">
              <span className="part-number">{part.partNumber}</span>
              <span className="part-color">{part.colorName || `Color ${part.colorId}`}</span>
              <span className="part-qty">
                Need {part.quantityNeeded} (have {part.quantityOwned})
              </span>
            </li>
          ))}
          {missingParts.length > 10 && (
            <li className="missing-part-more">
              ...and {missingParts.length - 10} more
            </li>
          )}
        </ul>
      </div>
    );
  };

  const renderMocCard = (moc: MocSummary) => {
    const coverage = buildabilityResults[moc.id];
    const isInWishlist = wishlistIds.has(moc.id);
    const isChecking = checkingId === moc.id;
    const isSaving = savingId === moc.id;

    return (
      <div key={moc.id} className="moc-card" role="listitem">
        <div className="moc-card-image">
          {moc.thumbnailUrl ? (
            <img src={moc.thumbnailUrl} alt={moc.title} loading="lazy" />
          ) : (
            <div className="moc-card-placeholder" aria-label="No image">
              🧱
            </div>
          )}
        </div>
        <div className="moc-card-body">
          <h4 className="moc-card-title">{moc.title}</h4>
          <p className="moc-card-meta">
            <span className="moc-designer">by {moc.designer}</span>
            <span className="moc-pieces">{moc.pieceCount} pieces</span>
            {moc.theme && <span className="moc-theme">{moc.theme}</span>}
          </p>

          {/* Coverage from list (calculated server-side) */}
          {moc.coveragePercentage !== undefined && !coverage && (
            <div className="moc-coverage-inline">
              {renderCoverageBar(moc.coveragePercentage)}
            </div>
          )}

          {/* Detailed coverage from buildability check */}
          {coverage && (
            <div className="moc-buildability">
              {renderCoverageBar(coverage.percentage)}
              {coverage.percentage < 100 &&
                renderMissingParts(coverage.missingParts)}
            </div>
          )}
        </div>
        <div className="moc-card-actions">
          <button
            className="action-btn buildability-btn"
            onClick={() => void handleCheckBuildability(moc.id)}
            disabled={isChecking}
            aria-label={`Check buildability for ${moc.title}`}
          >
            {isChecking ? "Checking..." : "Check Buildability"}
          </button>

          {isInWishlist ? (
            <button
              className="action-btn wishlist-btn saved"
              onClick={() => void handleRemoveFromWishlist(moc.id)}
              aria-label={`Remove ${moc.title} from wishlist`}
            >
              ♥ Saved
            </button>
          ) : (
            <button
              className="action-btn wishlist-btn"
              onClick={() => void handleSaveToWishlist(moc)}
              disabled={isSaving}
              aria-label={`Save ${moc.title} to wishlist`}
            >
              {isSaving ? "Saving..." : "♡ Save to Wishlist"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    if (!pagination || pagination.totalPages <= 1) return null;

    return (
      <div className="mocs-pagination">
        <button
          className="page-btn"
          disabled={!pagination.hasPreviousPage}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span className="page-info">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          className="page-btn"
          disabled={!pagination.hasNextPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    );
  };

  return (
    <div className="page mocs-page">
      <h2>MOC Discovery</h2>
      <p>Browse community MOC designs and alternate builds.</p>

      {/* View mode toggle */}
      <div className="mocs-view-toggle" role="group" aria-label="View mode">
        <button
          className={`toggle-btn ${viewMode === "browse" ? "active" : ""}`}
          onClick={() => setViewMode("browse")}
          aria-pressed={viewMode === "browse"}
        >
          Browse MOCs
        </button>
        <button
          className={`toggle-btn ${viewMode === "wishlist" ? "active" : ""}`}
          onClick={() => setViewMode("wishlist")}
          aria-pressed={viewMode === "wishlist"}
        >
          My Wishlist ({wishlistIds.size})
        </button>
      </div>

      {/* Theme filter (browse mode only) */}
      {viewMode === "browse" && (
        <div className="mocs-filters">
          <label htmlFor="theme-filter" className="filter-label">
            Filter by theme:
          </label>
          <input
            id="theme-filter"
            type="text"
            className="filter-input"
            placeholder="e.g. Technic, City, Star Wars..."
            value={themeFilter}
            onChange={(e) => handleThemeFilterChange(e.target.value)}
            aria-label="Filter MOCs by theme"
          />
          {themeFilter && (
            <button
              className="clear-filter-btn"
              onClick={() => handleThemeFilterChange("")}
              aria-label="Clear theme filter"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mocs-error" role="alert">
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

      {/* Loading state */}
      {loading && <p className="mocs-loading">Loading...</p>}

      {/* Browse mode content */}
      {!loading && !error && viewMode === "browse" && (
        <>
          {mocs.length === 0 ? (
            <p className="mocs-empty">
              No MOC designs found. Add sets to your collection to discover
              alternate builds.
            </p>
          ) : (
            <div className="mocs-grid" role="list" aria-label="MOC designs">
              {mocs.map(renderMocCard)}
            </div>
          )}
          {renderPagination()}
        </>
      )}

      {/* Wishlist mode content */}
      {!loading && !error && viewMode === "wishlist" && (
        <>
          {wishlist.length === 0 ? (
            <p className="mocs-empty">
              Your wishlist is empty. Browse MOCs and save your favorites.
            </p>
          ) : (
            <div className="mocs-grid" role="list" aria-label="Wishlist MOCs">
              {wishlist.map(renderMocCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Mocs;
