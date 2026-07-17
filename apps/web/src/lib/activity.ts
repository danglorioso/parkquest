import { after } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// Per-instance throttle: Fluid Compute reuses warm instances, so this map
// usually persists across requests. On a cold instance the worst case is one
// redundant (idempotent) upsert. 5 minutes keeps write volume negligible.
const lastTouch = new Map<string, number>();
const THROTTLE_MS = 5 * 60_000;

// Record that a user is present, from authed read endpoints the clients hit
// on open (feed, notifications, profile). Write actions are already visible
// in their own tables; without this, browse-only sessions were invisible and
// the admin dashboard's "active users" undercounted (a user who opened the
// app five times but never posted counted as inactive).
//
// after() because Vercel kills un-awaited work when the response freezes —
// same rule as push sends. Never blocks or fails the calling request.
export function touchActivity(userId: string) {
  const now = Date.now();
  if (now - (lastTouch.get(userId) ?? 0) < THROTTLE_MS) return;
  lastTouch.set(userId, now);

  after(async () => {
    try {
      await db.execute(sql`
        UPDATE user_profiles SET last_seen_at = NOW() WHERE clerk_user_id = ${userId}
      `);
      await db.execute(sql`
        INSERT INTO user_activity_days (clerk_user_id, day, last_seen_at)
        VALUES (${userId}, (NOW() AT TIME ZONE 'America/New_York')::date, NOW())
        ON CONFLICT (clerk_user_id, day) DO UPDATE SET last_seen_at = NOW()
      `);
    } catch (err) {
      console.error('[activity] touch failed', err);
    }
  });
}
