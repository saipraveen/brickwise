import type { AuthResponse, RefreshTokenResponse } from "shared";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// --- Token Storage ---

export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

export function setAccessToken(token: string): void {
  localStorage.setItem("accessToken", token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

export function setRefreshToken(token: string): void {
  localStorage.setItem("refreshToken", token);
}

export function clearTokens(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

export function storeAuthResponse(response: AuthResponse): void {
  setAccessToken(response.accessToken);
  setRefreshToken(response.refreshToken);
  localStorage.setItem("user", JSON.stringify(response.user));
}

export function getStoredUser(): { id: string; username: string; email: string } | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Token Refresh ---

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refreshes the access token using the stored refresh token.
 * Deduplicates concurrent refresh calls.
 * Returns the new access token, or null if refresh fails.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const token = getRefreshToken();
    if (!token) return null;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });

      if (!response.ok) {
        clearTokens();
        return null;
      }

      const data: RefreshTokenResponse = await response.json();
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// --- Authenticated Fetch ---

/**
 * Fetch wrapper that attaches the access token and auto-refreshes on 401.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      return fetch(url, { ...options, headers });
    }
  }

  return response;
}

// --- Validation (mirrors server rules) ---

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUsername(username: string): ValidationResult {
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return {
      valid: false,
      error: "Username must be 3-30 characters and contain only letters, numbers, and underscores",
    };
  }
  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: "Password must contain at least one digit" };
  }
  return { valid: true };
}

export function validateEmail(email: string): ValidationResult {
  if (!email || !email.includes("@") || email.length > 255) {
    return { valid: false, error: "A valid email address is required" };
  }
  return { valid: true };
}
