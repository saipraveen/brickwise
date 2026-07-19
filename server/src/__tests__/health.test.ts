import { describe, it, expect } from "vitest";
import express from "express";
import healthRouter from "../routes/health.js";

function createApp() {
  const app = express();
  app.use("/api", healthRouter);
  return app;
}

describe("Health endpoint", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const app = createApp();

    const response = await new Promise<{ status: number; body: unknown }>(
      (resolve) => {
        const server = app.listen(0, () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            throw new Error("Failed to get server address");
          }
          const port = address.port;
          fetch(`http://localhost:${port}/api/health`)
            .then(async (res) => {
              const body = await res.json();
              resolve({ status: res.status, body });
            })
            .finally(() => server.close());
        });
      },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      timestamp: expect.any(String),
    });
  });
});
