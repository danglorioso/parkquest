// One-shot: creates the custom_badges table (drizzle/0010_custom_badges.sql).
// Safe to re-run — no-ops if the table exists. Run from apps/web:
//   node --env-file=.env.local scripts/apply-custom-badges.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const [{ exists }] = await sql`
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'custom_badges') AS exists
`;

if (exists) {
  console.log('custom_badges table already exists — nothing to do');
} else {
  await sql`
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
    )
  `;
  console.log('custom_badges table created');
}
