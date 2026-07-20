import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
} from "express";
import { eq, and, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db/index.js";
import { share, shareInvite, users } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";

const router: RouterType = Router();

// All sharing routes require authentication
router.use(authenticate);

const MAX_INVITEES_PER_SHARE = 20;

/**
 * POST /api/sharing/invite
 * Create a share (if not exists) and invite a user by username.
 * Body: { username, options: { includeCollection, includeInventory } }
 */
router.post(
  "/invite",
  async (req: Request, res: Response): Promise<void> => {
    const ownerId = req.user!.userId;
    const { username, options } = req.body as {
      username?: string;
      options?: { includeCollection?: boolean; includeInventory?: boolean };
    };

    // Validate input
    if (!username || typeof username !== "string") {
      res.status(400).json({
        error: "validation_error",
        message: "username is required",
        statusCode: 400,
      });
      return;
    }

    if (!options || (!options.includeCollection && !options.includeInventory)) {
      res.status(400).json({
        error: "validation_error",
        message:
          "options must include at least one of includeCollection or includeInventory",
        statusCode: 400,
      });
      return;
    }

    // Find the invited user
    const [invitedUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!invitedUser) {
      res.status(404).json({
        error: "not_found",
        message: `User '${username}' not found`,
        statusCode: 404,
      });
      return;
    }

    // Cannot invite yourself
    if (invitedUser.id === ownerId) {
      res.status(400).json({
        error: "validation_error",
        message: "Cannot invite yourself",
        statusCode: 400,
      });
      return;
    }

    // Find or create the share for this owner
    const [foundShare] = await db
      .select()
      .from(share)
      .where(eq(share.ownerId, ownerId))
      .limit(1);

    let currentShare: typeof foundShare;

    if (!foundShare) {
      // Create a new share with a UUID-based link
      const shareLink = randomUUID();
      const [created] = await db
        .insert(share)
        .values({
          ownerId,
          shareLink,
          includeCollection: options.includeCollection ?? true,
          includeInventory: options.includeInventory ?? true,
        })
        .returning();
      currentShare = created!;
    } else {
      // Update share options if they changed
      const [updated] = await db
        .update(share)
        .set({
          includeCollection: options.includeCollection ?? foundShare.includeCollection,
          includeInventory: options.includeInventory ?? foundShare.includeInventory,
        })
        .where(eq(share.id, foundShare.id))
        .returning();
      currentShare = updated!;
    }

    // Check current active invite count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(shareInvite)
      .where(
        and(
          eq(shareInvite.shareId, currentShare.id),
          isNull(shareInvite.revokedAt),
        ),
      );

    const currentInviteCount = countResult?.count ?? 0;

    if (currentInviteCount >= MAX_INVITEES_PER_SHARE) {
      res.status(400).json({
        error: "limit_exceeded",
        message: `Maximum of ${MAX_INVITEES_PER_SHARE} invited users per share reached`,
        statusCode: 400,
      });
      return;
    }

    // Check if user is already invited (and not revoked)
    const [existingInvite] = await db
      .select()
      .from(shareInvite)
      .where(
        and(
          eq(shareInvite.shareId, currentShare.id),
          eq(shareInvite.invitedUserId, invitedUser.id),
          isNull(shareInvite.revokedAt),
        ),
      )
      .limit(1);

    if (existingInvite) {
      res.status(409).json({
        error: "conflict",
        message: `User '${username}' is already invited`,
        statusCode: 409,
      });
      return;
    }

    // Check if previously revoked - if so, re-invite
    const [revokedInvite] = await db
      .select()
      .from(shareInvite)
      .where(
        and(
          eq(shareInvite.shareId, currentShare.id),
          eq(shareInvite.invitedUserId, invitedUser.id),
        ),
      )
      .limit(1);

    let inviteRecord: { id: string; invitedAt: Date | null };
    if (revokedInvite && revokedInvite.revokedAt) {
      // Re-invite by clearing revoked timestamp
      const [reinvited] = await db
        .update(shareInvite)
        .set({ revokedAt: null, invitedAt: new Date() })
        .where(eq(shareInvite.id, revokedInvite.id))
        .returning();
      inviteRecord = { id: reinvited!.id, invitedAt: reinvited!.invitedAt };
    } else {
      // Create new invite
      const [created] = await db
        .insert(shareInvite)
        .values({
          shareId: currentShare.id,
          invitedUserId: invitedUser.id,
        })
        .returning();
      inviteRecord = { id: created!.id, invitedAt: created!.invitedAt };
    }

    res.status(201).json({
      success: true,
      message: `User '${username}' has been invited`,
      invite: {
        id: inviteRecord.id,
        shareId: currentShare.id,
        invitedUserId: invitedUser.id,
        invitedUsername: username,
        invitedAt: inviteRecord.invitedAt,
      },
      shareLink: currentShare.shareLink,
    });
  },
);

/**
 * DELETE /api/sharing/revoke/:userId
 * Revoke access for an invited user (set revokedAt timestamp).
 */
router.delete(
  "/revoke/:userId",
  async (req: Request, res: Response): Promise<void> => {
    const ownerId = req.user!.userId;
    const targetUserId = req.params["userId"] as string;

    if (!targetUserId) {
      res.status(400).json({
        error: "validation_error",
        message: "userId parameter is required",
        statusCode: 400,
      });
      return;
    }

    // Find the owner's share
    const [ownerShare] = await db
      .select()
      .from(share)
      .where(eq(share.ownerId, ownerId))
      .limit(1);

    if (!ownerShare) {
      res.status(404).json({
        error: "not_found",
        message: "No share found for current user",
        statusCode: 404,
      });
      return;
    }

    // Find the active invite for the target user
    const [invite] = await db
      .select()
      .from(shareInvite)
      .where(
        and(
          eq(shareInvite.shareId, ownerShare.id),
          eq(shareInvite.invitedUserId, targetUserId),
          isNull(shareInvite.revokedAt),
        ),
      )
      .limit(1);

    if (!invite) {
      res.status(404).json({
        error: "not_found",
        message: "No active invite found for this user",
        statusCode: 404,
      });
      return;
    }

    // Revoke by setting revokedAt
    await db
      .update(shareInvite)
      .set({ revokedAt: new Date() })
      .where(eq(shareInvite.id, invite.id));

    res.status(200).json({
      success: true,
      message: "Access revoked successfully",
    });
  },
);

/**
 * GET /api/sharing
 * Get the authenticated user's sharing settings (their share + invitees).
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.userId;

  // Find the owner's share
  const [ownerShare] = await db
    .select()
    .from(share)
    .where(eq(share.ownerId, ownerId))
    .limit(1);

  if (!ownerShare) {
    res.status(200).json({
      share: null,
      invitees: [],
    });
    return;
  }

  // Get active invites with usernames
  const invites = await db
    .select({
      id: shareInvite.id,
      invitedUserId: shareInvite.invitedUserId,
      username: users.username,
      invitedAt: shareInvite.invitedAt,
      revokedAt: shareInvite.revokedAt,
    })
    .from(shareInvite)
    .innerJoin(users, eq(shareInvite.invitedUserId, users.id))
    .where(eq(shareInvite.shareId, ownerShare.id));

  res.status(200).json({
    share: {
      id: ownerShare.id,
      shareLink: ownerShare.shareLink,
      includeCollection: ownerShare.includeCollection,
      includeInventory: ownerShare.includeInventory,
      createdAt: ownerShare.createdAt,
    },
    invitees: invites.map((inv) => ({
      id: inv.id,
      userId: inv.invitedUserId,
      username: inv.username,
      invitedAt: inv.invitedAt,
      revokedAt: inv.revokedAt,
      isActive: inv.revokedAt === null,
    })),
  });
});

export default router;
