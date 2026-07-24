import { NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { friendships, userProfiles, notifications } from '@/lib/db/schema';
import { sendPushToUser } from '@/lib/push';
import { getBlockedIds } from '@/lib/blocks';
import { ensureUserProfile } from '@/lib/ensureUserProfile';

// GET /api/friends?userId=...&type=friends|pending_incoming|pending_outgoing
// userId defaults to the authenticated caller — only needed to view someone
// else's public friends list (e.g. the FriendListModal on a profile page).
export async function GET(request: Request) {
  try {
    const { userId: viewerId } = await auth();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') ?? viewerId;
    const type = searchParams.get('type') ?? 'friends';
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100);
    const offset = Number(searchParams.get('offset') ?? '0');

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    if (type === 'friends') {
      const friendIds = await db
        .select({
          friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${userId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
          friends_since: friendships.updated_at,
        })
        .from(friendships)
        .where(
          and(
            or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId)),
            eq(friendships.status, 'accepted')
          )
        )
        .limit(limit)
        .offset(offset);

      if (friendIds.length === 0) return NextResponse.json([]);

      // Hide anyone the viewer has blocked (or who has blocked the viewer)
      // out of any friends list, even one that isn't their own.
      const blockedIds = viewerId ? await getBlockedIds(viewerId) : [];
      const visibleFriendIds = blockedIds.length > 0
        ? friendIds.filter(r => !blockedIds.includes(r.friend_id))
        : friendIds;
      if (visibleFriendIds.length === 0) return NextResponse.json([]);

      const profiles = await db
        .select({
          clerk_user_id: userProfiles.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
        })
        .from(userProfiles)
        .where(inArray(userProfiles.clerk_user_id, visibleFriendIds.map(r => r.friend_id)));

      // A friend with no user_profiles row silently vanishes from this list
      // while the friend COUNT (raw friendships query, no join) still
      // includes them — seen as "5 friends" opening a 4-person list. Profile
      // rows are created lazily, so an account predating the Clerk webhook
      // has none until one of its own routes runs ensureUserProfile. When
      // the missing friend is the viewer themself, heal it right here
      // (ensureUserProfile builds the row from the current session's Clerk
      // user, so it can only self-heal; other orphans need
      // scripts/backfill-orphan-profiles.mjs).
      if (
        viewerId &&
        visibleFriendIds.some(r => r.friend_id === viewerId) &&
        !profiles.some(p => p.clerk_user_id === viewerId)
      ) {
        try {
          const self = await ensureUserProfile(viewerId);
          profiles.push({
            clerk_user_id: self.clerk_user_id,
            username: self.username,
            display_name: self.display_name,
            avatar_url: self.avatar_url,
          });
        } catch { /* better a short list than a failed one */ }
      }

      const sinceMap = new Map(visibleFriendIds.map(r => [r.friend_id, r.friends_since]));
      const rows = profiles.map(p => ({ ...p, friends_since: sinceMap.get(p.clerk_user_id) ?? null }));
      return NextResponse.json(rows);
    }

    if (type === 'pending_incoming') {
      const rows = await db
        .select({
          friendship_id: friendships.id,
          clerk_user_id: userProfiles.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          requested_at: friendships.created_at,
        })
        .from(friendships)
        .innerJoin(userProfiles, eq(friendships.requester_id, userProfiles.clerk_user_id))
        .where(and(eq(friendships.recipient_id, userId), eq(friendships.status, 'pending')))
        .limit(limit)
        .offset(offset);
      return NextResponse.json(rows);
    }

    if (type === 'pending_outgoing') {
      const rows = await db
        .select({
          friendship_id: friendships.id,
          clerk_user_id: userProfiles.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          requested_at: friendships.created_at,
        })
        .from(friendships)
        .innerJoin(userProfiles, eq(friendships.recipient_id, userProfiles.clerk_user_id))
        .where(and(eq(friendships.requester_id, userId), eq(friendships.status, 'pending')))
        .limit(limit)
        .offset(offset);
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching friends:', error);
    return NextResponse.json({ error: 'Failed to fetch friends' }, { status: 500 });
  }
}

// POST /api/friends { userId: targetId } — send friend request
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId: targetId } = await request.json();
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    if (targetId === userId) return NextResponse.json({ error: 'Cannot friend yourself' }, { status: 400 });

    const blockedIds = await getBlockedIds(userId);
    if (blockedIds.includes(targetId)) {
      return NextResponse.json({ error: 'Cannot friend a blocked user' }, { status: 403 });
    }

    const existing = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requester_id, userId), eq(friendships.recipient_id, targetId)),
          and(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, userId))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const f = existing[0];
      if (f.status === 'accepted') {
        return NextResponse.json({ error: 'Already friends' }, { status: 409 });
      }
      if (f.status === 'pending' && f.requester_id === userId) {
        return NextResponse.json({ message: 'Friend request already sent', status: 'pending_sent' });
      }
      if (f.status === 'pending' && f.recipient_id === userId) {
        // They already sent us a request — auto-accept
        await db.update(friendships).set({ status: 'accepted', updated_at: new Date() }).where(eq(friendships.id, f.id));
        await db.insert(notifications).values({ recipient_id: targetId, actor_id: userId, type: 'friend_accepted' }).catch(() => {});
        // The request is resolved — mark its "sent you a friend request"
        // notification as accepted rather than deleting it, same as the
        // PATCH accept path, so it settles into "You are now friends" instead
        // of disappearing from the recipient's notification history.
        await db.update(notifications)
          .set({ metadata: sql`${notifications.metadata} || ${JSON.stringify({ resolved: 'accepted' })}::jsonb` })
          .where(
            and(
              eq(notifications.type, 'friend_request'),
              sql`${notifications.metadata}->>'friendship_id' = ${String(f.id)}`
            )
          ).catch(() => {});
        return NextResponse.json({ message: 'Friend request accepted', status: 'accepted' });
      }
      // Rejected — allow re-request
      await db.update(friendships).set({ status: 'pending', updated_at: new Date() }).where(eq(friendships.id, f.id));
    } else {
      const [inserted] = await db
        .insert(friendships)
        .values({ requester_id: userId, recipient_id: targetId, status: 'pending' })
        .returning();

      if (inserted) {
        // ensureUserProfile, not a raw select — if the actor's onboarding
        // profile-create failed silently, the row doesn't exist yet and the
        // push would bake in "Someone" even though a username was available.
        const actor = await ensureUserProfile(userId).catch(() => null);
        const name = actor?.display_name?.trim() || actor?.username || 'Someone';

        await db.insert(notifications).values({
          recipient_id: targetId,
          actor_id: userId,
          type: 'friend_request',
          metadata: { friendship_id: inserted.id },
        }).catch(() => {});

        // Un-awaited work dies when the serverless response returns; after() keeps
        // the function alive until the push is actually handed to Expo.
        after(() => sendPushToUser(targetId, {
          title: 'New friend request',
          body: `${name} wants to be your friend.`,
          url: '/friends',
        }).catch(() => {}));
      }
    }

    return NextResponse.json({ message: 'Friend request sent', status: 'pending_sent' });
  } catch (error) {
    console.error('Error sending friend request:', error);
    return NextResponse.json({ error: 'Failed to send friend request' }, { status: 500 });
  }
}

// PATCH /api/friends { friendshipId: number, action: 'accept' | 'reject' }
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { friendshipId, action } = await request.json();
    if (!friendshipId || !action) {
      return NextResponse.json({ error: 'friendshipId and action are required' }, { status: 400 });
    }
    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be accept or reject' }, { status: 400 });
    }

    const [friendship] = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.id, friendshipId),
          eq(friendships.recipient_id, userId),
          eq(friendships.status, 'pending')
        )
      )
      .limit(1);

    if (!friendship) return NextResponse.json({ error: 'Friend request not found' }, { status: 404 });

    // The original "sent you a friend request" notification is resolved either
    // way, but stays in the recipient's list (metadata.resolved flag) instead
    // of being deleted — otherwise it just vanishes on the next fetch instead
    // of settling into "You are now friends with X" / "You declined...".
    await db.update(notifications)
      .set({ metadata: sql`${notifications.metadata} || ${JSON.stringify({ resolved: action === 'accept' ? 'accepted' : 'declined' })}::jsonb` })
      .where(
        and(
          eq(notifications.type, 'friend_request'),
          sql`${notifications.metadata}->>'friendship_id' = ${String(friendshipId)}`
        )
      ).catch(() => {});

    if (action === 'accept') {
      await db.update(friendships).set({ status: 'accepted', updated_at: new Date() }).where(eq(friendships.id, friendshipId));
      await db.insert(notifications).values({
        recipient_id: friendship.requester_id,
        actor_id: userId,
        type: 'friend_accepted',
      }).catch(() => {});
      const actor = await ensureUserProfile(userId).catch(() => null);
      const name = actor?.display_name?.trim() || actor?.username || 'Someone';
      after(() => sendPushToUser(friendship.requester_id, {
        title: 'Friend request accepted',
        body: `${name} accepted your friend request.`,
        url: '/friends',
      }).catch(() => {}));
    } else {
      await db.update(friendships).set({ status: 'rejected', updated_at: new Date() }).where(eq(friendships.id, friendshipId));
    }

    return NextResponse.json({ message: action === 'accept' ? 'Friend request accepted' : 'Friend request rejected' });
  } catch (error) {
    console.error('Error responding to friend request:', error);
    return NextResponse.json({ error: 'Failed to respond to friend request' }, { status: 500 });
  }
}

// DELETE /api/friends?userId=targetId — unfriend or cancel pending request
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('userId');
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const deleted = await db.delete(friendships).where(
      or(
        and(eq(friendships.requester_id, userId), eq(friendships.recipient_id, targetId)),
        and(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, userId))
      )
    ).returning({ id: friendships.id });

    // Clear any pending "sent you a friend request" notification tied to this friendship
    for (const f of deleted) {
      await db.delete(notifications).where(
        and(
          eq(notifications.type, 'friend_request'),
          sql`${notifications.metadata}->>'friendship_id' = ${String(f.id)}`
        )
      ).catch(() => {});
    }

    return NextResponse.json({ message: 'Unfriended' });
  } catch (error) {
    console.error('Error unfriending:', error);
    return NextResponse.json({ error: 'Failed to unfriend' }, { status: 500 });
  }
}
