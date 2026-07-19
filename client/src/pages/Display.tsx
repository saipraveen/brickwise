import { useState, useEffect, useCallback } from "react";
import type { DisplayCategory } from "shared";
import "./Display.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface DisplayIdeaItem {
  id: string;
  title: string;
  description: string;
  category: DisplayCategory;
  imageUrl: string;
  tips: string[];
}

interface FavoriteItem {
  id: string;
  displayIdeaId: string;
  title: string;
  category: DisplayCategory;
  savedAt: string;
}

function getAuthToken(): string | null {
  return localStorage.getItem("accessToken");
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

const CATEGORIES: DisplayCategory[] = [
  "shelf",
  "wall-mount",
  "diorama",
  "lighting",
  "stand",
];

const CATEGORY_LABELS: Record<DisplayCategory, string> = {
  shelf: "Shelf",
  "wall-mount": "Wall Mount",
  diorama: "Diorama",
  lighting: "Lighting",
  stand: "Stand",
};

const CATEGORY_ICONS: Record<DisplayCategory, string> = {
  shelf: "📚",
  "wall-mount": "🖼️",
  diorama: "🏞️",
  lighting: "💡",
  stand: "🗄️",
};

type ViewMode = "ideas" | "favorites";

function Display() {
  const [ideas, setIdeas] = useState<DisplayIdeaItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<DisplayCategory | "">("");
  const [viewMode, setViewMode] = useState<ViewMode>("ideas");
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = `${API_BASE}/display-ideas`;
      if (categoryFilter) {
        url += `?category=${categoryFilter}`;
      }

      const response = await fetchWithAuth(url);

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.message || `Failed to fetch display ideas (${response.status})`
        );
      }

      const data = await response.json();
      setIdeas(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load display ideas");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  const fetchFavorites = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/display-ideas/favorites`);

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.message || `Failed to fetch favorites (${response.status})`
        );
      }

      const data = await response.json();
      setFavorites(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load favorites");
    }
  }, []);

  useEffect(() => {
    void fetchIdeas();
    void fetchFavorites();
  }, [fetchIdeas, fetchFavorites]);

  const handleSaveFavorite = async (ideaId: string) => {
    setSavingId(ideaId);
    setActionError(null);

    try {
      const response = await fetchWithAuth(`${API_BASE}/display-ideas/favorites`, {
        method: "POST",
        body: JSON.stringify({ ideaId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (errData?.error === "conflict") {
          setActionError("Already in favorites!");
          return;
        }
        if (errData?.error === "limit_exceeded") {
          setActionError("Maximum of 100 favorites reached.");
          return;
        }
        throw new Error(errData?.message || "Failed to save favorite");
      }

      // Refresh favorites
      await fetchFavorites();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save favorite");
    } finally {
      setSavingId(null);
    }
  };

  const handleRemoveFavorite = async (ideaId: string) => {
    setActionError(null);

    try {
      const response = await fetchWithAuth(
        `${API_BASE}/display-ideas/favorites/${ideaId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Failed to remove favorite");
      }

      // Refresh favorites
      await fetchFavorites();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to remove favorite"
      );
    }
  };

  const isFavorited = (ideaId: string): boolean => {
    return favorites.some((f) => f.displayIdeaId === ideaId);
  };

  const renderCategoryFilters = () => (
    <div className="category-filters" role="group" aria-label="Filter by category">
      <button
        className={`category-btn ${categoryFilter === "" ? "active" : ""}`}
        onClick={() => setCategoryFilter("")}
        aria-pressed={categoryFilter === ""}
      >
        All
      </button>
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          className={`category-btn ${categoryFilter === cat ? "active" : ""}`}
          onClick={() => setCategoryFilter(cat)}
          aria-pressed={categoryFilter === cat}
        >
          <span className="category-icon">{CATEGORY_ICONS[cat]}</span>
          {CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  );

  const renderViewToggle = () => (
    <div className="view-toggle" role="group" aria-label="Switch view">
      <button
        className={`toggle-btn ${viewMode === "ideas" ? "active" : ""}`}
        onClick={() => setViewMode("ideas")}
        aria-pressed={viewMode === "ideas"}
      >
        Ideas
      </button>
      <button
        className={`toggle-btn ${viewMode === "favorites" ? "active" : ""}`}
        onClick={() => setViewMode("favorites")}
        aria-pressed={viewMode === "favorites"}
      >
        Favorites ({favorites.length}/100)
      </button>
    </div>
  );

  const renderIdeas = () => {
    if (ideas.length === 0) {
      return (
        <div className="no-results" role="status">
          <p>No display ideas found for this category.</p>
          <p className="no-results-hint">Try selecting a different category.</p>
        </div>
      );
    }

    return (
      <div className="display-grid" role="list">
        {ideas.map((idea) => (
          <div key={idea.id} className="display-card" role="listitem">
            <div className="display-card-header">
              <span className="display-category-tag">
                {CATEGORY_ICONS[idea.category]} {CATEGORY_LABELS[idea.category]}
              </span>
              <button
                className={`favorite-btn ${isFavorited(idea.id) ? "favorited" : ""}`}
                onClick={() => void handleSaveFavorite(idea.id)}
                disabled={savingId === idea.id || isFavorited(idea.id)}
                aria-label={
                  isFavorited(idea.id)
                    ? `${idea.title} is in favorites`
                    : `Save ${idea.title} to favorites`
                }
              >
                {isFavorited(idea.id) ? "★" : "☆"}
              </button>
            </div>
            <div className="display-card-image">
              {idea.imageUrl ? (
                <img src={idea.imageUrl} alt={idea.title} loading="lazy" />
              ) : (
                <div className="display-card-placeholder" aria-label="No image">
                  {CATEGORY_ICONS[idea.category]}
                </div>
              )}
            </div>
            <div className="display-card-body">
              <h4 className="display-card-title">{idea.title}</h4>
              <p className="display-card-description">{idea.description}</p>
              {idea.tips.length > 0 && (
                <ul className="display-card-tips">
                  {idea.tips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFavorites = () => {
    if (favorites.length === 0) {
      return (
        <div className="no-results" role="status">
          <p>No favorites saved yet.</p>
          <p className="no-results-hint">
            Browse display ideas and save your favorites for quick access.
          </p>
        </div>
      );
    }

    return (
      <div className="favorites-list" role="list">
        {favorites.map((fav) => (
          <div key={fav.id} className="favorite-item" role="listitem">
            <div className="favorite-info">
              <span className="favorite-category-tag">
                {CATEGORY_ICONS[fav.category]} {CATEGORY_LABELS[fav.category]}
              </span>
              <span className="favorite-title">{fav.title}</span>
              <span className="favorite-date">
                Saved {new Date(fav.savedAt).toLocaleDateString()}
              </span>
            </div>
            <button
              className="remove-favorite-btn"
              onClick={() => void handleRemoveFavorite(fav.displayIdeaId)}
              aria-label={`Remove ${fav.title} from favorites`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page display-page">
      <h2>Display Inspiration</h2>
      <p>Creative ideas for showcasing your builds.</p>

      {renderViewToggle()}

      {viewMode === "ideas" && renderCategoryFilters()}

      {/* Action error */}
      {actionError && (
        <div className="action-error" role="alert">
          {actionError}
          <button
            className="dismiss-btn"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Loading / Error */}
      {loading && <p className="loading-text">Loading display ideas...</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {/* Content */}
      {!loading && !error && (
        <>{viewMode === "ideas" ? renderIdeas() : renderFavorites()}</>
      )}
    </div>
  );
}

export default Display;
