import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, userProfiles, parks } from '@/lib/db/schema';
import { Card } from '@/components/ui/card';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 25;

export default async function AdminPostsPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      created_at: posts.created_at,
      username: userProfiles.username,
      display_name: userProfiles.display_name,
      park_name: parks.name,
    })
    .from(posts)
    .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(parks, eq(posts.park_code, parks.park_code))
    .orderBy(desc(posts.created_at))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Posts</h1>
        <p className="mt-1 text-sm text-ink-mute">Most recent first.</p>
      </div>

      <Card className="border-hairline p-0 shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-bold uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Caption</th>
              <th className="px-4 py-3">Park</th>
              <th className="px-4 py-3">Posted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map(p => (
              <tr key={p.id} className="border-b border-hairline-soft last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">
                  {p.username ? `@${p.username}` : p.display_name ?? '—'}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-ink-soft">{p.caption ?? <span className="text-ink-mute">—</span>}</td>
                <td className="px-4 py-3 text-ink-soft">{p.park_name ?? '—'}</td>
                <td className="px-4 py-3 text-ink-soft">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <Link href={`/p/${p.id}`} target="_blank" className="text-xs font-semibold text-primary hover:underline">View →</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-mute">No posts found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Pagination page={page} hasMore={hasMore} basePath="/admin/posts" />
    </div>
  );
}
