import { useCallback, useState } from "react";
import type { CapturedImage, IdentifiedBrick } from "shared";
import Camera from "../components/Camera";
import "./Scan.css";

/** Scan session states */
type ScanState = "idle" | "capturing" | "processing" | "reviewing" | "confirmed";

/** Error types that can occur during scanning */
type ScanErrorType = "service_unavailable" | "no_bricks_detected" | "timeout";

interface ScanError {
  type: ScanErrorType;
  message: string;
}

/** Editable brick entry used in the review step */
interface ReviewBrick {
  id: string;
  partNumber: string;
  colorId: number;
  colorName: string;
  quantity: number;
  confidence: number;
  needsReview: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;

function getAuthToken(): string | null {
  return sessionStorage.getItem("accessToken");
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function toReviewBricks(bricks: IdentifiedBrick[]): ReviewBrick[] {
  return bricks.map((b) => ({
    id: generateId(),
    partNumber: b.partNumber,
    colorId: b.colorId,
    colorName: b.colorName,
    quantity: b.quantity,
    confidence: b.confidence,
    needsReview: b.needsReview,
  }));
}

function Scan() {
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<ScanError | null>(null);
  const [reviewBricks, setReviewBricks] = useState<ReviewBrick[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPartNumber, setAddPartNumber] = useState("");
  const [addColorName, setAddColorName] = useState("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [confirming, setConfirming] = useState(false);

  const startScan = useCallback(() => {
    setState("capturing");
    setError(null);
  }, []);

  const handleCapture = useCallback(async (image: CapturedImage) => {
    setState("processing");
    setError(null);

    const token = getAuthToken();

    // Extract base64 from data URL
    const base64 = image.dataUrl.split(",")[1] ?? image.dataUrl;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch("/api/scan/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image: base64 }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503 || response.status === 502) {
          setError({
            type: "service_unavailable",
            message: "Recognition service is currently unavailable. Please try again later.",
          });
          setState("idle");
          return;
        }
        const body = await response.json().catch(() => null);
        const msg = body?.message || "An unexpected error occurred.";
        setError({ type: "service_unavailable", message: msg });
        setState("idle");
        return;
      }

      const data = await response.json();
      const bricks: IdentifiedBrick[] = data.identifiedBricks ?? [];

      if (bricks.length === 0) {
        setError({
          type: "no_bricks_detected",
          message: "No bricks were detected in the image. Try capturing another photo with better lighting or angle.",
        });
        setState("idle");
        return;
      }

      setReviewBricks(toReviewBricks(bricks));
      setState("reviewing");
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError({
          type: "timeout",
          message: "The recognition service took too long to respond. Please try again.",
        });
      } else {
        setError({
          type: "service_unavailable",
          message: "Unable to reach the recognition service. Check your connection and try again.",
        });
      }
      setState("idle");
    }
  }, []);

  const handleCameraClose = useCallback(() => {
    setState("idle");
  }, []);

  // Review step handlers
  const updateQuantity = useCallback((id: string, delta: number) => {
    setReviewBricks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, quantity: Math.max(1, b.quantity + delta) } : b
      )
    );
  }, []);

  const removeBrick = useCallback((id: string) => {
    setReviewBricks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addBrick = useCallback(() => {
    if (!addPartNumber.trim()) return;

    const newBrick: ReviewBrick = {
      id: generateId(),
      partNumber: addPartNumber.trim(),
      colorId: 0,
      colorName: addColorName.trim() || "Unknown",
      quantity: Math.max(1, parseInt(addQuantity, 10) || 1),
      confidence: 1.0,
      needsReview: false,
    };

    setReviewBricks((prev) => [...prev, newBrick]);
    setAddPartNumber("");
    setAddColorName("");
    setAddQuantity("1");
    setShowAddForm(false);
  }, [addPartNumber, addColorName, addQuantity]);

  const confirmBricks = useCallback(async () => {
    if (reviewBricks.length === 0) return;
    setConfirming(true);

    const token = getAuthToken();
    const payload = {
      bricks: reviewBricks.map((b) => ({
        partNumber: b.partNumber,
        colorId: b.colorId,
        quantity: b.quantity,
      })),
    };

    try {
      const response = await fetch("/api/inventory/bulk-add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError({
          type: "service_unavailable",
          message: body?.message || "Failed to add bricks to inventory.",
        });
        setConfirming(false);
        return;
      }

      setState("confirmed");
    } catch {
      setError({
        type: "service_unavailable",
        message: "Unable to save bricks. Check your connection and try again.",
      });
    } finally {
      setConfirming(false);
    }
  }, [reviewBricks]);

  const cancelReview = useCallback(() => {
    setReviewBricks([]);
    setState("idle");
    setError(null);
  }, []);

  const resetScan = useCallback(() => {
    setReviewBricks([]);
    setState("idle");
    setError(null);
  }, []);

  return (
    <div className="page scan-page">
      <h2>Scan Bricks</h2>

      {/* Error display */}
      {error && state === "idle" && (
        <div className="scan-error" role="alert">
          <span className="scan-error__icon" aria-hidden="true">
            {error.type === "no_bricks_detected" ? "🔍" : "⚠️"}
          </span>
          <p className="scan-error__message">{error.message}</p>
          <div className="scan-error__actions">
            <button
              type="button"
              className="scan-error__btn scan-error__btn--retry"
              onClick={startScan}
            >
              Try Again
            </button>
            <button
              type="button"
              className="scan-error__btn scan-error__btn--cancel"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Idle state */}
      {state === "idle" && !error && (
        <div className="scan-idle">
          <span className="scan-idle__icon" aria-hidden="true">📷</span>
          <p className="scan-idle__description">
            Use your camera to scan bricks. The AI will identify parts, colors,
            and quantities automatically.
          </p>
          <button type="button" className="scan-idle__btn" onClick={startScan}>
            Start Scan
          </button>
        </div>
      )}

      {/* Capturing state */}
      {state === "capturing" && (
        <Camera onCapture={handleCapture} onClose={handleCameraClose} />
      )}

      {/* Processing state */}
      {state === "processing" && (
        <div className="scan-processing" aria-busy="true" aria-live="polite">
          <div className="scan-processing__spinner" />
          <p className="scan-processing__text">Identifying bricks...</p>
        </div>
      )}

      {/* Review state */}
      {state === "reviewing" && (
        <div className="scan-review">
          <div className="scan-review__header">
            <h3 className="scan-review__title">Review Identified Bricks</h3>
            <span className="scan-review__count">
              {reviewBricks.length} brick{reviewBricks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Error during confirm */}
          {error && (
            <div className="scan-error" role="alert" style={{ padding: "0.5rem 0" }}>
              <p className="scan-error__message">{error.message}</p>
            </div>
          )}

          <ul className="scan-review__list" aria-label="Identified bricks">
            {reviewBricks.map((brick) => (
              <li
                key={brick.id}
                className={`brick-item${brick.confidence < LOW_CONFIDENCE_THRESHOLD ? " brick-item--low-confidence" : ""}`}
              >
                {brick.confidence < LOW_CONFIDENCE_THRESHOLD && (
                  <span
                    className="brick-item__warning"
                    title="Low confidence - please verify"
                    aria-label="Low confidence identification"
                  >
                    ⚠️
                  </span>
                )}
                <div className="brick-item__info">
                  <div className="brick-item__part">{brick.partNumber}</div>
                  <div className="brick-item__color">{brick.colorName}</div>
                  <div
                    className={`brick-item__confidence${brick.confidence < LOW_CONFIDENCE_THRESHOLD ? " brick-item__confidence--low" : ""}`}
                  >
                    Confidence: {Math.round(brick.confidence * 100)}%
                  </div>
                </div>
                <div className="brick-item__quantity">
                  <button
                    type="button"
                    className="brick-item__qty-btn"
                    onClick={() => updateQuantity(brick.id, -1)}
                    aria-label={`Decrease quantity of ${brick.partNumber}`}
                  >
                    −
                  </button>
                  <span className="brick-item__qty-value">{brick.quantity}</span>
                  <button
                    type="button"
                    className="brick-item__qty-btn"
                    onClick={() => updateQuantity(brick.id, 1)}
                    aria-label={`Increase quantity of ${brick.partNumber}`}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="brick-item__remove"
                  onClick={() => removeBrick(brick.id)}
                  aria-label={`Remove ${brick.partNumber}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {/* Add brick */}
          <div className="scan-review__add">
            {!showAddForm ? (
              <button
                type="button"
                className="scan-review__add-btn"
                onClick={() => setShowAddForm(true)}
              >
                + Add a brick manually
              </button>
            ) : (
              <div className="add-brick-form">
                <input
                  type="text"
                  className="add-brick-form__input"
                  placeholder="Part number"
                  value={addPartNumber}
                  onChange={(e) => setAddPartNumber(e.target.value)}
                  aria-label="Part number"
                />
                <input
                  type="text"
                  className="add-brick-form__input"
                  placeholder="Color"
                  value={addColorName}
                  onChange={(e) => setAddColorName(e.target.value)}
                  aria-label="Color name"
                />
                <input
                  type="number"
                  className="add-brick-form__input"
                  placeholder="Qty"
                  min="1"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  aria-label="Quantity"
                  style={{ maxWidth: "60px" }}
                />
                <div className="add-brick-form__actions">
                  <button
                    type="button"
                    className="add-brick-form__btn add-brick-form__btn--add"
                    onClick={addBrick}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="add-brick-form__btn add-brick-form__btn--cancel"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Confirm / Cancel actions */}
          <div className="scan-review__actions">
            <button
              type="button"
              className="scan-review__btn scan-review__btn--confirm"
              onClick={confirmBricks}
              disabled={reviewBricks.length === 0 || confirming}
            >
              {confirming ? "Saving..." : "Confirm & Add to Inventory"}
            </button>
            <button
              type="button"
              className="scan-review__btn scan-review__btn--cancel"
              onClick={cancelReview}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmed state */}
      {state === "confirmed" && (
        <div className="scan-confirmed">
          <span className="scan-confirmed__icon" aria-hidden="true">✅</span>
          <p className="scan-confirmed__message">
            Bricks added to your inventory successfully!
          </p>
          <button type="button" className="scan-confirmed__btn" onClick={resetScan}>
            Scan More Bricks
          </button>
        </div>
      )}
    </div>
  );
}

export default Scan;
