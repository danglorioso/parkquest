-- Optional per-badge colors, for both admin-created and original launch badges
-- (the latter are now rows in custom_badges too — see the badge unification
-- migration script, not a SQL file, since it needs the condition-engine JSON).
ALTER TABLE "custom_badges" ADD COLUMN "colors" jsonb;
