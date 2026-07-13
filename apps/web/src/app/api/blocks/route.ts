import { NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { blocks, reports, userProfiles, friendships } from '@/lib/db/schema';
import { notifyAdmin } from '@/lib/notifyAdmin';

// GET /api/blocks — list users the current user has blocked
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db
      .select({ blocked_id: blocks.blocked_id, blocked_at: blocks.created_at })
      .from(blocks)
      .where(eq(blocks.blocker_id, userId));

    if (rows.length === 0) return NextResponse.json([]);

    const profiles = await db
      .select({
        clerk_user_id: userProfiles.clerk_user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.clerk_user_id, rows.map(r => r.blocked_id)));

    const atMap = new Map(rows.map(r => [r.blocked_id, r.blocked_at]));
    const result = profiles.map(p => ({ ...p, blocked_at: atMap.get(p.clerk_user_id) ?? null }));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
  }
}

// POST /api/blocks { userId: targetId, reason? } — block a user
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId: targetId, reason } = await request.json();
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    if (targetId === userId) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 });

    const [inserted] = await db
      .insert(blocks)
      .values({ blocker_id: userId, blocked_id: targetId, reason: reason ?? null })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      // Blocking severs any existing friendship in both directions — a block
      // means no interaction anywhere in the app, so staying "friends" while
      // blocked would keep leaking friends-only visibility.
      await db.delete(friendships).where(
        or(
          and(eq(friendships.requester_id, userId), eq(friendships.recipient_id, targetId)),
          and(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, userId)),
        )
      );

      // Blocking always produces a developer-visible report so abuse doesn't
      // go unnoticed just because the victim only blocked instead of reporting.
      // Classified separately from 'harassment' — it's just a block, not an
      // accusation. Removed automatically if the blocker unblocks (see DELETE below).
      const [report] = await db
        .insert(reports)
        .values({
          reporter_id: userId,
          target_type: 'user',
          target_id: targetId,
          reason: 'blocked',
          details: reason ?? 'User blocked another user.',
        })
        .returning();

      if (report) {
        // Un-awaited work dies when the serverless response returns; after() keeps
        // the function alive until the email is actually sent.
        after(() => notifyAdmin({
          subject: 'ParkQuest: user blocked (auto-report)',
          reportId: report.id,
          reporterId: userId,
          targetType: 'user',
          targetId,
          reason: report.reason,
          details: report.details,
        }).catch(() => {}));
      }
    }

    return NextResponse.json({ message: 'Blocked' });
  } catch (error) {
    console.error('Error blocking user:', error);
    return NextResponse.json({ error: 'Failed to block user' }, { status: 500 });
  }
}

// DELETE /api/blocks?userId=targetId — unblock a user
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('userId');
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    await db.delete(blocks).where(
      and(eq(blocks.blocker_id, userId), eq(blocks.blocked_id, targetId))
    );

    // Clear the auto-generated 'blocked' report so it doesn't linger in the
    // queue once the blocker has reversed their decision. Any real report
    // the user separately filed (a different reason) is left untouched.
    await db.delete(reports).where(
      and(
        eq(reports.reporter_id, userId),
        eq(reports.target_type, 'user'),
        eq(reports.target_id, targetId),
        eq(reports.reason, 'blocked'),
        eq(reports.status, 'open'),
      )
    );

    return NextResponse.json({ message: 'Unblocked' });
  } catch (error) {
    console.error('Error unblocking user:', error);
    return NextResponse.json({ error: 'Failed to unblock user' }, { status: 500 });
  }
}
