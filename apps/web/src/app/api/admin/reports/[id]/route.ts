import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { reports, posts, comments } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';

const ACTIONS = ['dismiss', 'remove_content', 'ban_user'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const { action } = await request.json();
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const [report] = await db.select().from(reports).where(eq(reports.id, Number(id))).limit(1);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  if (action === 'remove_content') {
    if (report.target_type === 'post') {
      await db.delete(posts).where(eq(posts.id, Number(report.target_id)));
    } else if (report.target_type === 'comment') {
      await db.delete(comments).where(eq(comments.id, Number(report.target_id)));
    }
  }

  if (action === 'ban_user') {
    let targetUserId: string | null = null;
    if (report.target_type === 'user') {
      targetUserId = report.target_id;
    } else if (report.target_type === 'post') {
      const [p] = await db.select({ clerk_user_id: posts.clerk_user_id }).from(posts).where(eq(posts.id, Number(report.target_id)));
      targetUserId = p?.clerk_user_id ?? null;
    } else if (report.target_type === 'comment') {
      const [c] = await db.select({ user_id: comments.user_id }).from(comments).where(eq(comments.id, Number(report.target_id)));
      targetUserId = c?.user_id ?? null;
    }
    if (targetUserId) {
      const client = await clerkClient();
      await client.users.banUser(targetUserId).catch(() => {});
    }
  }

  const [updated] = await db
    .update(reports)
    .set({
      status: action === 'dismiss' ? 'dismissed' : 'actioned',
      reviewed_by: admin.id,
      reviewed_at: new Date(),
    })
    .where(eq(reports.id, Number(id)))
    .returning();

  return NextResponse.json(updated);
}
