import { useState, useEffect, useCallback } from "react";
import type { BrickEntry, InventorySummary, PaginationMeta } from "shared";
import "./Inventory.css";

type GroupByOption = "none" | "category" | "color" | "partNumber";

interface GroupedItem {
  partNumber?: string;
  colorId?: number;
  colorName?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  totalQuantity: number;
  entryCount: number;
}

interface InventoryListResponse {
  data: BrickEntry[];
  summary: InventorySummary;
  pagination: PaginationMeta;
}

interface GroupedResponse {
  data: GroupedItem[];
  groupBy: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getAuthToken(): string | null {
  return localStorage.getItem("accessToken");
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

function Inventory() {
  const [items, setItems] = useState<BrickEntry[]>([]);
  const [groupedItems, setGroupedItems] = useState<GroupedItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    totalCount: 0,
    availableCount: 0,
    inUseCount: 0,
    inStorageCount: 0,
  });
  const [groupBy, setGroupBy] = useState<GroupByOption>("none");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      let url = `${API_BASE}/inventory?page=${page}&pageSize=50`;
      if (groupBy !== "none") {
        url += `&groupBy=${groupBy}`;
      }

      const response = await fetchWithAuth(url);

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Failed to fetch inventory (${response.status})`);
      }

      const data = await response.json();

      if (groupBy !== "none") {
        const grouped = data as GroupedResponse;
        setGroupedItems(grouped.data);
        setItems([]);
        setPagination(null);
      } else {
        const listData = data as InventoryListResponse;
        setItems(listData.data);
        setSummary(listData.summary);
        setPagination(listData.pagination);
        setGroupedItems([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [groupBy, page]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const handleGroupByChange = (option: GroupByOption) => {
    setGroupBy(option);
    setPage(1);
    setEditingId(null);
    setActionError(null);
  };

  const handleStartEdit = (item: BrickEntry) => {
    setEditingId(item.id);
    setEditQuantity(item.quantity);
    setActionError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setActionError(null);
  };

  const handleQuantityChange = (delta: number) => {
    setEditQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleSaveQuantity = async (item: BrickEntry) => {
    if (editQuantity === item.quantity) {
      setEditingId(null);
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_BASE}/inventory/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: editQuantity }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Failed to update quantity");
      }

      setEditingId(null);
      void fetchInventory();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleRemove = async (item: BrickEntry) => {
    const confirmMsg = `Remove "${item.partNumber}" (qty: ${item.quantity}) from inventory?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const response = await fetchWithAuth(
        `${API_BASE}/inventory/${item.id}?quantity=${item.quantity}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (errData?.error === "quantity_exceeded") {
          setActionError(
            `Cannot remove ${item.quantity} bricks. Only ${errData.maxAvailable} available.`
          );
          return;
        }
        throw new Error(errData?.message || "Failed to remove brick");
      }

      void fetchInventory();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const renderSummary = () => (
    <div className="inventory-summary">
      <div className="summary-card summary-total">
        <span className="summary-value">{summary.totalCount}</span>
        <span className="summary-label">Total</span>
      </div>
      <div className="summary-card summary-available">
        <span className="summary-value">{summary.availableCount}</span>
        <span className="summary-label">Available</span>
      </div>
      <div className="summary-card summary-in-use">
        <span className="summary-value">{summary.inUseCount}</span>
        <span className="summary-label">In Use</span>
      </div>
      <div className="summary-card summary-in-storage">
        <span className="summary-value">{summary.inStorageCount}</span>
        <span className="summary-label">In Storage</span>
      </div>
    </div>
  );

  const renderGroupToggle = () => (
    <div className="group-toggle" role="group" aria-label="Group inventory by">
      <button
        className={`toggle-btn ${groupBy === "none" ? "active" : ""}`}
        onClick={() => handleGroupByChange("none")}
        aria-pressed={groupBy === "none"}
      >
        All
      </button>
      <button
        className={`toggle-btn ${groupBy === "category" ? "active" : ""}`}
        onClick={() => handleGroupByChange("category")}
        aria-pressed={groupBy === "category"}
      >
        By Category
      </button>
      <button
        className={`toggle-btn ${groupBy === "color" ? "active" : ""}`}
        onClick={() => handleGroupByChange("color")}
        aria-pressed={groupBy === "color"}
      >
        By Color
      </button>
      <button
        className={`toggle-btn ${groupBy === "partNumber" ? "active" : ""}`}
        onClick={() => handleGroupByChange("partNumber")}
        aria-pressed={groupBy === "partNumber"}
      >
        By Part Number
      </button>
    </div>
  );

  const renderGroupedList = () => {
    if (groupedItems.length === 0) {
      return <p className="empty-message">No items found for this grouping.</p>;
    }

    return (
      <div className="inventory-list">
        {groupedItems.map((item, index) => {
          const label =
            groupBy === "category"
              ? item.categoryName || "Unknown Category"
              : groupBy === "color"
                ? item.colorName || `Color ${item.colorId}`
                : item.partNumber || "Unknown";

          return (
            <div key={`${groupBy}-${index}`} className="inventory-item grouped-item">
              <div className="item-info">
                <span className="item-label">{label}</span>
                <span className="item-meta">
                  {item.entryCount} type{item.entryCount !== 1 ? "s" : ""} - {item.totalQuantity} total
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderItemList = () => {
    if (items.length === 0) {
      return <p className="empty-message">No bricks in your inventory yet.</p>;
    }

    return (
      <div className="inventory-list">
        {items.map((item) => (
          <div key={item.id} className="inventory-item">
            <div className="item-info">
              <span className="item-part-number">{item.partNumber}</span>
              <span className="item-color">Color: {item.colorName || item.colorId}</span>
              <span className={`item-status status-${item.status}`}>{item.status}</span>
            </div>

            {editingId === item.id ? (
              <div className="item-edit">
                <button
                  className="qty-btn"
                  onClick={() => handleQuantityChange(-1)}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="qty-display">{editQuantity}</span>
                <button
                  className="qty-btn"
                  onClick={() => handleQuantityChange(1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
                <button
                  className="save-btn"
                  onClick={() => void handleSaveQuantity(item)}
                  aria-label="Save quantity"
                >
                  Save
                </button>
                <button
                  className="cancel-btn"
                  onClick={handleCancelEdit}
                  aria-label="Cancel edit"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="item-actions">
                <span className="item-quantity">Qty: {item.quantity}</span>
                <button
                  className="edit-btn"
                  onClick={() => handleStartEdit(item)}
                  aria-label={`Edit quantity for ${item.partNumber}`}
                >
                  Edit
                </button>
                <button
                  className="remove-btn"
                  onClick={() => void handleRemove(item)}
                  aria-label={`Remove ${item.partNumber}`}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderPagination = () => {
    if (!pagination || pagination.totalPages <= 1) return null;

    return (
      <div className="inventory-pagination">
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
    <div className="page inventory-page">
      <h2>Inventory</h2>

      {renderSummary()}
      {renderGroupToggle()}

      {actionError && (
        <div className="action-error" role="alert">
          {actionError}
          <button className="dismiss-btn" onClick={() => setActionError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {loading && <p className="loading-text">Loading inventory...</p>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {!loading && !error && (
        <>
          {groupBy !== "none" ? renderGroupedList() : renderItemList()}
          {groupBy === "none" && renderPagination()}
        </>
      )}
    </div>
  );
}

export default Inventory;
