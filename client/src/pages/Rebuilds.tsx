import { useState, useCallback } from "react";
import type { RebuildIdeaSummary, DifficultyLevel } from "shared";
import "./Rebuilds.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getAuthToken(): string | null {
  return localStorage.getItem("accessToken");
}

async function fetchWithAuth(url: string): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { headers });
}

interface RebuildResponse {
  data: RebuildIdeaSummary[];
  totalResults: number;
  message?: string;
}

const DIFFICULTY_OPTIONS: DifficultyLevel[] = ["Beginner", "Intermediate", "Advanced"];

function Rebuilds() {
  const [setNumbersInput, setSetNumbersInput] = useState("");
  const [results, setResults] = useState<RebuildIdeaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noResultsMessage, setNoResultsMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Filter state
  const [themeFilter, setThemeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyLevel | "">("");
  const [minCoverage, setMinCoverage] = useState(50);

  // Derived: unique themes from results for filtering
  const availableThemes = Array.from(
    new Set(results.map((r) => r.theme).filter((t): t is string => Boolean(t)))
  ).sort();

  const handleSearch = useCallback(async () => {
    const trimmed = setNumbersInput.trim();
    if (!trimmed) {
      setError("Please enter at least one set number.");
      return;
    }

    const setNumbers = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (setNumbers.length === 0) {
      setError("Please enter at least one set number.");
      return;
    }

    if (setNumbers.length > 10) {
      setError("Maximum of 10 set numbers allowed.");
      return;
    }

    setLoading(true);
    setError(null);
    setNoResultsMessage(null);
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      params.set("setNumbers", setNumbers.join(","));
      if (themeFilter) params.set("theme", themeFilter);
      if (difficultyFilter) params.set("difficulty", difficultyFilter);
      params.set("minCoverage", String(minCoverage));

      const response = await fetchWithAuth(
        `${API_BASE}/rebuilds?${params.toString()}`
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.message || `Failed to fetch rebuild ideas (${response.status})`
        );
      }

      const data: RebuildResponse = await response.json();
      setResults(data.data);
      setNoResultsMessage(data.message || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch rebuild ideas");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [setNumbersInput, themeFilter, difficultyFilter, minCoverage]);

  const getDifficultyClass = (difficulty: DifficultyLevel): string => {
    switch (difficulty) {
      case "Beginner":
        return "difficulty-badge difficulty-beginner";
      case "Intermediate":
        return "difficulty-badge difficulty-intermediate";
      case "Advanced":
        return "difficulty-badge difficulty-advanced";
      default:
        return "difficulty-badge";
    }
  };

  const filteredResults = results.filter((item) => {
    if (themeFilter && item.theme !== themeFilter) return false;
    if (difficultyFilter && item.difficulty !== difficultyFilter) return false;
    return true;
  });

  return (
    <div className="page rebuilds-page">
      <h2>Rebuild Ideas</h2>
      <p>Find alternative builds using bricks from your sets.</p>

      {/* Set numbers input */}
      <section className="rebuilds-input-section" aria-label="Select sets">
        <label htmlFor="set-numbers-input" className="input-label">
          Set Numbers (comma-separated, up to 10)
        </label>
        <div className="rebuilds-search-row">
          <input
            id="set-numbers-input"
            type="text"
            placeholder="e.g. 75257, 10281, 42130"
            value={setNumbersInput}
            onChange={(e) => setSetNumbersInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSearch();
            }}
            aria-label="Enter set numbers separated by commas"
          />
          <button
            onClick={() => void handleSearch()}
            disabled={loading || !setNumbersInput.trim()}
            className="search-btn"
          >
            {loading ? "Searching..." : "Find Rebuild Ideas"}
          </button>
        </div>
      </section>

      {/* Filters */}
      <section className="rebuilds-filters" aria-label="Filter rebuild ideas">
        <div className="filter-row">
          <div className="filter-group">
            <label htmlFor="theme-filter">Theme</label>
            <select
              id="theme-filter"
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
            >
              <option value="">All Themes</option>
              {availableThemes.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="difficulty-filter">Difficulty</label>
            <select
              id="difficulty-filter"
              value={difficultyFilter}
              onChange={(e) =>
                setDifficultyFilter(e.target.value as DifficultyLevel | "")
              }
            >
              <option value="">All Levels</option>
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="min-coverage-filter">
              Min Coverage: {minCoverage}%
            </label>
            <input
              id="min-coverage-filter"
              type="range"
              min={50}
              max={100}
              step={5}
              value={minCoverage}
              onChange={(e) => setMinCoverage(Number(e.target.value))}
              aria-label={`Minimum coverage percentage: ${minCoverage}%`}
            />
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="rebuilds-error" role="alert">
          {error}
          <button
            className="dismiss-btn"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="loading-text">Searching for rebuild ideas...</p>}

      {/* Results */}
      {!loading && hasSearched && filteredResults.length === 0 && (
        <div className="no-results" role="status">
          <p>
            {noResultsMessage ||
              "No rebuild ideas found matching your criteria."}
          </p>
          <p className="no-results-hint">
            Try selecting additional sets or lowering the minimum coverage
            percentage.
          </p>
        </div>
      )}

      {!loading && filteredResults.length > 0 && (
        <section className="rebuilds-results" aria-label="Rebuild ideas results">
          <p className="results-count">
            {filteredResults.length} rebuild idea
            {filteredResults.length !== 1 ? "s" : ""} found
          </p>
          <div className="rebuilds-grid" role="list">
            {filteredResults.map((idea) => (
              <div key={idea.id} className="rebuild-card" role="listitem">
                <div className="rebuild-card-image">
                  {idea.imageUrl ? (
                    <img src={idea.imageUrl} alt={idea.title} loading="lazy" />
                  ) : (
                    <div className="rebuild-card-placeholder" aria-label="No image">
                      🧱
                    </div>
                  )}
                </div>
                <div className="rebuild-card-body">
                  <h4 className="rebuild-card-title">{idea.title}</h4>
                  {idea.theme && (
                    <span className="rebuild-card-theme">{idea.theme}</span>
                  )}
                  <div className="rebuild-card-meta">
                    <span className="coverage-badge">
                      {idea.coveragePercentage}% coverage
                    </span>
                    <span className={getDifficultyClass(idea.difficulty)}>
                      {idea.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Rebuilds;
