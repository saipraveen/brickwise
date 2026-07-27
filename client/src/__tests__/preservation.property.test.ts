import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import {
  validateUsername,
  validatePassword,
  storeAuthResponse,
  getAccessToken,
  fetchWithAuth,
} from "../utils/auth";

/**
 * Preservation Property Tests - Client
 *
 * These tests capture existing client behavior that MUST remain unchanged
 * after the bugfix. They should PASS on the current unfixed code.
 */

// --- Username Validation Properties ---

describe("Preservation: validateUsername", () => {
  it("property: valid usernames (3-30 alphanumeric + underscore) always pass", () => {
    const validUsernameArb = fc
      .stringOf(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
            ""
          )
        ),
        { minLength: 3, maxLength: 30 }
      );

    fc.assert(
      fc.property(validUsernameArb, (username) => {
        const result = validateUsername(username);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("property: usernames shorter than 3 chars always fail", () => {
    const shortUsernameArb = fc.stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
          ""
        )
      ),
      { minLength: 0, maxLength: 2 }
    );

    fc.assert(
      fc.property(shortUsernameArb, (username) => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 50 }
    );
  });

  it("property: usernames longer than 30 chars always fail", () => {
    const longUsernameArb = fc.stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
          ""
        )
      ),
      { minLength: 31, maxLength: 50 }
    );

    fc.assert(
      fc.property(longUsernameArb, (username) => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 50 }
    );
  });

  it("property: usernames with special characters (not alphanumeric/underscore) always fail", () => {
    // Generate strings that contain at least one invalid character
    const invalidChars = "!@#$%^&*()-+= {}[]|\\:;\"'<>,.?/~`";
    const invalidUsernameArb = fc
      .tuple(
        fc.stringOf(fc.constantFrom(..."abc123_".split("")), {
          minLength: 1,
          maxLength: 10,
        }),
        fc.constantFrom(...invalidChars.split("")),
        fc.stringOf(fc.constantFrom(..."abc123_".split("")), {
          minLength: 1,
          maxLength: 10,
        })
      )
      .map(([prefix, invalidChar, suffix]) => prefix + invalidChar + suffix);

    fc.assert(
      fc.property(invalidUsernameArb, (username) => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 50 }
    );
  });

  it("property: validation result matches regex /^[a-zA-Z0-9_]{3,30}$/", () => {
    const regex = /^[a-zA-Z0-9_]{3,30}$/;

    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 40 }), (input) => {
        const result = validateUsername(input);
        const matchesRegex = regex.test(input);
        expect(result.valid).toBe(matchesRegex);
      }),
      { numRuns: 200 }
    );
  });
});

// --- Password Validation Properties ---

describe("Preservation: validatePassword", () => {
  it("property: passwords meeting all criteria always pass", () => {
    // Generate valid passwords: 8+ chars with uppercase, lowercase, digit
    const validPasswordArb = fc
      .tuple(
        fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")),
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
        fc.constantFrom(..."0123456789".split("")),
        fc.string({ minLength: 5, maxLength: 22 })
      )
      .map(([upper, lower, digit, rest]) => upper + lower + digit + rest)
      .filter((pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw));

    fc.assert(
      fc.property(validPasswordArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("property: passwords shorter than 8 chars always fail", () => {
    const shortPasswordArb = fc.string({ minLength: 1, maxLength: 7 });

    fc.assert(
      fc.property(shortPasswordArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("8 characters");
      }),
      { numRuns: 50 }
    );
  });

  it("property: passwords without uppercase always fail (when 8+ chars)", () => {
    // Generate 8+ char strings with lowercase and digits but NO uppercase
    const noUpperArb = fc
      .stringOf(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789!@#$".split("")),
        { minLength: 8, maxLength: 30 }
      )
      .filter((pw) => /[a-z]/.test(pw) && /\d/.test(pw) && !/[A-Z]/.test(pw));

    fc.assert(
      fc.property(noUpperArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("uppercase");
      }),
      { numRuns: 50 }
    );
  });

  it("property: passwords without lowercase always fail (when 8+ chars with uppercase)", () => {
    // Generate 8+ char strings with uppercase and digits but NO lowercase
    const noLowerArb = fc
      .stringOf(
        fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$".split("")),
        { minLength: 8, maxLength: 30 }
      )
      .filter((pw) => /[A-Z]/.test(pw) && /\d/.test(pw) && !/[a-z]/.test(pw));

    fc.assert(
      fc.property(noLowerArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("lowercase");
      }),
      { numRuns: 50 }
    );
  });

  it("property: passwords without a digit always fail (when 8+ chars with upper+lower)", () => {
    // Generate 8+ char strings with both cases but NO digits
    const noDigitArb = fc
      .stringOf(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$".split("")),
        { minLength: 8, maxLength: 30 }
      )
      .filter((pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && !/\d/.test(pw));

    fc.assert(
      fc.property(noDigitArb, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("digit");
      }),
      { numRuns: 50 }
    );
  });

  it("property: validation checks are applied in order (length, uppercase, lowercase, digit)", () => {
    // The function checks in order and returns first failure
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 40 }), (password) => {
        const result = validatePassword(password);
        if (password.length < 8) {
          if (!result.valid) {
            expect(result.error).toContain("8 characters");
          }
        } else if (!/[A-Z]/.test(password)) {
          if (!result.valid) {
            expect(result.error).toContain("uppercase");
          }
        } else if (!/[a-z]/.test(password)) {
          if (!result.valid) {
            expect(result.error).toContain("lowercase");
          }
        } else if (!/\d/.test(password)) {
          if (!result.valid) {
            expect(result.error).toContain("digit");
          }
        } else {
          expect(result.valid).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// --- storeAuthResponse Properties ---

describe("Preservation: storeAuthResponse stores tokens in localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("property: storeAuthResponse stores accessToken in localStorage", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          username: fc.string({ minLength: 3, maxLength: 30 }),
          email: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        (accessToken, refreshToken, user) => {
          localStorage.clear();
          storeAuthResponse({ accessToken, refreshToken, user });
          expect(localStorage.getItem("accessToken")).toBe(accessToken);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("property: storeAuthResponse stores refreshToken in localStorage", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          username: fc.string({ minLength: 3, maxLength: 30 }),
          email: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        (accessToken, refreshToken, user) => {
          localStorage.clear();
          storeAuthResponse({ accessToken, refreshToken, user });
          expect(localStorage.getItem("refreshToken")).toBe(refreshToken);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("property: storeAuthResponse stores user as JSON in localStorage", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          username: fc.string({ minLength: 3, maxLength: 30 }),
          email: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        (accessToken, refreshToken, user) => {
          localStorage.clear();
          storeAuthResponse({ accessToken, refreshToken, user });
          const stored = localStorage.getItem("user");
          expect(stored).not.toBeNull();
          expect(JSON.parse(stored!)).toEqual(user);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// --- getAccessToken Properties ---

describe("Preservation: getAccessToken returns token from localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("property: getAccessToken returns whatever is stored in localStorage under 'accessToken'", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 500 }), (token) => {
        localStorage.clear();
        localStorage.setItem("accessToken", token);
        expect(getAccessToken()).toBe(token);
      }),
      { numRuns: 100 }
    );
  });

  it("returns null when no token is stored", () => {
    localStorage.clear();
    expect(getAccessToken()).toBeNull();
  });

  it("property: getAccessToken is consistent with storeAuthResponse", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          username: fc.string({ minLength: 3, maxLength: 30 }),
          email: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        (accessToken, refreshToken, user) => {
          localStorage.clear();
          storeAuthResponse({ accessToken, refreshToken, user });
          expect(getAccessToken()).toBe(accessToken);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// --- fetchWithAuth Properties ---

describe("Preservation: fetchWithAuth includes Authorization header", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("property: fetchWithAuth includes Bearer token when token exists in localStorage", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.webUrl(),
        async (token, url) => {
          localStorage.clear();
          localStorage.setItem("accessToken", token);

          let capturedHeaders: Record<string, string> = {};
          vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_url, options) => {
              capturedHeaders = (options?.headers as Record<string, string>) || {};
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          );

          await fetchWithAuth(url);

          expect(capturedHeaders["Authorization"]).toBe(`Bearer ${token}`);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("fetchWithAuth does NOT include Authorization header when no token exists", async () => {
    localStorage.clear();

    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      capturedHeaders = (options?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await fetchWithAuth("https://example.com/api/test");

    expect(capturedHeaders["Authorization"]).toBeUndefined();
  });

  it("fetchWithAuth always sets Content-Type to application/json", async () => {
    localStorage.clear();
    localStorage.setItem("accessToken", "some-token");

    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      capturedHeaders = (options?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await fetchWithAuth("https://example.com/api/test");

    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  it("property: fetchWithAuth passes through custom options", async () => {
    localStorage.clear();
    localStorage.setItem("accessToken", "test-token");

    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

    for (const method of methods) {
      let capturedOptions: RequestInit | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
        capturedOptions = options;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      await fetchWithAuth("https://example.com/api/test", { method });

      expect(capturedOptions?.method).toBe(method);
    }
  });

  it("property: fetchWithAuth formats token correctly as 'Bearer <token>'", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => !s.includes("\n")),
        async (token) => {
          localStorage.clear();
          localStorage.setItem("accessToken", token);

          let authHeader = "";
          vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_url, options) => {
              const headers = options?.headers as Record<string, string>;
              authHeader = headers?.["Authorization"] || "";
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          );

          await fetchWithAuth("https://example.com/test");

          expect(authHeader).toBe(`Bearer ${token}`);
          expect(authHeader.startsWith("Bearer ")).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});
