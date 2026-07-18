import Link from 'next/link';
import { headers } from 'next/headers';
import { Apple, Chrome, Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Pagination } from '../Pagination';
import { BanButton } from './BanButton';

interface UserRow {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  created_at: string;
  parks_visited: number;
  post_count: number;
  last_active: string | null;
  last_signed_in_at: string | null;
  email: string | null;
  login_method: 'apple' | 'google' | 'email';
  banned: boolean;
  deleted: boolean;
}

const LOGIN_ICON = { apple: Apple, google: Chrome, email: Mail } as const;

async function getUsers(page: number, activeWindow: number | null) {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  const qs = new URLSearchParams({ page: String(page) });
  if (activeWindow) qs.set('active', String(activeWindow));
  const res = await fetch(`${proto}://${host}/api/admin/users?${qs}`, {
    headers: { cookie: h.get('cookie') ?? '' },
    cache: 'no-store',
  });
  return res.json() as Promise<{ users: UserRow[]; has_more: boolean }>;
}

export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ page?: string; active?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const activeWindow = params.active ? Number(params.active) : null;

  const { users, has_more: hasMore } = await getUsers(page, activeWindow);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          Users {activeWindow ? `— active in last ${activeWindow === 1 ? 'day' : `${activeWindow}d`}` : ''}
        </h1>
        <p className="mt-1 text-sm text-ink-mute">
          {activeWindow ? (
            <>
              <Link href="/admin/users" className="font-semibold text-primary hover:underline">All users</Link>
              {' · '}
              <Link href="/admin/users?active=1" className={activeWindow === 1 ? 'font-semibold text-primary' : 'hover:underline'}>Today</Link>
              {' · '}
              <Link href="/admin/users?active=7" className={activeWindow === 7 ? 'font-semibold text-primary' : 'hover:underline'}>7d</Link>
              {' · '}
              <Link href="/admin/users?active=30" className={activeWindow === 30 ? 'font-semibold text-primary' : 'hover:underline'}>30d</Link>
            </>
          ) : (
            <>
              All users, most recent first ·{' '}
              <Link href="/admin/users?active=1" className="font-semibold text-primary hover:underline">Today</Link>
              {' · '}
              <Link href="/admin/users?active=7" className="font-semibold text-primary hover:underline">7d</Link>
              {' · '}
              <Link href="/admin/users?active=30" className="font-semibold text-primary hover:underline">30d</Link>
            </>
          )}
        </p>
      </div>

      <Card className="border-hairline p-0 shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-bold uppercase tracking-wide text-ink-mute">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Parks</th>
                <th className="px-4 py-3">Posts</th>
                <th className="px-4 py-3">Last login</th>
                {activeWindow && <th className="px-4 py-3">Last active</th>}
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const LoginIcon = LOGIN_ICON[u.login_method];
                return (
                  <tr key={u.clerk_user_id} className={`border-b border-hairline-soft last:border-0 ${u.deleted ? 'opacity-45' : ''}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/u/${u.username}`}
                        className={`font-semibold text-ink hover:text-primary ${u.deleted ? 'line-through' : ''}`}
                        target="_blank"
                      >
                        {u.display_name ?? u.username}
                      </Link>
                      <div className="text-xs text-ink-mute">@{u.username}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      <div className="max-w-[160px] overflow-x-auto whitespace-nowrap">{u.email ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-ink-soft">
                        <LoginIcon size={13} /> <span className="capitalize">{u.login_method}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-ink-soft">{u.parks_visited}</td>
                    <td className="px-4 py-3 text-ink-soft">{u.post_count}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {u.last_signed_in_at ? new Date(u.last_signed_in_at).toLocaleString() : '—'}
                    </td>
                    {activeWindow && (
                      <td className="px-4 py-3 text-ink-soft">
                        {u.last_active ? new Date(u.last_active).toLocaleString() : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {u.deleted ? (
                        <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-bold text-ink-mute">Deleted</span>
                      ) : u.banned ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">Banned</span>
                      ) : (
                        <span className="text-xs text-ink-mute">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* No Clerk user left to ban */}
                      {!u.deleted && <BanButton userId={u.clerk_user_id} banned={u.banned} />}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={activeWindow ? 10 : 9} className="px-4 py-8 text-center text-ink-mute">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
