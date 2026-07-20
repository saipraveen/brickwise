import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturedImage } from "shared";

export type CameraPermission = "idle" | "requesting" | "granted" | "denied";

export interface UseCameraReturn {
  /** Current permission state */
  permission: CameraPermission;
  /** Active media stream (null when not capturing) */
  stream: MediaStream | null;
  /** Error message if something went wrong */
  error: string | null;
  /** Start the camera and request permissions */
  startCapture: () => Promise<void>;
  /** Stop the camera and release resources */
  stopCapture: () => void;
  /** Capture a still image from the video feed */
  captureImage: (videoElement: HTMLVideoElement) => CapturedImage | null;
}

/**
 * Custom hook managing camera state, permissions, and image capture.
 * Cleans up all media tracks on unmount.
 */
export function useCamera(): UseCameraReturn {
  const [permission, setPermission] = useState<CameraPermission>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const startCapture = useCallback(async () => {
    setError(null);
    setPermission("requesting");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setPermission("granted");
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was denied."
          : "Unable to access camera.";
      setError(message);
      setPermission(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "denied"
          : "idle"
      );
    }
  }, []);

  const captureImage = useCallback(
    (videoElement: HTMLVideoElement): CapturedImage | null => {
      if (!streamRef.current) return null;

      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        timestamp: new Date(),
      };
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    permission,
    stream,
    error,
    startCapture,
    stopCapture,
    captureImage,
  };
}
