import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, userProfiles, parks } from '@/lib/db/schema';
import { Card } from '@/components/ui/card';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 25;

export default async function AdminVisitsPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: visits.id,
      visited_date: visits.visited_date,
      rating: visits.rating,
      visibility: visits.visibility,
      is_bucket_list: visits.is_bucket_list,
      username: userProfiles.username,
      display_name: userProfiles.display_name,
      park_name: parks.name,
    })
    .from(visits)
    .leftJoin(userProfiles, eq(visits.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(parks, eq(visits.park_code, parks.park_code))
    .orderBy(desc(visits.created_at))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Visits</h1>
        <p className="mt-1 text-sm text-ink-mute">Most recent first.</p>
      </div>

      <Card className="border-hairline p-0 shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-bold uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Park</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {items.map(v => (
              <tr key={v.id} className="border-b border-hairline-soft last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">
                  {v.username ? `@${v.username}` : v.display_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-ink-soft">{v.park_name ?? '—'}</td>
                <td className="px-4 py-3 text-ink-soft">{v.is_bucket_list ? 'Bucket list' : 'Visit'}</td>
                <td className="px-4 py-3 text-ink-soft">{v.visited_date ? new Date(v.visited_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-ink-soft">{v.rating ?? '—'}</td>
                <td className="px-4 py-3 text-ink-soft capitalize">{v.visibility}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-mute">No visits found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Pagination page={page} hasMore={hasMore} basePath="/admin/visits" />
    </div>
  );
}
