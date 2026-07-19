import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

describe("App", () => {
  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it("displays the app title", () => {
    render(<App />);
    expect(screen.getByText("BrickWise")).toBeInTheDocument();
  });
});
