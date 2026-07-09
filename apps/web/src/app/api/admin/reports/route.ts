import { NextResponse } from 'next/server';
import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reports, userProfiles, posts, comments } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';

// GET /api/admin/reports?status=open — moderation queue
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'open';

  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.status, status))
    .orderBy(desc(reports.created_at))
    .limit(100);

  if (rows.length === 0) return NextResponse.json([]);

  const postIds = rows.filter(r => r.target_type === 'post').map(r => Number(r.target_id));
  const commentIds = rows.filter(r => r.target_type === 'comment').map(r => Number(r.target_id));

  const [postRows, commentRows] = await Promise.all([
    postIds.length > 0
      ? db.select({ id: posts.id, caption: posts.caption, clerk_user_id: posts.clerk_user_id })
          .from(posts).where(inArray(posts.id, postIds))
      : Promise.resolve([]),
    commentIds.length > 0
      ? db.select({ id: comments.id, content: comments.content, user_id: comments.user_id })
          .from(comments).where(inArray(comments.id, commentIds))
      : Promise.resolve([]),
  ]);
  const postMap = new Map(postRows.map(p => [p.id, p]));
  const commentMap = new Map(commentRows.map(c => [c.id, c]));

  // Every user id we'll need a username/display_name for, in one shot.
  const profileIds = new Set<string>();
  for (const r of rows) {
    profileIds.add(r.reporter_id);
    if (r.target_type === 'user') profileIds.add(r.target_id);
    if (r.target_type === 'post') { const p = postMap.get(Number(r.target_id)); if (p) profileIds.add(p.clerk_user_id); }
    if (r.target_type === 'comment') { const c = commentMap.get(Number(r.target_id)); if (c) profileIds.add(c.user_id); }
  }
  const profiles = profileIds.size > 0
    ? await db.select({
        clerk_user_id: userProfiles.clerk_user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
      }).from(userProfiles).where(inArray(userProfiles.clerk_user_id, [...profileIds]))
    : [];
  const profileMap = new Map(profiles.map(p => [p.clerk_user_id, p]));

  const enriched = rows.map(r => {
    let targetUserId: string | null = null;
    let target_content: string | null = null;
    if (r.target_type === 'user') targetUserId = r.target_id;
    else if (r.target_type === 'post') {
      const p = postMap.get(Number(r.target_id));
      target_content = p?.caption ?? null;
      targetUserId = p?.clerk_user_id ?? null;
    } else if (r.target_type === 'comment') {
      const c = commentMap.get(Number(r.target_id));
      target_content = c?.content ?? null;
      targetUserId = c?.user_id ?? null;
    }
    const targetProfile = targetUserId ? profileMap.get(targetUserId) : null;
    return {
      ...r,
      reporter_username: profileMap.get(r.reporter_id)?.username ?? null,
      target_user_id: targetUserId,
      target_username: targetProfile?.username ?? null,
      target_display_name: targetProfile?.display_name ?? null,
      target_content,
    };
  });

  return NextResponse.json(enriched);
}
