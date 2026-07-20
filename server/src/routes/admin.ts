import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, scanUsage, brickInventory } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import { getSyncStatus } from "../services/catalogSync.js";
import { getDailyCost } from "../services/costMonitor.js";

// --- Admin Middleware ---

/**
 * Admin role check middleware.
 * The first registered user (lowest createdAt) is the admin.
 * Returns 403 if the authenticated user is not the admin.
 */
async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user!.userId;

  // Find the first registered user (lowest createdAt)
  const [firstUser] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(sql`${users.createdAt} ASC`)
    .limit(1);

  if (!firstUser || firstUser.id !== userId) {
    res.status(403).json({
      error: "Forbidden",
      message: "Admin access required",
      statusCode: 403,
    });
    return;
  }

  next();
}

// --- Helper: date boundaries ---

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// --- Router ---

const router: RouterType = Router();

// All admin routes require authentication + admin check
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/stats
 * Overall usage stats: total users, total scans, total bricks.
 */
router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  const [userCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const [scanCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanUsage);

  const [brickCount] = await db
    .select({
      total: sql<number>`coalesce(sum(${brickInventory.quantity}), 0)::int`,
    })
    .from(brickInventory);

  res.status(200).json({
    totalUsers: userCount?.count ?? 0,
    totalScans: scanCount?.count ?? 0,
    totalBricks: brickCount?.total ?? 0,
  });
});

/**
 * GET /api/admin/costs
 * Cost breakdown: daily cost, monthly cost, average cost per scan.
 */
router.get("/costs", async (_req: Request, res: Response): Promise<void> => {
  const today = startOfToday();
  const monthStart = startOfMonth();

  // Daily cost
  const dailyCostCents = await getDailyCost();

  // Monthly cost
  const [monthlyResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${scanUsage.estimatedCostCents}), 0)`,
    })
    .from(scanUsage)
    .where(sql`${scanUsage.scannedAt} >= ${monthStart}`);

  const monthlyCostCents = monthlyResult?.total ?? 0;

  // Total scans this month for average
  const [monthlyScans] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanUsage)
    .where(sql`${scanUsage.scannedAt} >= ${monthStart}`);

  const scansThisMonth = monthlyScans?.count ?? 0;
  const averageCostPerScanCents =
    scansThisMonth > 0 ? monthlyCostCents / scansThisMonth : 0;

  res.status(200).json({
    dailyCostCents,
    monthlyCostCents,
    scansToday: await getScansToday(today),
    scansThisMonth,
    averageCostPerScanCents: Math.round(averageCostPerScanCents * 100) / 100,
  });
});

/**
 * GET /api/admin/sync-status
 * Catalog sync health from the catalogSync service.
 */
router.get(
  "/sync-status",
  async (_req: Request, res: Response): Promise<void> => {
    const status = getSyncStatus();

    res.status(200).json({
      lastSyncTime: status.lastSyncTime,
      nextScheduledSync: status.nextScheduledSync,
      isRunning: status.isRunning,
      retryCount: status.retryCount,
      lastError: status.lastError,
    });
  },
);

/**
 * GET /api/admin/users
 * List users with activity info (scans count, last login).
 */
router.get("/users", async (_req: Request, res: Response): Promise<void> => {
  const userList = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
      scanCount: sql<number>`(
        SELECT count(*)::int FROM scan_usage WHERE scan_usage.user_id = ${users.id}
      )`,
    })
    .from(users)
    .orderBy(sql`${users.createdAt} ASC`);

  res.status(200).json({
    users: userList.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
      scanCount: u.scanCount,
    })),
  });
});

/**
 * POST /api/admin/quotas
 * Update usage quotas (placeholder - quotas are currently constant).
 * Body: { scansPerDay?: number, scansPerMonth?: number }
 */
router.post("/quotas", async (req: Request, res: Response): Promise<void> => {
  const { scansPerDay, scansPerMonth } = req.body as {
    scansPerDay?: number;
    scansPerMonth?: number;
  };

  // For now, quotas are hard-coded constants in costMonitor.
  // This endpoint acknowledges the request but notes that dynamic quotas
  // would need to be stored in the database.
  res.status(200).json({
    message: "Quota update acknowledged",
    quotas: {
      scansPerDay: scansPerDay ?? 50,
      scansPerMonth: scansPerMonth ?? 500,
    },
  });
});

/**
 * POST /api/admin/budget-threshold
 * Set/update budget alert threshold.
 * Body: { dailySpendCapCents?: number }
 */
router.post(
  "/budget-threshold",
  async (req: Request, res: Response): Promise<void> => {
    const { dailySpendCapCents } = req.body as {
      dailySpendCapCents?: number;
    };

    // Similar to quotas - budget threshold is currently a constant.
    // Acknowledge the request.
    res.status(200).json({
      message: "Budget threshold update acknowledged",
      budgetThreshold: {
        dailySpendCapCents: dailySpendCapCents ?? 200,
      },
    });
  },
);

// --- Helpers ---

async function getScansToday(today: Date): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanUsage)
    .where(sql`${scanUsage.scannedAt} >= ${today}`);

  return result?.count ?? 0;
}

export default router;
