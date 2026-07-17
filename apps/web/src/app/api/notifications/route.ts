import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications, userProfiles, parks } from '@/lib/db/schema';
import { touchActivity } from '@/lib/activity';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Clients poll this for the bell badge — the most reliable "app is open"
    // signal we have, which is why presence is recorded here.
    touchActivity(userId);

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get('count') === 'true';
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100);

    if (countOnly) {
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.recipient_id, userId), eq(notifications.read, false)));
      return NextResponse.json({ unread_count: row?.count ?? 0 });
    }

    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        actor_id: notifications.actor_id,
        actor_username: userProfiles.username,
        actor_display_name: userProfiles.display_name,
        actor_avatar_url: userProfiles.avatar_url,
        post_id: notifications.post_id,
        park_code: notifications.park_code,
        park_name: parks.name,
        metadata: notifications.metadata,
        read: notifications.read,
        created_at: notifications.created_at,
      })
      .from(notifications)
      .leftJoin(userProfiles, eq(notifications.actor_id, userProfiles.clerk_user_id))
      .leftJoin(parks, eq(notifications.park_code, parks.park_code))
      .where(eq(notifications.recipient_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { all, ids } = await request.json();

    if (all) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.recipient_id, userId), eq(notifications.read, false)));
    } else if (Array.isArray(ids) && ids.length > 0) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.recipient_id, userId), inArray(notifications.id, ids)));
    }

    return NextResponse.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
