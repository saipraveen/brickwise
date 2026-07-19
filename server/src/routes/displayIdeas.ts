import {
  type Router as RouterType,
  Router,
  type Request,
  type Response,
} from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { displayFavorite } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";

const router: RouterType = Router();

// All display ideas routes require authentication
router.use(authenticate);

// --- Static curated display ideas (MVP) ---

interface DisplayIdea {
  id: string;
  title: string;
  description: string;
  category: "shelf" | "wall-mount" | "diorama" | "lighting" | "stand";
  imageUrl: string;
  tips: string[];
}

const DISPLAY_IDEAS: DisplayIdea[] = [
  {
    id: "shelf-floating-1",
    title: "Floating Shelf Display",
    description:
      "Mount floating shelves at varying heights to create a dynamic gallery wall for your builds.",
    category: "shelf",
    imageUrl: "",
    tips: [
      "Use shelves at least 10 inches deep for larger sets",
      "Space shelves 12-16 inches apart vertically",
      "Add LED strip lighting underneath each shelf",
    ],
  },
  {
    id: "shelf-bookcase-1",
    title: "IKEA Detolf Glass Cabinet",
    description:
      "A popular glass-door cabinet that protects builds from dust while keeping them visible.",
    category: "shelf",
    imageUrl: "",
    tips: [
      "Add extra glass shelves for smaller sets",
      "Use risers inside to create multi-level displays",
      "Place near a window for natural lighting",
    ],
  },
  {
    id: "shelf-corner-1",
    title: "Corner Shelf Tower",
    description:
      "Maximize unused corner space with a rotating corner shelf unit.",
    category: "shelf",
    imageUrl: "",
    tips: [
      "Great for displaying minifigure collections",
      "Use lazy susan bases for 360-degree viewing",
      "Works well in bedrooms and offices",
    ],
  },
  {
    id: "wall-mount-bracket-1",
    title: "Wall-Mounted Bracket Display",
    description:
      "Use angled brackets to mount builds directly on the wall like art pieces.",
    category: "wall-mount",
    imageUrl: "",
    tips: [
      "Perfect for vehicles and spacecraft",
      "Use museum putty for extra security",
      "Angle brackets 15-30 degrees for best viewing",
    ],
  },
  {
    id: "wall-mount-rail-1",
    title: "Picture Rail System",
    description:
      "Install a picture rail system to hang builds at adjustable heights without additional holes.",
    category: "wall-mount",
    imageUrl: "",
    tips: [
      "Easy to rearrange without new wall holes",
      "Supports heavy builds with proper wire gauge",
      "Install at ceiling height for clean look",
    ],
  },
  {
    id: "wall-mount-shadow-1",
    title: "Shadow Box Frame",
    description:
      "Display flat or small builds inside deep shadow box frames for a gallery-style presentation.",
    category: "wall-mount",
    imageUrl: "",
    tips: [
      "Ideal for mosaic and art sets",
      "Use velcro or double-sided tape to secure builds",
      "Group multiple frames for a collection wall",
    ],
  },
  {
    id: "diorama-city-1",
    title: "City Street Diorama",
    description:
      "Build a connected city layout with baseplates, roads, and landscaping for your City sets.",
    category: "diorama",
    imageUrl: "",
    tips: [
      "Use road baseplates as the foundation",
      "Add trees and park areas between buildings",
      "Elevate some areas to create hills",
    ],
  },
  {
    id: "diorama-star-wars-1",
    title: "Star Wars Scene Display",
    description:
      "Create themed diorama scenes from your favorite Star Wars moments.",
    category: "diorama",
    imageUrl: "",
    tips: [
      "Use gray baseplates for Death Star scenes",
      "Cotton batting makes great cloud or snow effects",
      "Print backdrop images for added depth",
    ],
  },
  {
    id: "diorama-underwater-1",
    title: "Underwater World Diorama",
    description:
      "Build an ocean scene with transparent blue elements and aquatic creatures.",
    category: "diorama",
    imageUrl: "",
    tips: [
      "Layer transparent blue plates for water depth effect",
      "Use sand-colored plates for the ocean floor",
      "Suspend elements with transparent supports",
    ],
  },
  {
    id: "lighting-led-strip-1",
    title: "LED Strip Accent Lighting",
    description:
      "Add programmable LED strips around your display area for dramatic ambient lighting.",
    category: "lighting",
    imageUrl: "",
    tips: [
      "Use warm white (3000K) for a cozy look",
      "RGB strips let you change colors to match themes",
      "Hide strips behind or under shelves for indirect light",
    ],
  },
  {
    id: "lighting-spotlight-1",
    title: "Individual Spotlights",
    description:
      "Use small directional spotlights to highlight your favorite builds.",
    category: "lighting",
    imageUrl: "",
    tips: [
      "Battery-powered puck lights work without wiring",
      "Angle lights at 30 degrees to reduce glare",
      "Use cool white for modern sets, warm for classic",
    ],
  },
  {
    id: "lighting-backlight-1",
    title: "Backlit Display Panel",
    description:
      "Place builds in front of a backlit panel for a silhouette or halo effect.",
    category: "lighting",
    imageUrl: "",
    tips: [
      "Great for architecture and skyline sets",
      "Use diffused light panels for even illumination",
      "Combine with dark background for maximum contrast",
    ],
  },
  {
    id: "stand-turntable-1",
    title: "Motorized Turntable Stand",
    description:
      "Place builds on a slowly rotating turntable to showcase all angles automatically.",
    category: "stand",
    imageUrl: "",
    tips: [
      "Solar-powered turntables work near windows",
      "Choose a turntable rated for your build weight",
      "Rotation speed of 2-4 RPM works best",
    ],
  },
  {
    id: "stand-acrylic-1",
    title: "Custom Acrylic Display Stand",
    description:
      "Use transparent acrylic stands to elevate builds and create a floating effect.",
    category: "stand",
    imageUrl: "",
    tips: [
      "Measure your build footprint before ordering",
      "Angled stands work well for vehicles",
      "Stack multiple levels for minifigure armies",
    ],
  },
  {
    id: "stand-nameplate-1",
    title: "Stand with Nameplate",
    description:
      "Display builds on stands with engraved nameplates showing set number and name.",
    category: "stand",
    imageUrl: "",
    tips: [
      "Include set number, name, and year on the plate",
      "Black acrylic plates look professional",
      "Add a spot for the minifigure count",
    ],
  },
];

const VALID_CATEGORIES = [
  "shelf",
  "wall-mount",
  "diorama",
  "lighting",
  "stand",
] as const;

type DisplayCategory = (typeof VALID_CATEGORIES)[number];

const MAX_FAVORITES_PER_USER = 100;

/**
 * GET /api/display-ideas
 * Returns curated display ideas with optional category filter.
 *
 * Query params:
 *   category (string, optional) - filter by category: shelf, wall-mount, diorama, lighting, stand
 */
router.get("/", (req: Request, res: Response): void => {
  const categoryParam = req.query["category"] as string | undefined;

  let ideas = DISPLAY_IDEAS;

  if (categoryParam) {
    const category = categoryParam.toLowerCase() as DisplayCategory;

    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: "validation_error",
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
        statusCode: 400,
      });
      return;
    }

    ideas = DISPLAY_IDEAS.filter((idea) => idea.category === category);
  }

  res.status(200).json({ data: ideas });
});

/**
 * POST /api/display-ideas/favorites
 * Save a display idea to user's favorites.
 * Body: { ideaId: string }
 * Limit: 100 favorites per user.
 */
router.post(
  "/favorites",
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { ideaId } = req.body as { ideaId?: string };

    if (!ideaId || typeof ideaId !== "string") {
      res.status(400).json({
        error: "validation_error",
        message: "ideaId is required",
        statusCode: 400,
      });
      return;
    }

    // Validate that the idea exists in our curated list
    const idea = DISPLAY_IDEAS.find((i) => i.id === ideaId);
    if (!idea) {
      res.status(404).json({
        error: "not_found",
        message: `Display idea '${ideaId}' not found`,
        statusCode: 404,
      });
      return;
    }

    // Check if already favorited (unique constraint on userId + displayIdeaId)
    const [existing] = await db
      .select()
      .from(displayFavorite)
      .where(
        and(
          eq(displayFavorite.userId, userId),
          eq(displayFavorite.displayIdeaId, ideaId),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({
        error: "conflict",
        message: "Display idea already in favorites",
        statusCode: 409,
      });
      return;
    }

    // Check favorites count limit
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(displayFavorite)
      .where(eq(displayFavorite.userId, userId));

    const currentCount = countResult?.count ?? 0;

    if (currentCount >= MAX_FAVORITES_PER_USER) {
      res.status(400).json({
        error: "limit_exceeded",
        message: `Maximum of ${MAX_FAVORITES_PER_USER} display idea favorites reached`,
        statusCode: 400,
      });
      return;
    }

    // Insert the favorite
    const [created] = await db
      .insert(displayFavorite)
      .values({
        userId,
        displayIdeaId: ideaId,
        title: idea.title,
        category: idea.category,
      })
      .returning();

    res.status(201).json({
      success: true,
      favorite: {
        id: created!.id,
        displayIdeaId: created!.displayIdeaId,
        title: created!.title,
        category: created!.category,
        savedAt: created!.savedAt,
      },
    });
  },
);

/**
 * GET /api/display-ideas/favorites
 * Get the authenticated user's display idea favorites.
 */
router.get(
  "/favorites",
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const favorites = await db
      .select()
      .from(displayFavorite)
      .where(eq(displayFavorite.userId, userId));

    res.status(200).json({
      data: favorites.map((fav) => ({
        id: fav.id,
        displayIdeaId: fav.displayIdeaId,
        title: fav.title,
        category: fav.category,
        savedAt: fav.savedAt,
      })),
    });
  },
);

/**
 * DELETE /api/display-ideas/favorites/:ideaId
 * Remove a display idea from user's favorites.
 */
router.delete(
  "/favorites/:ideaId",
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const ideaId = req.params["ideaId"] as string;

    if (!ideaId) {
      res.status(400).json({
        error: "validation_error",
        message: "ideaId parameter is required",
        statusCode: 400,
      });
      return;
    }

    // Find and delete the favorite
    const [deleted] = await db
      .delete(displayFavorite)
      .where(
        and(
          eq(displayFavorite.userId, userId),
          eq(displayFavorite.displayIdeaId, ideaId),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({
        error: "not_found",
        message: "Display idea not found in favorites",
        statusCode: 404,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Display idea removed from favorites",
    });
  },
);

export default router;
