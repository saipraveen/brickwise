import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCamera } from "./useCamera";

describe("useCamera", () => {
  let mockStream: MediaStream;
  let mockTrack: MediaStreamTrack;

  beforeEach(() => {
    mockTrack = {
      stop: vi.fn(),
      kind: "video",
    } as unknown as MediaStreamTrack;

    mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    } as unknown as MediaStream;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start with idle permission and no stream", () => {
    // Mock mediaDevices to avoid auto-start issues
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    // After mount, startCapture is called automatically by the component,
    // but the hook itself starts idle
    expect(result.current.permission).toBe("idle");
    expect(result.current.stream).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should set permission to granted on successful getUserMedia", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCapture();
    });

    expect(result.current.permission).toBe("granted");
    expect(result.current.stream).toBe(mockStream);
    expect(result.current.error).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    });
  });

  it("should set permission to denied on NotAllowedError", async () => {
    const permError = new DOMException("Permission denied", "NotAllowedError");
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(permError),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCapture();
    });

    expect(result.current.permission).toBe("denied");
    expect(result.current.stream).toBeNull();
    expect(result.current.error).toBe("Camera access was denied.");
  });

  it("should handle generic camera errors", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("Device not found")),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCapture();
    });

    expect(result.current.permission).toBe("idle");
    expect(result.current.error).toBe("Unable to access camera.");
  });

  it("should stop all tracks when stopCapture is called", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      result.current.stopCapture();
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });

  it("should stop tracks on unmount", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    const { result, unmount } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCapture();
    });

    unmount();

    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("should capture image from video element", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,abc123"),
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCapture();
    });

    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    const image = result.current.captureImage(mockVideo);

    expect(image).not.toBeNull();
    expect(image!.dataUrl).toBe("data:image/jpeg;base64,abc123");
    expect(image!.width).toBe(640);
    expect(image!.height).toBe(480);
    expect(image!.timestamp).toBeInstanceOf(Date);
  });

  it("should return null from captureImage when stream is not active", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    const image = result.current.captureImage(mockVideo);
    expect(image).toBeNull();
  });
});
