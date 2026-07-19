import { useState, useEffect, useCallback } from "react";
import type { BagOverview, BagLocation } from "shared";
import "./Bags.css";

interface BagWithId extends BagOverview {
  id: string;
}

interface BagBrick {
  id: string;
  partNumber: string;
  colorId: number;
  quantity: number;
}

interface AssignFormData {
  partNumber: string;
  colorId: string;
  quantity: string;
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

function Bags() {
  const [bags, setBags] = useState<BagWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Expanded bag state
  const [expandedBagId, setExpandedBagId] = useState<string | null>(null);
  const [bagBricks, setBagBricks] = useState<BagBrick[]>([]);
  const [loadingBricks, setLoadingBricks] = useState(false);

  // Assign bricks form
  const [assignForm, setAssignForm] = useState<AssignFormData>({
    partNumber: "",
    colorId: "",
    quantity: "1",
  });
  const [assigning, setAssigning] = useState(false);

  // Brick location lookup
  const [lookupPartNumber, setLookupPartNumber] = useState("");
  const [lookupResults, setLookupResults] = useState<BagLocation[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const fetchBags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`${API_BASE}/bags`);
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Failed to fetch bags (${response.status})`);
      }
      const json = await response.json();
      setBags(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBags();
  }, [fetchBags]);

  const handleCreateBag = async () => {
    setCreating(true);
    setActionError(null);
    try {
      const response = await fetchWithAuth(`${API_BASE}/bags`, {
        method: "POST",
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Failed to create bag");
      }
      await fetchBags();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create bag");
    } finally {
      setCreating(false);
    }
  };

  const handleExpandBag = async (bag: BagWithId) => {
    if (expandedBagId === bag.id) {
      setExpandedBagId(null);
      setBagBricks([]);
      return;
    }
    setExpandedBagId(bag.id);
    setLoadingBricks(true);
    setBagBricks([]);
    try {
      const response = await fetchWithAuth(`${API_BASE}/bags/${bag.id}/bricks`);
      if (!response.ok) {
        throw new Error("Failed to load bricks");
      }
      const json = await response.json();
      setBagBricks(json.data ?? []);
    } catch {
      setBagBricks([]);
    } finally {
      setLoadingBricks(false);
    }
  };

  const handleAssignBricks = async (bagId: string) => {
    const { partNumber, colorId, quantity } = assignForm;
    if (!partNumber.trim() || !colorId.trim() || !quantity.trim()) {
      setActionError("All fields are required to assign bricks");
      return;
    }
    const colorIdNum = Number(colorId);
    const quantityNum = Number(quantity);
    if (isNaN(colorIdNum) || colorIdNum < 0) {
      setActionError("Color ID must be a non-negative number");
      return;
    }
    if (isNaN(quantityNum) || quantityNum < 1) {
      setActionError("Quantity must be at least 1");
      return;
    }

    setAssigning(true);
    setActionError(null);
    try {
      const response = await fetchWithAuth(`${API_BASE}/bags/${bagId}/bricks`, {
        method: "POST",
        body: JSON.stringify({
          bricks: [{ partNumber: partNumber.trim(), colorId: colorIdNum, quantity: quantityNum }],
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (errData?.error === "insufficient_inventory") {
          const unavailable = errData.unavailableBricks?.[0];
          throw new Error(
            `Brick "${unavailable?.partNumber}" not available. Have ${unavailable?.available ?? 0}, need ${unavailable?.requested ?? quantityNum}.`
          );
        }
        throw new Error(errData?.message || "Failed to assign bricks");
      }
      setAssignForm({ partNumber: "", colorId: "", quantity: "1" });
      // Refresh bag bricks and overview
      await fetchBags();
      const bricksRes = await fetchWithAuth(`${API_BASE}/bags/${bagId}/bricks`);
      if (bricksRes.ok) {
        const json = await bricksRes.json();
        setBagBricks(json.data ?? []);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to assign bricks");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveBrick = async (bagId: string, brickId: string, maxQty: number) => {
    const qtyStr = window.prompt(`Remove how many? (max ${maxQty})`, String(maxQty));
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (isNaN(qty) || qty < 1 || qty > maxQty) {
      setActionError(`Quantity must be between 1 and ${maxQty}`);
      return;
    }

    setActionError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE}/bags/${bagId}/bricks/${brickId}?quantity=${qty}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Failed to remove brick");
      }
      await fetchBags();
      // Refresh expanded bag bricks
      const bricksRes = await fetchWithAuth(`${API_BASE}/bags/${bagId}/bricks`);
      if (bricksRes.ok) {
        const json = await bricksRes.json();
        setBagBricks(json.data ?? []);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove brick");
    }
  };

  const handleLookup = async () => {
    const trimmed = lookupPartNumber.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResults(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE}/bags/locate?partNumber=${encodeURIComponent(trimmed)}`
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Lookup failed");
      }
      const json = await response.json();
      setLookupResults(json.data ?? []);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="page bags-page">
      <h2>Storage Bags</h2>
      <p className="bags-description">Manage your numbered storage bags for physical brick organization.</p>

      {/* Brick Location Lookup */}
      <section className="bags-lookup-section" aria-label="Brick location lookup">
        <h3>Find a Brick</h3>
        <div className="lookup-row">
          <input
            type="text"
            placeholder="Enter part number..."
            value={lookupPartNumber}
            onChange={(e) => setLookupPartNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleLookup(); }}
            aria-label="Part number to look up"
          />
          <button
            onClick={() => void handleLookup()}
            disabled={lookupLoading || !lookupPartNumber.trim()}
            className="lookup-btn"
          >
            {lookupLoading ? "Searching..." : "Locate"}
          </button>
        </div>
        {lookupError && <p className="lookup-error" role="alert">{lookupError}</p>}
        {lookupResults !== null && (
          <div className="lookup-results" role="region" aria-label="Lookup results">
            {lookupResults.length === 0 ? (
              <p className="lookup-empty">No bags contain this brick.</p>
            ) : (
              <ul className="lookup-list">
                {lookupResults.map((loc) => (
                  <li key={loc.bagNumber} className="lookup-item">
                    <span className="lookup-bag-number">Bag #{loc.bagNumber}</span>
                    <span className="lookup-quantity">Qty: {loc.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Action errors */}
      {actionError && (
        <div className="action-error" role="alert">
          {actionError}
          <button className="dismiss-btn" onClick={() => setActionError(null)} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      {/* Create new bag */}
      <div className="bags-header">
        <h3>My Bags ({bags.length})</h3>
        <button
          className="create-bag-btn"
          onClick={() => void handleCreateBag()}
          disabled={creating}
        >
          {creating ? "Creating..." : "+ Create New Bag"}
        </button>
      </div>

      {loading && <p className="loading-text">Loading bags...</p>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {!loading && !error && bags.length === 0 && (
        <p className="empty-message">No storage bags yet. Create one to get started.</p>
      )}

      {/* Bag overview cards */}
      {!loading && !error && bags.length > 0 && (
        <div className="bags-list" role="list">
          {bags.map((bag) => (
            <div key={bag.id} className="bag-card" role="listitem">
              <div
                className="bag-card-header"
                onClick={() => void handleExpandBag(bag)}
                role="button"
                tabIndex={0}
                aria-expanded={expandedBagId === bag.id}
                aria-label={`Bag #${bag.bagNumber}, ${bag.distinctBrickTypes} types, ${bag.totalBrickCount} bricks`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void handleExpandBag(bag); }}
              >
                <span className="bag-number">Bag #{bag.bagNumber}</span>
                <div className="bag-stats">
                  <span className="bag-stat">{bag.distinctBrickTypes} type{bag.distinctBrickTypes !== 1 ? "s" : ""}</span>
                  <span className="bag-stat">{bag.totalBrickCount} brick{bag.totalBrickCount !== 1 ? "s" : ""}</span>
                </div>
                <span className="bag-expand-icon">{expandedBagId === bag.id ? "▾" : "▸"}</span>
              </div>

              {expandedBagId === bag.id && (
                <div className="bag-card-body">
                  {/* Bricks in this bag */}
                  {loadingBricks ? (
                    <p className="loading-text">Loading bricks...</p>
                  ) : bagBricks.length === 0 ? (
                    <p className="empty-message">No bricks in this bag yet.</p>
                  ) : (
                    <div className="bag-bricks-list">
                      {bagBricks.map((brick) => (
                        <div key={brick.id} className="bag-brick-item">
                          <div className="brick-info">
                            <span className="brick-part">{brick.partNumber}</span>
                            <span className="brick-color">Color: {brick.colorId}</span>
                            <span className="brick-qty">Qty: {brick.quantity}</span>
                          </div>
                          <button
                            className="remove-btn"
                            onClick={() => void handleRemoveBrick(bag.id, brick.id, brick.quantity)}
                            aria-label={`Remove ${brick.partNumber} from bag`}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assign bricks form */}
                  <div className="assign-form">
                    <h4>Assign Bricks to this Bag</h4>
                    <div className="assign-fields">
                      <input
                        type="text"
                        placeholder="Part number"
                        value={assignForm.partNumber}
                        onChange={(e) => setAssignForm((f) => ({ ...f, partNumber: e.target.value }))}
                        aria-label="Part number to assign"
                      />
                      <input
                        type="number"
                        placeholder="Color ID"
                        min="0"
                        value={assignForm.colorId}
                        onChange={(e) => setAssignForm((f) => ({ ...f, colorId: e.target.value }))}
                        aria-label="Color ID"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        min="1"
                        value={assignForm.quantity}
                        onChange={(e) => setAssignForm((f) => ({ ...f, quantity: e.target.value }))}
                        aria-label="Quantity to assign"
                      />
                      <button
                        className="assign-btn"
                        onClick={() => void handleAssignBricks(bag.id)}
                        disabled={assigning}
                      >
                        {assigning ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Bags;
