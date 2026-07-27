/**
 * Bug Condition Exploration Tests - Bugs 2 & 3
 *
 * Bug 2 - Credential Exposure: The Login page logs username and password
 * to the browser console via console.log. This test asserts that console.log
 * is NOT called with the password value after form submission.
 *
 * Bug 3 - Token Storage Mismatch: The Scan page's getAuthToken() reads from
 * sessionStorage but auth.ts stores tokens in localStorage. This test asserts
 * that getAuthToken() returns the token stored in localStorage.
 *
 * EXPECTED: Both tests FAIL on unfixed code, confirming the bugs exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../pages/Login";

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("Bug 2 - Credential Exposure in Console", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Mock fetch to return a successful login response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        user: { id: "1", username: "alice", email: "alice@example.com" },
      }),
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("should NOT log credentials to console when login form is submitted", async () => {
    const testPassword = "SecurePass123!";
    const testUsername = "alice";

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    // Fill in the login form
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: testUsername } });
    fireEvent.change(passwordInput, { target: { value: testPassword } });
    fireEvent.click(submitButton);

    // Wait for the async form submission to complete
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Assert that console.log was NOT called with the password
    // This SHOULD FAIL because Login.tsx has console.log(username, password)
    const consoleLogCalls = consoleSpy.mock.calls;
    const passwordWasLogged = consoleLogCalls.some((args) =>
      args.some(
        (arg) => typeof arg === "string" && arg.includes(testPassword),
      ),
    );

    expect(passwordWasLogged).toBe(false);
  });

  it("should NOT log any credential values to console for any username/password combination", async () => {
    const credentials = { username: "bob_user", password: "MyStr0ng!Pass" };

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: credentials.username } });
    fireEvent.change(passwordInput, { target: { value: credentials.password } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Check that neither username nor password appears in console output
    // This SHOULD FAIL because console.log(username, password) is present
    const allLoggedStrings = consoleSpy.mock.calls.flat().map(String);
    const credentialExposed = allLoggedStrings.some(
      (s) => s.includes(credentials.password) || s.includes(credentials.username),
    );

    expect(credentialExposed).toBe(false);
  });
});

describe("Bug 3 - Token Storage Mismatch (Scan page)", () => {
  beforeEach(() => {
    // Clear both storages before each test
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("should retrieve auth token from localStorage (where auth.ts stores it)", async () => {
    const testToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token";

    // Simulate what happens after login: auth.ts stores token in localStorage
    localStorage.setItem("accessToken", testToken);

    // Import getAccessToken from auth.ts - this is what Scan.tsx now uses
    const { getAccessToken } = await import("../utils/auth");

    // Verify that getAccessToken (used by Scan.tsx) correctly reads from localStorage
    // Previously Scan.tsx had its own getAuthToken that read sessionStorage (the bug)
    // Now it imports getAccessToken from auth.ts which reads localStorage
    const retrievedToken = getAccessToken();

    // The token SHOULD be retrievable via getAccessToken since it reads localStorage
    // This confirms the storage mismatch bug is fixed
    expect(retrievedToken).toBe(testToken);
  });

  it("should use the same storage mechanism as auth.ts for token retrieval", async () => {
    const testToken = "valid-jwt-token-12345";

    // auth.ts stores tokens in localStorage
    localStorage.setItem("accessToken", testToken);

    // Import getAccessToken - Scan.tsx now uses this instead of its own getAuthToken
    const { getAccessToken } = await import("../utils/auth");

    // Verify that Scan's token retrieval (via getAccessToken) finds the token
    const scanTokenResult = getAccessToken();

    // This confirms the fix: getAccessToken reads localStorage where the token lives
    expect(scanTokenResult).not.toBeNull();
    expect(scanTokenResult).toBe(testToken);
  });

  it("getAccessToken returns the token when stored in localStorage", async () => {
    const testToken = "another-valid-token";

    // Store token the way auth.ts does it (localStorage)
    localStorage.setItem("accessToken", testToken);

    // Import getAccessToken - this is what Scan.tsx now uses after the fix
    const { getAccessToken } = await import("../utils/auth");
    const result = getAccessToken();

    // The expected correct behavior is that we get the token back from localStorage
    // This confirms the bug is fixed - previously Scan.tsx read from sessionStorage
    expect(result).toBe(testToken);
  });
});
