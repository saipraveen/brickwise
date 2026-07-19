import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

/**
 * Since App uses BrowserRouter internally, for unit tests we render App
 * directly (it includes its own router). For more isolated tests we'd
 * wrap in MemoryRouter, but App already embeds BrowserRouter so we
 * render it as-is.
 */

describe("App", () => {
  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it("displays the app title", () => {
    render(<App />);
    expect(screen.getByText("BrickWise")).toBeInTheDocument();
  });

  it("renders the bottom navigation", () => {
    render(<App />);
    expect(screen.getByLabelText("Main navigation")).toBeInTheDocument();
  });

  it("renders the About & Legal link for legal compliance (Req 11.1)", () => {
    render(<App />);
    const aboutLink = screen.getByText("About & Legal");
    expect(aboutLink).toBeInTheDocument();
    expect(aboutLink.closest("a")).toHaveAttribute("href", "/about");
  });
});
