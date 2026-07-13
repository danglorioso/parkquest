-- Admin edits to built-in badges (null column = keep the code-defined value),
-- plus optional custom colors on admin-defined badges.
CREATE TABLE "badge_overrides" (
  "badge_id" varchar(100) PRIMARY KEY NOT NULL,
  "name" varchar(100),
  "description" text,
  "emoji" varchar(20),
  "tier" varchar(20),
  "colors" jsonb,
  "conditions" jsonb,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "custom_badges" ADD COLUMN "colors" jsonb;
