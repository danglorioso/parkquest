import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

const PAGE_SIZE = 25;

interface DbRow {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  created_at: string;
  parks_visited: number;
  post_count: number;
  last_active: string | null;
}

type SortKey = 'joined' | 'parks' | 'posts';

async function getRows(page: number, activeWindow: number | null, sort: SortKey): Promise<DbRow[]> {
  const offset = (page - 1) * PAGE_SIZE;

  if (activeWindow) {
    const rows = await db.execute(sql`
      SELECT
        up.clerk_user_id, up.username, up.display_name, up.created_at,
        (SELECT COUNT(*)::int FROM visits v WHERE v.clerk_user_id = up.clerk_user_id AND v.visited_date IS NOT NULL AND v.is_bucket_list = false) AS parks_visited,
        (SELECT COUNT(*)::int FROM posts p WHERE p.clerk_user_id = up.clerk_user_id) AS post_count,
        last_activity.last_active
      FROM user_profiles up
      JOIN (
        SELECT user_id, MAX(created_at) AS last_active FROM (
          SELECT clerk_user_id AS user_id, created_at FROM posts WHERE created_at > NOW() - (${activeWindow} || ' days')::interval
          UNION ALL SELECT clerk_user_id, created_at FROM visits WHERE created_at > NOW() - (${activeWindow} || ' days')::interval
          UNION ALL SELECT user_id, created_at FROM likes WHERE created_at > NOW() - (${activeWindow} || ' days')::interval
          UNION ALL SELECT user_id, created_at FROM comments WHERE created_at > NOW() - (${activeWindow} || ' days')::interval
        ) t GROUP BY user_id
      ) last_activity ON last_activity.user_id = up.clerk_user_id
      ORDER BY last_activity.last_active DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    `);
    return rows.rows as unknown as DbRow[];
  }

  // Output-column aliases are valid ORDER BY targets in Postgres; created_at
  // (date joined) is the default. Ties broken by created_at so count sorts
  // stay stable page to page.
  const orderBy =
    sort === 'parks' ? sql.raw('parks_visited DESC, up.created_at DESC') :
    sort === 'posts' ? sql.raw('post_count DESC, up.created_at DESC') :
    sql.raw('up.created_at DESC');

  const rows = await db.execute(sql`
    SELECT
      up.clerk_user_id, up.username, up.display_name, up.created_at,
      (SELECT COUNT(*)::int FROM visits v WHERE v.clerk_user_id = up.clerk_user_id AND v.visited_date IS NOT NULL AND v.is_bucket_list = false) AS parks_visited,
      (SELECT COUNT(*)::int FROM posts p WHERE p.clerk_user_id = up.clerk_user_id) AS post_count,
      NULL AS last_active
    FROM user_profiles up
    ORDER BY ${orderBy}
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `);
  return rows.rows as unknown as DbRow[];
}

function loginMethod(externalAccounts: { provider: string }[]): 'apple' | 'google' | 'email' {
  const providers = externalAccounts.map(a => a.provider.toLowerCase());
  if (providers.some(p => p.includes('apple'))) return 'apple';
  if (providers.some(p => p.includes('google'))) return 'google';
  return 'email';
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const activeParam = searchParams.get('active');
  const activeWindow = activeParam ? Number(activeParam) : null;
  const sortParam = searchParams.get('sort');
  const sort: SortKey = sortParam === 'parks' || sortParam === 'posts' ? sortParam : 'joined';

  const rows = await getRows(page, activeWindow, sort);
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  let clerkById = new Map<string, { email: string | null; login_method: string; banned: boolean; last_signed_in_at: string | null }>();
  if (pageRows.length > 0) {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: pageRows.map(r => r.clerk_user_id), limit: pageRows.length });
    clerkById = new Map(data.map(u => [
      u.id,
      {
        email: u.primaryEmailAddress?.emailAddress ?? null,
        login_method: loginMethod(u.externalAccounts),
        banned: u.banned,
        last_signed_in_at: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
      },
    ]));
  }

  const users = pageRows.map(r => ({
    ...r,
    email: clerkById.get(r.clerk_user_id)?.email ?? null,
    login_method: clerkById.get(r.clerk_user_id)?.login_method ?? 'email',
    banned: clerkById.get(r.clerk_user_id)?.banned ?? false,
    last_signed_in_at: clerkById.get(r.clerk_user_id)?.last_signed_in_at ?? null,
    // No Clerk record for this profile row = the account was deleted (there's
    // no user.deleted webhook, so the DB row outlives the account). Surfaced
    // instead of hidden so the dashboard can gray these out.
    deleted: !clerkById.has(r.clerk_user_id),
  }));

  return NextResponse.json({ users, page, has_more: hasMore });
}
