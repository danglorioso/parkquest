ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "crowd" integer;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "difficulty" integer;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "weather_conditions" jsonb;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "activities" jsonb;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "companions" jsonb;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "would_return" varchar(10);--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "highlight" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "cover_photo" text;--> statement-breakpoint
