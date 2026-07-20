import { type Router as RouterType, Router } from "express";

const router: RouterType = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
