CREATE TABLE "custom_badges" (
  "id" serial PRIMARY KEY NOT NULL,
  "badge_id" varchar(100) NOT NULL UNIQUE,
  "name" varchar(100) NOT NULL,
  "description" text NOT NULL,
  "emoji" varchar(20) NOT NULL,
  "tier" varchar(20) DEFAULT 'bronze' NOT NULL,
  "conditions" jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
