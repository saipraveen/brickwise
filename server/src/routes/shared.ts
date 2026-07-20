import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
} from "express";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  share,
  shareInvite,
  users,
  setCollection,
  brickInventory,
  catalogPart,
} from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";

const router: RouterType = Router();

// All shared viewing routes require authentication
router.use(authenticate);

/**
 * GET /api/shared/:userId
 * View shared content from another user (only if invited and not revoked).
 */
router.get("/:userId", async (req: Request, res: Response): Promise<void> => {
  const viewerId = req.user!.userId;
  const targetUserId = req.params["userId"] as string;

  if (!targetUserId) {
    res.status(400).json({
      error: "validation_error",
      message: "userId parameter is required",
      statusCode: 400,
    });
    return;
  }

  // Find the target user's share
  const [targetShare] = await db
    .select()
    .from(share)
    .where(eq(share.ownerId, targetUserId))
    .limit(1);

  if (!targetShare) {
    res.status(403).json({
      error: "forbidden",
      message: "You do not have permission to view this content",
      statusCode: 403,
    });
    return;
  }

  // Check if the viewer is an active invitee
  const [activeInvite] = await db
    .select()
    .from(shareInvite)
    .where(
      and(
        eq(shareInvite.shareId, targetShare.id),
        eq(shareInvite.invitedUserId, viewerId),
        isNull(shareInvite.revokedAt),
      ),
    )
    .limit(1);

  if (!activeInvite) {
    res.status(403).json({
      error: "forbidden",
      message: "You do not have permission to view this content",
      statusCode: 403,
    });
    return;
  }

  // Get the owner's username
  const [owner] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  const result: {
    ownerUsername: string;
    collection?: unknown;
    inventory?: unknown;
  } = {
    ownerUsername: owner?.username ?? "Unknown",
  };

  // Include collection data if enabled
  if (targetShare.includeCollection) {
    const sets = await db
      .select({
        setNumber: setCollection.setNumber,
        name: setCollection.name,
        theme: setCollection.theme,
        status: setCollection.status,
      })
      .from(setCollection)
      .where(eq(setCollection.userId, targetUserId));

    result.collection = { sets };
  }

  // Include inventory data if enabled
  if (targetShare.includeInventory) {
    // Get total count
    const [totalResult] = await db
      .select({
        totalCount: sql<number>`coalesce(sum(${brickInventory.quantity}), 0)::int`.as(
          "total_count",
        ),
      })
      .from(brickInventory)
      .where(eq(brickInventory.userId, targetUserId));

    // Get count by category
    const byCategory = await db
      .select({
        categoryId: catalogPart.categoryId,
        categoryName: catalogPart.categoryName,
        count: sql<number>`sum(${brickInventory.quantity})::int`.as("count"),
      })
      .from(brickInventory)
      .innerJoin(
        catalogPart,
        eq(brickInventory.partNumber, catalogPart.partNumber),
      )
      .where(eq(brickInventory.userId, targetUserId))
      .groupBy(catalogPart.categoryId, catalogPart.categoryName);

    result.inventory = {
      totalCount: totalResult?.totalCount ?? 0,
      byCategory: byCategory.map((cat) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        count: cat.count,
      })),
    };
  }

  res.status(200).json(result);
});

export default router;
