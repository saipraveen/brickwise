import { and, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { scanUsage } from "../db/schema.js";

// --- Quota Constants ---

const SCANS_PER_DAY = 50;
const SCANS_PER_MONTH = 500;
/** Daily spend cap in cents ($2.00) */
const DAILY_SPEND_CAP_CENTS = 200;

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

// --- Public Interface ---

export interface UsageStats {
  scansToday: number;
  scansThisMonth: number;
  dailyLimitReached: boolean;
  monthlyLimitReached: boolean;
  dailyCostCents: number;
  dailySpendCapReached: boolean;
}

/**
 * Check whether a user is allowed to perform a scan.
 * Returns true if the user is under all quota limits and the
 * global daily spend cap has not been exceeded.
 */
export async function canUserScan(userId: string): Promise<boolean> {
  const stats = await getUserUsageStats(userId);

  if (stats.dailyLimitReached) return false;
  if (stats.monthlyLimitReached) return false;

  // Check global daily spend cap
  const dailyCost = await getDailyCost();
  if (dailyCost >= DAILY_SPEND_CAP_CENTS) return false;

  return true;
}

/**
 * Record a completed scan for a user.
 */
export async function recordScan(
  userId: string,
  estimatedCostCents: number,
): Promise<void> {
  await db.insert(scanUsage).values({
    userId,
    estimatedCostCents,
  });
}

/**
 * Get the total estimated cost (in cents) for all users today.
 */
export async function getDailyCost(): Promise<number> {
  const today = startOfToday();

  const result = await db
    .select({
      total: sql<number>`coalesce(sum(${scanUsage.estimatedCostCents}), 0)`,
    })
    .from(scanUsage)
    .where(gte(scanUsage.scannedAt, today));

  return result[0]?.total ?? 0;
}

/**
 * Get per-user usage statistics (daily/monthly counts and cost info).
 */
export async function getUserUsageStats(userId: string): Promise<UsageStats> {
  const today = startOfToday();
  const monthStart = startOfMonth();

  // Daily scan count and cost for this user
  const dailyResult = await db
    .select({
      count: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(${scanUsage.estimatedCostCents}), 0)`,
    })
    .from(scanUsage)
    .where(and(sql`${scanUsage.userId} = ${userId}`, gte(scanUsage.scannedAt, today)));

  // Monthly scan count for this user
  const monthlyResult = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(scanUsage)
    .where(
      and(sql`${scanUsage.userId} = ${userId}`, gte(scanUsage.scannedAt, monthStart)),
    );

  const scansToday = dailyResult[0]?.count ?? 0;
  const dailyCostCents = dailyResult[0]?.cost ?? 0;
  const scansThisMonth = monthlyResult[0]?.count ?? 0;

  // Global daily spend cap check
  const globalDailyCost = await getDailyCost();

  return {
    scansToday,
    scansThisMonth,
    dailyLimitReached: scansToday >= SCANS_PER_DAY,
    monthlyLimitReached: scansThisMonth >= SCANS_PER_MONTH,
    dailyCostCents,
    dailySpendCapReached: globalDailyCost >= DAILY_SPEND_CAP_CENTS,
  };
}
