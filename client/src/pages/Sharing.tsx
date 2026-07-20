import { useState, useEffect, useCallback } from "react";
import "./Sharing.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface ShareSettings {
  id: string;
  shareLink: string;
  includeCollection: boolean;
  includeInventory: boolean;
  createdAt: string;
}

interface Invitee {
  id: string;
  userId: string;
  username: string;
  invitedAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

interface SharedSet {
  setNumber: string;
  name: string;
  theme: string;
  status: string;
}

interface SharedCategory {
  categoryId: number;
  categoryName: string;
  count: number;
}

interface SharedContent {
  ownerUsername: string;
  collection?: { sets: SharedSet[] };
  inventory?: { totalCount: number; byCategory: SharedCategory[] };
}

type ViewMode = "manage" | "view-shared";

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

function Sharing() {
  const [viewMode, setViewMode] = useState<ViewMode>("manage");
  const [shareSettings, setShareSettings] = useState<ShareSettings | null>(null);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Invite form
  const [inviteUsername, setInviteUsername] = useState("");
  const [includeCollection, setIncludeCollection] = useState(true);
  const [includeInventory, setIncludeInventory] = useState(true);
  const [inviting, setInviting] = useState(false);

  // Revoking state
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  // Shared content viewer
  const [sharedUserId, setSharedUserId] = useState("");
  const [sharedContent, setSharedContent] = useState<SharedContent | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);

  const fetchSharingSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`${API_BASE}/sharing`);
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.message || `Failed to fetch sharing settings (${response.status})`
        );
      }
      const data = await response.json();
      setShareSettings(data.share ?? null);
      setInvitees(data.invitees ?? []);
      if (data.share) {
        setIncludeCollection(data.share.includeCollection);
        setIncludeInventory(data.share.includeInventory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sharing settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSharingSettings();
  }, [fetchSharingSettings]);

  const handleInvite = async () => {
    const trimmedUsername = inviteUsername.trim();
    if (!trimmedUsername) {
      setActionError("Please enter a username to invite");
      return;
    }
    if (!includeCollection && !includeInventory) {
      setActionError("Select at least one option to share (Collection or Inventory)");
      return;
    }

    setInviting(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await fetchWithAuth(`${API_BASE}/sharing/invite`, {
        method: "POST",
        body: JSON.stringify({
          username: trimmedUsername,
          options: { includeCollection, includeInventory },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (errData?.error === "conflict") {
          throw new Error(`User '${trimmedUsername}' is already invited`);
        }
        if (errData?.error === "limit_exceeded") {
          throw new Error("Maximum of 20 invited users reached");
        }
        if (errData?.error === "not_found") {
          throw new Error(`User '${trimmedUsername}' not found`);
        }
        throw new Error(errData?.message || "Failed to send invite");
      }

      setInviteUsername("");
      setSuccessMessage(`User '${trimmedUsername}' has been invited`);
      await fetchSharingSettings();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (userId: string, username: string) => {
    setRevokingUserId(userId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await fetchWithAuth(`${API_BASE}/sharing/revoke/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Failed to revoke access");
      }

      setSuccessMessage(`Access revoked for '${username}'`);
      await fetchSharingSettings();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setRevokingUserId(null);
    }
  };

  const handleViewShared = async () => {
    const trimmedUserId = sharedUserId.trim();
    if (!trimmedUserId) {
      setSharedError("Please enter a user ID to view shared content");
      return;
    }

    setSharedLoading(true);
    setSharedError(null);
    setSharedContent(null);

    try {
      const response = await fetchWithAuth(`${API_BASE}/shared/${trimmedUserId}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (errData?.error === "forbidden") {
          throw new Error("You do not have permission to view this content");
        }
        throw new Error(errData?.message || "Failed to load shared content");
      }

      const data: SharedContent = await response.json();
      setSharedContent(data);
    } catch (err) {
      setSharedError(
        err instanceof Error ? err.message : "Failed to load shared content"
      );
    } finally {
      setSharedLoading(false);
    }
  };

  const renderViewToggle = () => (
    <div className="sharing-view-toggle" role="group" aria-label="Switch view">
      <button
        className={`toggle-btn ${viewMode === "manage" ? "active" : ""}`}
        onClick={() => setViewMode("manage")}
        aria-pressed={viewMode === "manage"}
      >
        Manage Sharing
      </button>
      <button
        className={`toggle-btn ${viewMode === "view-shared" ? "active" : ""}`}
        onClick={() => setViewMode("view-shared")}
        aria-pressed={viewMode === "view-shared"}
      >
        View Shared Content
      </button>
    </div>
  );

  const renderShareOptions = () => (
    <section className="share-options-section" aria-label="Share options">
      <h3>What to Share</h3>
      {shareSettings && (
        <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
          Share link: {shareSettings.shareLink}
        </p>
      )}
      <div className="share-toggles">
        <div className="share-toggle-item">
          <input
            type="checkbox"
            id="share-collection"
            checked={includeCollection}
            onChange={(e) => setIncludeCollection(e.target.checked)}
          />
          <label htmlFor="share-collection">Collection (Sets)</label>
        </div>
        <div className="share-toggle-item">
          <input
            type="checkbox"
            id="share-inventory"
            checked={includeInventory}
            onChange={(e) => setIncludeInventory(e.target.checked)}
          />
          <label htmlFor="share-inventory">Inventory (Bricks)</label>
        </div>
      </div>
    </section>
  );

  const renderInviteForm = () => (
    <section className="invite-section" aria-label="Invite user">
      <h3>Invite by Username</h3>
      <div className="invite-form">
        <input
          type="text"
          placeholder="Enter username..."
          value={inviteUsername}
          onChange={(e) => setInviteUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleInvite();
          }}
          aria-label="Username to invite"
        />
        <button
          className="invite-btn"
          onClick={() => void handleInvite()}
          disabled={inviting || !inviteUsername.trim()}
        >
          {inviting ? "Inviting..." : "Invite"}
        </button>
      </div>
    </section>
  );

  const renderInviteesList = () => {
    const activeInvitees = invitees.filter((inv) => inv.isActive);
    const revokedInvitees = invitees.filter((inv) => !inv.isActive);

    return (
      <section className="invitees-section" aria-label="Current invitees">
        <h3>Invitees ({activeInvitees.length} active)</h3>
        {invitees.length === 0 ? (
          <p className="empty-invitees">
            No one has been invited yet. Use the form above to invite users.
          </p>
        ) : (
          <ul className="invitees-list" role="list">
            {activeInvitees.map((inv) => (
              <li key={inv.id} className="invitee-item" role="listitem">
                <div className="invitee-info">
                  <span className="invitee-username">{inv.username}</span>
                  <div className="invitee-meta">
                    <span className="invitee-status active">Active</span>
                    <span>
                      Invited {new Date(inv.invitedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  className="revoke-btn"
                  onClick={() => void handleRevoke(inv.userId, inv.username)}
                  disabled={revokingUserId === inv.userId}
                  aria-label={`Revoke access for ${inv.username}`}
                >
                  {revokingUserId === inv.userId ? "Revoking..." : "Revoke"}
                </button>
              </li>
            ))}
            {revokedInvitees.map((inv) => (
              <li key={inv.id} className="invitee-item" role="listitem">
                <div className="invitee-info">
                  <span className="invitee-username">{inv.username}</span>
                  <div className="invitee-meta">
                    <span className="invitee-status revoked">Revoked</span>
                    <span>
                      Revoked{" "}
                      {inv.revokedAt
                        ? new Date(inv.revokedAt).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  const renderSharedContentViewer = () => (
    <section className="shared-viewer-section" aria-label="View shared content">
      <h3>View Another User's Shared Content</h3>
      <div className="shared-lookup-form">
        <input
          type="text"
          placeholder="Enter user ID..."
          value={sharedUserId}
          onChange={(e) => setSharedUserId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleViewShared();
          }}
          aria-label="User ID to view shared content"
        />
        <button
          className="view-shared-btn"
          onClick={() => void handleViewShared()}
          disabled={sharedLoading || !sharedUserId.trim()}
        >
          {sharedLoading ? "Loading..." : "View"}
        </button>
      </div>

      {sharedError && (
        <p className="error-text" role="alert">
          {sharedError}
        </p>
      )}

      {sharedContent && (
        <div className="shared-content" role="region" aria-label="Shared content">
          <h4>Shared by: {sharedContent.ownerUsername}</h4>

          {sharedContent.collection && (
            <div className="shared-collection">
              <h5>Collection ({sharedContent.collection.sets.length} sets)</h5>
              {sharedContent.collection.sets.length === 0 ? (
                <p>No sets in collection.</p>
              ) : (
                <ul className="shared-sets-list" role="list">
                  {sharedContent.collection.sets.map((set) => (
                    <li
                      key={set.setNumber}
                      className="shared-set-item"
                      role="listitem"
                    >
                      <span className="shared-set-name">
                        {set.name} ({set.setNumber})
                      </span>
                      <span className="shared-set-meta">
                        {set.theme} - {set.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {sharedContent.inventory && (
            <div className="shared-inventory">
              <h5>Inventory</h5>
              <p className="shared-inventory-total">
                Total bricks: {sharedContent.inventory.totalCount}
              </p>
              {sharedContent.inventory.byCategory.length > 0 && (
                <ul className="shared-category-list" role="list">
                  {sharedContent.inventory.byCategory.map((cat) => (
                    <li
                      key={cat.categoryId}
                      className="shared-category-item"
                      role="listitem"
                    >
                      <span>{cat.categoryName}</span>
                      <span>{cat.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderManageView = () => (
    <>
      {renderShareOptions()}
      {renderInviteForm()}
      {renderInviteesList()}
    </>
  );

  return (
    <div className="page sharing-page">
      <h2>Sharing</h2>
      <p className="sharing-description">
        Share your collection with family and friends.
      </p>

      {renderViewToggle()}

      {/* Success message */}
      {successMessage && (
        <div className="success-text" role="status">
          {successMessage}
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div className="action-error" role="alert">
          {actionError}
          <button
            className="dismiss-btn"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading / Error */}
      {loading && viewMode === "manage" && (
        <p className="loading-text">Loading sharing settings...</p>
      )}
      {error && viewMode === "manage" && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {/* Content */}
      {!loading && !error && viewMode === "manage" && renderManageView()}
      {viewMode === "view-shared" && renderSharedContentViewer()}
    </div>
  );
}

export default Sharing;
