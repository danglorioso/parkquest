import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reports } from '@/lib/db/schema';
import { notifyAdmin } from '@/lib/notifyAdmin';

const TARGET_TYPES = ['post', 'comment', 'user'] as const;
const REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'misleading', 'blocked', 'other'] as const;

// GET /api/reports — reports the current user has submitted
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.reporter_id, userId))
    .orderBy(desc(reports.created_at))
    .limit(100);

  return NextResponse.json(rows);
}

// POST /api/reports { targetType, targetId, reason, details? } — flag content or a user
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { targetType, targetId, reason, details } = await request.json();

    if (!TARGET_TYPES.includes(targetType)) {
      return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 });
    }
    if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 });
    if (!REASONS.includes(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(reports)
      .values({
        reporter_id: userId,
        target_type: targetType,
        target_id: String(targetId),
        reason,
        details: details ? String(details).slice(0, 2000) : null,
      })
      .returning();

    if (inserted) {
      notifyAdmin({
        subject: `ParkQuest: new ${targetType} report`,
        reportId: inserted.id,
        reporterId: userId,
        targetType,
        targetId: String(targetId),
        reason,
        details: inserted.details,
      }).catch(() => {});
    }

    return NextResponse.json({ message: 'Report submitted' });
  } catch (error) {
    console.error('Error submitting report:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
