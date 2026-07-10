import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 25;

interface UserRow {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  created_at: string;
  parks_visited: number;
  post_count: number;
  last_active: string | null;
}

async function getUsers(page: number, activeWindow: 7 | 30 | null) {
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
    return rows.rows as unknown as UserRow[];
  }

  const rows = await db.execute(sql`
    SELECT
      up.clerk_user_id, up.username, up.display_name, up.created_at,
      (SELECT COUNT(*)::int FROM visits v WHERE v.clerk_user_id = up.clerk_user_id AND v.visited_date IS NOT NULL AND v.is_bucket_list = false) AS parks_visited,
      (SELECT COUNT(*)::int FROM posts p WHERE p.clerk_user_id = up.clerk_user_id) AS post_count,
      NULL AS last_active
    FROM user_profiles up
    ORDER BY up.created_at DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `);
  return rows.rows as unknown as UserRow[];
}

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ page?: string; active?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const activeWindow = params.active === '7' ? 7 : params.active === '30' ? 30 : null;

  const rows = await getUsers(page, activeWindow);
  const hasMore = rows.length > PAGE_SIZE;
  const users = rows.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Users {activeWindow ? `— active in last ${activeWindow}d` : ''}
        </h1>
        <p className="mt-1 text-sm text-ink-mute">
          {activeWindow ? (
            <>
              <Link href="/admin/users" className="font-semibold text-primary hover:underline">All users</Link>
              {' · '}
              <Link href="/admin/users?active=7" className={activeWindow === 7 ? 'font-semibold text-primary' : 'hover:underline'}>7d</Link>
              {' · '}
              <Link href="/admin/users?active=30" className={activeWindow === 30 ? 'font-semibold text-primary' : 'hover:underline'}>30d</Link>
            </>
          ) : (
            <>
              All users, most recent first ·{' '}
              <Link href="/admin/users?active=7" className="font-semibold text-primary hover:underline">7d active</Link>
              {' · '}
              <Link href="/admin/users?active=30" className="font-semibold text-primary hover:underline">30d active</Link>
            </>
          )}
        </p>
      </div>

      <Card className="border-hairline p-0 shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-bold uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Parks</th>
              <th className="px-4 py-3">Posts</th>
              {activeWindow && <th className="px-4 py-3">Last active</th>}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.clerk_user_id} className="border-b border-hairline-soft last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/u/${u.username}`} className="font-semibold text-ink hover:text-primary" target="_blank">
                    {u.display_name ?? u.username}
                  </Link>
                  <div className="text-xs text-ink-mute">@{u.username}</div>
                </td>
                <td className="px-4 py-3 text-ink-soft">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink-soft">{u.parks_visited}</td>
                <td className="px-4 py-3 text-ink-soft">{u.post_count}</td>
                {activeWindow && (
                  <td className="px-4 py-3 text-ink-soft">
                    {u.last_active ? new Date(u.last_active).toLocaleString() : '—'}
                  </td>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-mute">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Pagination
        page={page}
        hasMore={hasMore}
        basePath="/admin/users"
        extraParams={activeWindow ? `&active=${activeWindow}` : ''}
      />
    </div>
  );
}
