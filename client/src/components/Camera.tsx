import { useCallback, useEffect, useRef } from "react";
import type { CapturedImage } from "shared";
import { useCamera } from "../hooks/useCamera";

export interface CameraProps {
  /** Called with the captured image data when the user takes a photo */
  onCapture: (image: CapturedImage) => void;
  /** Called when the user cancels/closes the camera */
  onClose?: () => void;
}

/**
 * Camera component that requests camera access, displays a live video
 * preview, and allows the user to capture a still image as base64 JPEG.
 */
function Camera({ onCapture, onClose }: CameraProps) {
  const { permission, stream, error, startCapture, stopCapture, captureImage } =
    useCamera();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach the media stream to the video element when available
  useEffect(() => {
    if (videoRef.current && stream) {
      try {
        videoRef.current.srcObject = stream;
      } catch {
        // Fallback for environments that don't support srcObject
      }
    }
  }, [stream]);

  // Auto-start camera when the component mounts
  useEffect(() => {
    startCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = useCallback(() => {
    if (!videoRef.current) return;
    const image = captureImage(videoRef.current);
    if (image) {
      onCapture(image);
    }
  }, [captureImage, onCapture]);

  const handleClose = useCallback(() => {
    stopCapture();
    onClose?.();
  }, [stopCapture, onClose]);

  // Permission denied state
  if (permission === "denied") {
    return (
      <div className="camera camera--denied" role="alert">
        <h3>Camera Access Required</h3>
        <p>
          Camera access is required to scan bricks. Please enable camera
          permissions in your device settings.
        </p>
        <p className="camera__settings-hint">
          On most devices, go to <strong>Settings &gt; Privacy &gt; Camera</strong>{" "}
          and allow access for this app.
        </p>
        {error && <p className="camera__error">{error}</p>}
        <div className="camera__actions">
          <button
            type="button"
            className="camera__btn camera__btn--retry"
            onClick={startCapture}
          >
            Try Again
          </button>
          {onClose && (
            <button
              type="button"
              className="camera__btn camera__btn--cancel"
              onClick={handleClose}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Requesting permission / loading state
  if (permission === "idle" || permission === "requesting") {
    return (
      <div className="camera camera--loading" aria-busy="true">
        <p>Requesting camera access...</p>
      </div>
    );
  }

  // Active camera with preview
  return (
    <div className="camera camera--active">
      <video
        ref={videoRef}
        className="camera__preview"
        autoPlay
        playsInline
        muted
        aria-label="Camera preview"
      />
      <div className="camera__controls">
        <button
          type="button"
          className="camera__btn camera__btn--capture"
          onClick={handleCapture}
          aria-label="Capture photo"
        >
          📸 Capture
        </button>
        {onClose && (
          <button
            type="button"
            className="camera__btn camera__btn--cancel"
            onClick={handleClose}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default Camera;
