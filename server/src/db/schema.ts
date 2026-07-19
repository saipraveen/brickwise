import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";

// --- Enums ---

export const setBuildStatusEnum = pgEnum("set_build_status", [
  "built",
  "disassembled",
  "partial",
]);

export const brickStatusEnum = pgEnum("brick_status", [
  "available",
  "in-use",
  "in-storage",
]);

// --- Tables ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 30 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLogin: timestamp("last_login", { withTimezone: true }),
});

export const setCollection = pgTable(
  "set_collection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    setNumber: varchar("set_number", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    theme: varchar("theme", { length: 100 }).notNull(),
    year: integer("year").notNull(),
    pieceCount: integer("piece_count").notNull(),
    status: setBuildStatusEnum("status").notNull().default("disassembled"),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("set_collection_user_id_idx").on(table.userId),
    index("set_collection_set_number_idx").on(table.setNumber),
  ],
);

export const brickInventory = pgTable(
  "brick_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    partNumber: varchar("part_number", { length: 20 }).notNull(),
    colorId: integer("color_id").notNull(),
    quantity: integer("quantity").notNull(),
    status: brickStatusEnum("status").notNull().default("available"),
    bagNumber: integer("bag_number"),
    sourceSetNumber: varchar("source_set_number", { length: 20 }),
    lastModified: timestamp("last_modified", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("brick_inventory_user_id_idx").on(table.userId),
    index("brick_inventory_part_color_idx").on(table.partNumber, table.colorId),
    index("brick_inventory_status_idx").on(table.userId, table.status),
    index("brick_inventory_bag_idx").on(table.userId, table.bagNumber),
  ],
);

export const storageBag = pgTable(
  "storage_bag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bagNumber: integer("bag_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("storage_bag_user_bag_idx").on(table.userId, table.bagNumber),
  ],
);

export const share = pgTable(
  "share",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shareLink: varchar("share_link", { length: 255 }).notNull().unique(),
    includeCollection: boolean("include_collection").notNull().default(true),
    includeInventory: boolean("include_inventory").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("share_owner_id_idx").on(table.ownerId)],
);

export const shareInvite = pgTable(
  "share_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => share.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("share_invite_share_id_idx").on(table.shareId),
    index("share_invite_user_id_idx").on(table.invitedUserId),
  ],
);

export const mocWishlist = pgTable(
  "moc_wishlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mocId: varchar("moc_id", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    thumbnailUrl: text("thumbnail_url").notNull(),
    designer: varchar("designer", { length: 100 }).notNull(),
    pieceCount: integer("piece_count").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("moc_wishlist_user_id_idx").on(table.userId),
    uniqueIndex("moc_wishlist_user_moc_idx").on(table.userId, table.mocId),
  ],
);

export const displayFavorite = pgTable(
  "display_favorite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayIdeaId: varchar("display_idea_id", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("display_favorite_user_id_idx").on(table.userId),
    uniqueIndex("display_favorite_user_idea_idx").on(
      table.userId,
      table.displayIdeaId,
    ),
  ],
);

export const catalogPart = pgTable("catalog_part", {
  partNumber: varchar("part_number", { length: 20 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: integer("category_id").notNull(),
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  imageUrl: text("image_url").notNull(),
  lastSynced: timestamp("last_synced", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const catalogColor = pgTable("catalog_color", {
  colorId: integer("color_id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  hexCode: varchar("hex_code", { length: 7 }).notNull(),
  isTransparent: boolean("is_transparent").notNull().default(false),
});

export const catalogSet = pgTable("catalog_set", {
  setNumber: varchar("set_number", { length: 20 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  theme: varchar("theme", { length: 100 }).notNull(),
  year: integer("year").notNull(),
  pieceCount: integer("piece_count").notNull(),
  imageUrl: text("image_url").notNull(),
  lastSynced: timestamp("last_synced", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const catalogSetPart = pgTable(
  "catalog_set_part",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setNumber: varchar("set_number", { length: 20 })
      .notNull()
      .references(() => catalogSet.setNumber, { onDelete: "cascade" }),
    partNumber: varchar("part_number", { length: 20 })
      .notNull()
      .references(() => catalogPart.partNumber, { onDelete: "cascade" }),
    colorId: integer("color_id")
      .notNull()
      .references(() => catalogColor.colorId, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    isSpare: boolean("is_spare").notNull().default(false),
  },
  (table) => [
    index("catalog_set_part_set_idx").on(table.setNumber),
    index("catalog_set_part_part_idx").on(table.partNumber),
    index("catalog_set_part_color_idx").on(table.colorId),
  ],
);

export const scanUsage = pgTable(
  "scan_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    estimatedCostCents: real("estimated_cost_cents").notNull(),
  },
  (table) => [
    index("scan_usage_user_id_idx").on(table.userId),
    index("scan_usage_scanned_at_idx").on(table.scannedAt),
  ],
);
