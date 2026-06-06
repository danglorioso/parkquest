ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "display_name" varchar(100);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "avatar_url" text;--> statement-breakpoint
