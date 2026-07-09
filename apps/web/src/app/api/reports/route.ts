import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { reports } from '@/lib/db/schema';
import { notifyAdmin } from '@/lib/notifyAdmin';

const TARGET_TYPES = ['post', 'comment', 'user'] as const;
const REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;

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
