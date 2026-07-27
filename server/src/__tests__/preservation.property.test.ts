import { describe, it, expect } from "vitest";
import fc from "fast-check";
import express from "express";
import healthRouter from "../routes/health.js";

/**
 * Preservation Property Tests - Server
 *
 * These tests capture existing server behavior that MUST remain unchanged
 * after the bugfix (adding morgan middleware). They should PASS on the
 * current unfixed code.
 *
 * Note: We construct a minimal app with the same middleware configuration
 * as server.ts to avoid triggering DB initialization during tests.
 */

// Create an app that mirrors the server.ts middleware setup (JSON + routes)
function createTestApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", healthRouter);
  return app;
}

// Helper to make requests against the app
function makeRequest(
  testApp: express.Express,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = testApp.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get server address"));
        return;
      }
      const port = address.port;
      const options: RequestInit = {
        method: method.toUpperCase(),
        headers: { "Content-Type": "application/json" },
      };
      if (body !== undefined && method.toUpperCase() !== "GET") {
        options.body = JSON.stringify(body);
      }
      fetch(`http://localhost:${port}${path}`, options)
        .then(async (res) => {
          const contentType = res.headers.get("content-type") || "";
          let responseBody: unknown;
          if (contentType.includes("application/json")) {
            responseBody = await res.json();
          } else {
            responseBody = await res.text();
          }
          const headers: Record<string, string> = {};
          res.headers.forEach((value, key) => {
            headers[key] = value;
          });
          resolve({ status: res.status, body: responseBody, headers });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

describe("Preservation: Express server JSON parsing", () => {
  it("parses JSON request bodies correctly for arbitrary JSON objects", async () => {
    const testApp = express();
    testApp.use(express.json({ limit: "10mb" }));
    testApp.post("/echo", (req, res) => {
      res.json({ received: req.body });
    });

    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
        ),
        async (obj) => {
          const result = await makeRequest(testApp, "POST", "/echo", obj);
          expect(result.status).toBe(200);
          expect((result.body as { received: unknown }).received).toEqual(obj);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("accepts JSON bodies up to the configured limit", async () => {
    const testApp = express();
    testApp.use(express.json({ limit: "10mb" }));
    testApp.post("/echo", (req, res) => {
      res.json({ size: JSON.stringify(req.body).length });
    });

    // A moderately large body (well under 10mb) should be accepted
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: "x".repeat(100),
    }));
    const result = await makeRequest(testApp, "POST", "/echo", largeArray);
    expect(result.status).toBe(200);
  });

  it("returns 400-level error for invalid JSON", async () => {
    const testApp = express();
    testApp.use(express.json({ limit: "10mb" }));
    testApp.post("/echo", (req, res) => {
      res.json({ received: req.body });
    });

    const result = await new Promise<{ status: number }>((resolve, reject) => {
      const server = testApp.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Failed to get server address"));
          return;
        }
        const port = address.port;
        fetch(`http://localhost:${port}/echo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{invalid json!!!",
        })
          .then(async (res) => {
            resolve({ status: res.status });
          })
          .catch(reject)
          .finally(() => server.close());
      });
    });

    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it("property: random valid JSON values are parsed and echoed back correctly", async () => {
    const testApp = express();
    testApp.use(express.json({ limit: "10mb" }));
    testApp.post("/echo", (req, res) => {
      res.json({ received: req.body });
    });

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            age: fc.integer({ min: 0, max: 150 }),
            active: fc.boolean(),
          }),
          fc.array(fc.integer(), { minLength: 0, maxLength: 10 }),
          fc.record({
            nested: fc.record({
              key: fc.string({ minLength: 1, maxLength: 10 }),
            }),
          })
        ),
        async (jsonValue) => {
          const result = await makeRequest(testApp, "POST", "/echo", jsonValue);
          expect(result.status).toBe(200);
          expect((result.body as { received: unknown }).received).toEqual(jsonValue);
        }
      ),
      { numRuns: 15 }
    );
  });
});

describe("Preservation: Express routes are registered correctly", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const app = createTestApp();
    const result = await makeRequest(app, "GET", "/api/health");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: "ok",
      timestamp: expect.any(String),
    });
  });

  it("health endpoint returns valid ISO timestamp", async () => {
    const app = createTestApp();
    const result = await makeRequest(app, "GET", "/api/health");
    const body = result.body as { status: string; timestamp: string };
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });

  it("unknown routes return 404", async () => {
    const app = createTestApp();
    const result = await makeRequest(app, "GET", "/api/nonexistent-route-xyz");
    expect(result.status).toBe(404);
  });

  it("API routes respond to correct HTTP methods", async () => {
    const app = createTestApp();
    // POST to health (which only accepts GET) should return 404 or 405
    const result = await makeRequest(app, "POST", "/api/health", {});
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it("health endpoint returns JSON content type", async () => {
    const app = createTestApp();
    const result = await makeRequest(app, "GET", "/api/health");
    expect(result.headers["content-type"]).toContain("application/json");
  });
});

describe("Preservation: JSON middleware is configured on the app", () => {
  it("POST with JSON body is parsed correctly (mirrors server.ts config)", async () => {
    const app = createTestApp();
    // Add a test route that echoes body
    app.post("/api/test-echo", (req, res) => {
      res.json({ received: req.body });
    });

    const testBody = { username: "testuser", password: "TestPass123" };
    const result = await makeRequest(app, "POST", "/api/test-echo", testBody);
    expect(result.status).toBe(200);
    expect((result.body as { received: unknown }).received).toEqual(testBody);
  });

  it("property: random JSON objects are accepted by the JSON middleware", async () => {
    const app = createTestApp();
    app.post("/api/test-json", (req, res) => {
      res.json({ ok: true, hasBody: req.body !== undefined });
    });

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
            minLength: 0,
            maxLength: 5,
          })
        ),
        async (value) => {
          const result = await makeRequest(app, "POST", "/api/test-json", value);
          expect(result.status).toBe(200);
          expect((result.body as { ok: boolean }).ok).toBe(true);
        }
      ),
      { numRuns: 15 }
    );
  });
});
