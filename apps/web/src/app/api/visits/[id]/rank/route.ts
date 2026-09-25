import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, gt, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits } from '@/lib/db/schema';
import { midpointKey } from '@/lib/rankKey';

// Places one visit at a new position in the caller's rank-ordered list, between
// `after_id` (the visit it should rank just below) and `before_id` (just above).
// Either may be omitted to place at the start/end of the list. See rankKey.ts.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const visitId = Number(id);
    if (isNaN(visitId)) return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });

    const body = await req.json();
    const afterId: number | null = body.after_id ?? null;
    const beforeId: number | null = body.before_id ?? null;

    const [target] = await db
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.id, visitId), eq(visits.clerk_user_id, userId)))
      .limit(1);
    if (!target) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });

    let afterKey: string | null = null;
    if (afterId !== null) {
      const [after] = await db
        .select({ rank_key: visits.rank_key })
        .from(visits)
        .where(and(eq(visits.id, afterId), eq(visits.clerk_user_id, userId)))
        .limit(1);
      if (!after || !after.rank_key) {
        return NextResponse.json({ error: 'after_id is not a ranked visit' }, { status: 400 });
      }
      afterKey = after.rank_key;
    }

    let beforeKey: string | null = null;
    if (beforeId !== null) {
      const [before] = await db
        .select({ rank_key: visits.rank_key })
        .from(visits)
        .where(and(eq(visits.id, beforeId), eq(visits.clerk_user_id, userId)))
        .limit(1);
      if (!before || !before.rank_key) {
        return NextResponse.json({ error: 'before_id is not a ranked visit' }, { status: 400 });
      }
      beforeKey = before.rank_key;
    }

    if (afterKey !== null && beforeKey !== null) {
      if (afterKey >= beforeKey) {
        return NextResponse.json({ error: 'after_id must rank before before_id' }, { status: 400 });
      }
      // Reject stale placements — some other visit already sits between the two
      // given neighbors, so the client's view of "adjacent" is out of date.
      const [between] = await db
        .select({ id: visits.id })
        .from(visits)
        .where(and(
          eq(visits.clerk_user_id, userId),
          gt(visits.rank_key, afterKey),
          lt(visits.rank_key, beforeKey),
        ))
        .limit(1);
      if (between) {
        return NextResponse.json({ error: 'Neighbors are no longer adjacent — refresh and retry' }, { status: 409 });
      }
    }

    const newKey = midpointKey(afterKey, beforeKey);

    const [updated] = await db
      .update(visits)
      .set({ rank_key: newKey, updated_at: new Date() })
      .where(and(eq(visits.id, visitId), eq(visits.clerk_user_id, userId)))
      .returning();

    return NextResponse.json({ message: 'Visit ranked', visit: updated });
  } catch (error) {
    console.error('Error ranking visit:', error);
    return NextResponse.json({ error: 'Failed to rank visit' }, { status: 500 });
  }
}
