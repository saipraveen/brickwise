import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SearchResults,
  BrickEntry,
  SetEntry,
  MocSummary,
  RebuildIdeaSummary,
  PaginationMeta,
} from "shared";
import "./Search.css";

type Domain = "inventory" | "collection" | "mocs" | "rebuilds";

interface DomainPagination {
  inventory: number;
  collection: number;
  mocs: number;
  rebuilds: number;
}

interface Filters {
  inventoryStatus: string;
  collectionTheme: string;
  collectionStatus: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 50;

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

function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<Domain>>(
    new Set(["inventory", "collection", "mocs", "rebuilds"]),
  );
  const [pages, setPages] = useState<DomainPagination>({
    inventory: 1,
    collection: 1,
    mocs: 1,
    rebuilds: 1,
  });
  const [filters, setFilters] = useState<Filters>({
    inventoryStatus: "",
    collectionTheme: "",
    collectionStatus: "",
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildSearchUrl = useCallback(
    (domain?: Domain, page?: number): string => {
      const params = new URLSearchParams();
      params.set("query", query.trim());
      params.set("pageSize", String(PAGE_SIZE));

      if (domain) {
        params.set("domain", domain);
        params.set("page", String(page ?? pages[domain]));
      } else {
        params.set("page", "1");
      }

      // Build filters in bracket notation
      if (filters.inventoryStatus) {
        params.set("filters[status]", filters.inventoryStatus);
      }
      if (filters.collectionTheme) {
        params.set("filters[theme]", filters.collectionTheme);
      }
      if (filters.collectionStatus && !filters.inventoryStatus) {
        params.set("filters[status]", filters.collectionStatus);
      }

      return `${API_BASE}/search?${params.toString()}`;
    },
    [query, pages, filters],
  );

  const fetchResults = useCallback(
    async (domain?: Domain, page?: number) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = buildSearchUrl(domain, page);
        const res = await fetch(url, { headers: authHeaders() });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(
            json?.message || `Search failed (${res.status})`,
          );
        }

        const data: SearchResults = await res.json();

        if (domain) {
          // Merge single-domain result into existing results
          setResults((prev) => (prev ? { ...prev, ...data } : data));
        } else {
          setResults(data);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Search failed",
        );
      } finally {
        setLoading(false);
      }
    },
    [query, buildSearchUrl],
  );

  // Debounced search on query or filter changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setPages({ inventory: 1, collection: 1, mocs: 1, rebuilds: 1 });
      void fetchResults();
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, filters, fetchResults]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleClearSearch = () => {
    setQuery("");
    setResults(null);
    setError(null);
    setFilters({ inventoryStatus: "", collectionTheme: "", collectionStatus: "" });
  };

  const toggleDomain = (domain: Domain) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  const handleLoadMore = (domain: Domain) => {
    const nextPage = pages[domain] + 1;
    setPages((prev) => ({ ...prev, [domain]: nextPage }));
    void fetchResults(domain, nextPage);
  };

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({ inventoryStatus: "", collectionTheme: "", collectionStatus: "" });
  };

  const hasActiveFilters =
    filters.inventoryStatus !== "" ||
    filters.collectionTheme !== "" ||
    filters.collectionStatus !== "";

  const renderPaginationInfo = (pagination: PaginationMeta, domain: Domain) => {
    if (pagination.totalItems === 0) return null;

    const showing = Math.min(pages[domain] * PAGE_SIZE, pagination.totalItems);

    return (
      <div className="search-pagination">
        <span className="pagination-info">
          Showing {showing} of {pagination.totalItems}
        </span>
        {pagination.hasNextPage && (
          <button
            className="load-more-btn"
            onClick={() => handleLoadMore(domain)}
            disabled={loading}
          >
            Load More
          </button>
        )}
      </div>
    );
  };

  const renderInventoryResults = (
    data: BrickEntry[],
    pagination: PaginationMeta,
  ) => {
    if (data.length === 0) {
      return <p className="domain-empty">No matching inventory items found.</p>;
    }

    return (
      <>
        <ul className="search-results-list" aria-label="Inventory results">
          {data.map((item) => (
            <li key={item.id} className="search-result-item">
              <span className="result-primary">{item.partNumber}</span>
              <span className="result-secondary">
                {item.colorName} - Qty: {item.quantity}
              </span>
              <span className={`result-badge status-${item.status}`}>
                {item.status}
              </span>
            </li>
          ))}
        </ul>
        {renderPaginationInfo(pagination, "inventory")}
      </>
    );
  };

  const renderCollectionResults = (
    data: SetEntry[],
    pagination: PaginationMeta,
  ) => {
    if (data.length === 0) {
      return <p className="domain-empty">No matching sets found.</p>;
    }

    return (
      <>
        <ul className="search-results-list" aria-label="Collection results">
          {data.map((item) => (
            <li key={item.id} className="search-result-item">
              <span className="result-primary">
                {item.setNumber} - {item.name}
              </span>
              <span className="result-secondary">
                {item.theme} ({item.year}) - {item.pieceCount} pieces
              </span>
              <span className={`result-badge status-${item.status}`}>
                {item.status}
              </span>
            </li>
          ))}
        </ul>
        {renderPaginationInfo(pagination, "collection")}
      </>
    );
  };

  const renderMocsResults = (
    data: MocSummary[],
    pagination: PaginationMeta,
  ) => {
    if (data.length === 0) {
      return <p className="domain-empty">No matching MOCs found.</p>;
    }

    return (
      <>
        <ul className="search-results-list" aria-label="MOC results">
          {data.map((item) => (
            <li key={item.id} className="search-result-item">
              <span className="result-primary">{item.title}</span>
              <span className="result-secondary">
                by {item.designer} - {item.pieceCount} pieces
              </span>
              {item.coveragePercentage !== undefined && (
                <span className="result-badge coverage">
                  {item.coveragePercentage}% buildable
                </span>
              )}
            </li>
          ))}
        </ul>
        {renderPaginationInfo(pagination, "mocs")}
      </>
    );
  };

  const renderRebuildsResults = (
    data: RebuildIdeaSummary[],
    pagination: PaginationMeta,
    message?: string,
  ) => {
    if (data.length === 0 && message) {
      return <p className="domain-empty">{message}</p>;
    }

    if (data.length === 0) {
      return <p className="domain-empty">No matching rebuild ideas found.</p>;
    }

    return (
      <>
        <ul className="search-results-list" aria-label="Rebuild results">
          {data.map((item) => (
            <li key={item.id} className="search-result-item">
              <span className="result-primary">{item.title}</span>
              <span className="result-secondary">
                {item.difficulty} - {item.coveragePercentage}% coverage
              </span>
              {item.theme && (
                <span className="result-badge">{item.theme}</span>
              )}
            </li>
          ))}
        </ul>
        {renderPaginationInfo(pagination, "rebuilds")}
      </>
    );
  };

  const renderDomainSection = (
    domain: Domain,
    label: string,
    count: number,
    content: React.ReactNode,
  ) => {
    const isExpanded = expandedDomains.has(domain);

    return (
      <section
        key={domain}
        className="search-domain-section"
        aria-label={`${label} results`}
      >
        <button
          className="domain-header"
          onClick={() => toggleDomain(domain)}
          aria-expanded={isExpanded}
          aria-controls={`domain-${domain}`}
        >
          <span className="domain-label">{label}</span>
          <span className="domain-count">({count})</span>
          <span className="domain-toggle">{isExpanded ? "▾" : "▸"}</span>
        </button>
        {isExpanded && (
          <div id={`domain-${domain}`} className="domain-content">
            {content}
          </div>
        )}
      </section>
    );
  };

  const renderResults = () => {
    if (!results) return null;

    const sections: React.ReactNode[] = [];

    if (results.inventory) {
      sections.push(
        renderDomainSection(
          "inventory",
          "Inventory",
          results.inventory.pagination.totalItems,
          renderInventoryResults(
            results.inventory.data,
            results.inventory.pagination,
          ),
        ),
      );
    }

    if (results.collection) {
      sections.push(
        renderDomainSection(
          "collection",
          "Collection",
          results.collection.pagination.totalItems,
          renderCollectionResults(
            results.collection.data,
            results.collection.pagination,
          ),
        ),
      );
    }

    if (results.mocs) {
      sections.push(
        renderDomainSection(
          "mocs",
          "MOCs",
          results.mocs.pagination.totalItems,
          renderMocsResults(results.mocs.data, results.mocs.pagination),
        ),
      );
    }

    if (results.rebuilds) {
      sections.push(
        renderDomainSection(
          "rebuilds",
          "Rebuilds",
          results.rebuilds.pagination.totalItems,
          renderRebuildsResults(
            results.rebuilds.data,
            results.rebuilds.pagination,
            results.rebuilds.message,
          ),
        ),
      );
    }

    if (sections.length === 0) {
      return (
        <p className="search-no-results">
          No results found. Try broadening your search criteria.
        </p>
      );
    }

    return <div className="search-results">{sections}</div>;
  };

  const renderFilters = () => (
    <div className="search-filters" aria-label="Search filters">
      <div className="filter-group">
        <label htmlFor="filter-inventory-status" className="filter-label">
          Inventory Status:
        </label>
        <select
          id="filter-inventory-status"
          className="filter-select"
          value={filters.inventoryStatus}
          onChange={(e) =>
            handleFilterChange("inventoryStatus", e.target.value)
          }
        >
          <option value="">All</option>
          <option value="available">Available</option>
          <option value="in-use">In Use</option>
          <option value="in-storage">In Storage</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="filter-collection-theme" className="filter-label">
          Collection Theme:
        </label>
        <input
          id="filter-collection-theme"
          type="text"
          className="filter-input"
          placeholder="e.g. Technic, City..."
          value={filters.collectionTheme}
          onChange={(e) =>
            handleFilterChange("collectionTheme", e.target.value)
          }
        />
      </div>

      <div className="filter-group">
        <label htmlFor="filter-collection-status" className="filter-label">
          Collection Status:
        </label>
        <select
          id="filter-collection-status"
          className="filter-select"
          value={filters.collectionStatus}
          onChange={(e) =>
            handleFilterChange("collectionStatus", e.target.value)
          }
        >
          <option value="">All</option>
          <option value="built">Built</option>
          <option value="disassembled">Disassembled</option>
          <option value="partial">Partial</option>
        </select>
      </div>

      {hasActiveFilters && (
        <button
          className="clear-filters-btn"
          onClick={handleClearFilters}
          aria-label="Clear all filters"
        >
          Clear Filters
        </button>
      )}
    </div>
  );

  return (
    <div className="page search-page">
      <h2>Search</h2>
      <p>Search across your inventory, collection, and MOCs.</p>

      {/* Search input */}
      <div className="search-input-container">
        <input
          type="search"
          className="search-input"
          placeholder="Search by name, part number, set number, theme, or designer (min 2 chars)"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search across all domains"
          minLength={MIN_QUERY_LENGTH}
        />
        {query && (
          <button
            className="search-clear-btn"
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="search-hint">Enter at least 2 characters to search.</p>
      )}

      {/* Filters */}
      {renderFilters()}

      {/* Cached data warning */}
      {results?.cachedDataWarning && (
        <div className="cached-data-warning" role="alert">
          ⚠️ {results.cachedDataWarning}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="search-error" role="alert">
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

      {/* Loading */}
      {loading && <p className="search-loading">Searching...</p>}

      {/* No results message */}
      {!loading &&
        !error &&
        results &&
        !results.inventory &&
        !results.collection &&
        !results.mocs &&
        !results.rebuilds && (
          <p className="search-no-results">
            No results found. Try broadening your search criteria.
          </p>
        )}

      {/* Results grouped by domain */}
      {!loading && renderResults()}
    </div>
  );
}

export default Search;
