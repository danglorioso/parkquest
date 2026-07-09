import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { blocks } from '@/lib/db/schema';

// Ids blocked by, or blocking, the given user (either direction).
export async function getBlockedIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blocker_id: blocks.blocker_id, blocked_id: blocks.blocked_id })
    .from(blocks)
    .where(or(eq(blocks.blocker_id, userId), eq(blocks.blocked_id, userId)));

  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.blocker_id === userId ? r.blocked_id : r.blocker_id);
  }
  return Array.from(ids);
}
