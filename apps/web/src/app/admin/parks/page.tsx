import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import StampGlyphManager from './StampGlyphManager';
import SyncParksPanel from './SyncParksPanel';

interface ParkRow {
  park_code: string;
  name: string;
  visit_count: number;
  post_count: number;
  avg_rating: string | null;
  avg_crowd: string | null;
  avg_difficulty: string | null;
  pct_would_return: string | null;
}

const COLUMNS: { key: string; label: string }[] = [
  { key: 'name', label: 'Park' },
  { key: 'visit_count', label: 'Visits' },
  { key: 'post_count', label: 'Posts' },
  { key: 'avg_rating', label: 'Avg rating' },
  { key: 'avg_crowd', label: 'Avg crowd' },
  { key: 'avg_difficulty', label: 'Avg difficulty' },
  { key: 'pct_would_return', label: '% would return' },
];

async function getParks(sort: string, dir: string) {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  const res = await fetch(`${proto}://${host}/api/admin/parks?sort=${sort}&dir=${dir}`, {
    headers: { cookie: h.get('cookie') ?? '' },
    cache: 'no-store',
  });
  return res.json() as Promise<{ parks: ParkRow[]; sort: string; dir: string }>;
}

export default async function AdminParksPage({
  searchParams,
}: { searchParams: Promise<{ sort?: string; dir?: string }> }) {
  const params = await searchParams;
  const sort = params.sort ?? 'visit_count';
  const dir = params.dir === 'asc' ? 'asc' : 'desc';

  const { parks } = await getParks(sort, dir);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Parks</h1>
        <p className="mt-1 text-sm text-ink-mute">Click a column to sort. Averages exclude parks with no logged visits.</p>
      </div>

      <SyncParksPanel />
      <StampGlyphManager />

      <Card className="border-hairline p-0 shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-bold uppercase tracking-wide text-ink-mute">
                {COLUMNS.map(col => {
                  const nextDir = sort === col.key && dir === 'desc' ? 'asc' : 'desc';
                  const isActive = sort === col.key;
                  return (
                    <th key={col.key} className="px-4 py-3">
                      <Link href={`/admin/parks?sort=${col.key}&dir=${nextDir}`} className="inline-flex items-center gap-1 hover:text-ink">
                        {col.label}
                        {isActive && (dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {parks.map(p => (
                <tr key={p.park_code} className="border-b border-hairline-soft last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.visit_count}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.post_count}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.avg_rating ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.avg_crowd ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.avg_difficulty ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.pct_would_return != null ? `${p.pct_would_return}%` : '—'}</td>
                </tr>
              ))}
              {parks.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-mute">No parks found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
