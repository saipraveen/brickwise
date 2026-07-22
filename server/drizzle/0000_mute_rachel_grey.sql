CREATE TYPE "public"."brick_status" AS ENUM('available', 'in-use', 'in-storage');--> statement-breakpoint
CREATE TYPE "public"."set_build_status" AS ENUM('built', 'disassembled', 'partial');--> statement-breakpoint
CREATE TABLE "brick_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"part_number" varchar(20) NOT NULL,
	"color_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" "brick_status" DEFAULT 'available' NOT NULL,
	"bag_number" integer,
	"source_set_number" varchar(20),
	"last_modified" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_color" (
	"color_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"hex_code" varchar(7) NOT NULL,
	"is_transparent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_part" (
	"part_number" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category_id" integer NOT NULL,
	"category_name" varchar(100) NOT NULL,
	"image_url" text NOT NULL,
	"last_synced" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_set" (
	"set_number" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"theme" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"piece_count" integer NOT NULL,
	"image_url" text NOT NULL,
	"last_synced" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_set_part" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_number" varchar(20) NOT NULL,
	"part_number" varchar(20) NOT NULL,
	"color_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"is_spare" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "display_favorite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_idea_id" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"category" varchar(50) NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moc_wishlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"moc_id" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"thumbnail_url" text NOT NULL,
	"designer" varchar(100) NOT NULL,
	"piece_count" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"estimated_cost_cents" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"set_number" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"theme" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"piece_count" integer NOT NULL,
	"status" "set_build_status" DEFAULT 'disassembled' NOT NULL,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"share_link" varchar(255) NOT NULL,
	"include_collection" boolean DEFAULT true NOT NULL,
	"include_inventory" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_share_link_unique" UNIQUE("share_link")
);
--> statement-breakpoint
CREATE TABLE "share_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"invited_user_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "storage_bag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bag_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(30) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login" timestamp with time zone,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "brick_inventory" ADD CONSTRAINT "brick_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_set_part" ADD CONSTRAINT "catalog_set_part_set_number_catalog_set_set_number_fk" FOREIGN KEY ("set_number") REFERENCES "public"."catalog_set"("set_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_set_part" ADD CONSTRAINT "catalog_set_part_part_number_catalog_part_part_number_fk" FOREIGN KEY ("part_number") REFERENCES "public"."catalog_part"("part_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_set_part" ADD CONSTRAINT "catalog_set_part_color_id_catalog_color_color_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."catalog_color"("color_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_favorite" ADD CONSTRAINT "display_favorite_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moc_wishlist" ADD CONSTRAINT "moc_wishlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_usage" ADD CONSTRAINT "scan_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_collection" ADD CONSTRAINT "set_collection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invite" ADD CONSTRAINT "share_invite_share_id_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."share"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_invite" ADD CONSTRAINT "share_invite_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_bag" ADD CONSTRAINT "storage_bag_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brick_inventory_user_id_idx" ON "brick_inventory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brick_inventory_part_color_idx" ON "brick_inventory" USING btree ("part_number","color_id");--> statement-breakpoint
CREATE INDEX "brick_inventory_status_idx" ON "brick_inventory" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "brick_inventory_bag_idx" ON "brick_inventory" USING btree ("user_id","bag_number");--> statement-breakpoint
CREATE INDEX "catalog_set_part_set_idx" ON "catalog_set_part" USING btree ("set_number");--> statement-breakpoint
CREATE INDEX "catalog_set_part_part_idx" ON "catalog_set_part" USING btree ("part_number");--> statement-breakpoint
CREATE INDEX "catalog_set_part_color_idx" ON "catalog_set_part" USING btree ("color_id");--> statement-breakpoint
CREATE INDEX "display_favorite_user_id_idx" ON "display_favorite" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "display_favorite_user_idea_idx" ON "display_favorite" USING btree ("user_id","display_idea_id");--> statement-breakpoint
CREATE INDEX "moc_wishlist_user_id_idx" ON "moc_wishlist" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moc_wishlist_user_moc_idx" ON "moc_wishlist" USING btree ("user_id","moc_id");--> statement-breakpoint
CREATE INDEX "scan_usage_user_id_idx" ON "scan_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scan_usage_scanned_at_idx" ON "scan_usage" USING btree ("scanned_at");--> statement-breakpoint
CREATE INDEX "set_collection_user_id_idx" ON "set_collection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "set_collection_set_number_idx" ON "set_collection" USING btree ("set_number");--> statement-breakpoint
CREATE INDEX "share_owner_id_idx" ON "share" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "share_invite_share_id_idx" ON "share_invite" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "share_invite_user_id_idx" ON "share_invite" USING btree ("invited_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_bag_user_bag_idx" ON "storage_bag" USING btree ("user_id","bag_number");