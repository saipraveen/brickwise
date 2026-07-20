import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Camera from "./Camera";

describe("Camera", () => {
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

    vi.restoreAllMocks();
  });

  it("should show loading state initially while requesting permission", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(() => new Promise(() => {})), // never resolves
      },
      writable: true,
      configurable: true,
    });

    render(<Camera onCapture={vi.fn()} />);

    expect(screen.getByText("Requesting camera access...")).toBeInTheDocument();
  });

  it("should show video preview when permission is granted", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    render(<Camera onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Camera preview")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Capture photo")).toBeInTheDocument();
  });

  it("should show denied state when permission is refused", async () => {
    const permError = new DOMException("Permission denied", "NotAllowedError");
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(permError),
      },
      writable: true,
      configurable: true,
    });

    render(<Camera onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Camera Access Required")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Camera access is required to scan bricks/)
    ).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("should call onClose when cancel is clicked", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    const onClose = vi.fn();
    render(<Camera onCapture={vi.fn()} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("should call onCapture with image data when capture is clicked", async () => {
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
      toDataURL: vi.fn(() => "data:image/jpeg;base64,test"),
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const onCapture = vi.fn();
    render(<Camera onCapture={onCapture} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Capture photo")).toBeInTheDocument();
    });

    // Set videoWidth/videoHeight on the video element
    const video = screen.getByLabelText("Camera preview") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 1920 });
    Object.defineProperty(video, "videoHeight", { value: 1080 });

    fireEvent.click(screen.getByLabelText("Capture photo"));

    expect(onCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: "data:image/jpeg;base64,test",
        width: 1920,
        height: 1080,
      })
    );
  });
});
