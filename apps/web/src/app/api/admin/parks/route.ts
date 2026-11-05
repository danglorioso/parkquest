import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { createParkLogged, evaluateParkWrite, loadParkSnapshot, parseParkInput, revalidateParkData, snapshotOf } from '@/lib/parkAdmin';
import { missingAcks } from '@/lib/parkGuards';

const SORT_COLUMNS = ['visit_count', 'post_count', 'avg_rating', 'avg_crowd', 'avg_difficulty', 'pct_would_return', 'name'] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const sortParam = searchParams.get('sort');
  const sort: SortColumn = (SORT_COLUMNS as readonly string[]).includes(sortParam ?? '')
    ? (sortParam as SortColumn)
    : 'visit_count';
  const dir = searchParams.get('dir') === 'asc' ? sql`ASC` : sql`DESC`;

  const orderColumn = sql.raw(sort);

  const rows = await db.execute(sql`
    SELECT
      p.park_code, p.name, p.states, p.stamp_glyph, p.designation, p.is_national_park,
      COUNT(v.id)::int AS visit_count,
      COUNT(DISTINCT po.id)::int AS post_count,
      ROUND(AVG(v.rating)::numeric, 2) AS avg_rating,
      ROUND(AVG(v.crowd)::numeric, 2) AS avg_crowd,
      ROUND(AVG(v.difficulty)::numeric, 2) AS avg_difficulty,
      ROUND(100.0 * COUNT(*) FILTER (WHERE v.would_return = 'yes') / NULLIF(COUNT(v.would_return), 0), 1) AS pct_would_return
    FROM parks p
    LEFT JOIN visits v ON v.park_code = p.park_code AND v.visited_date IS NOT NULL AND v.is_bucket_list = false
    LEFT JOIN posts po ON po.park_code = p.park_code
    GROUP BY p.park_code, p.name, p.states, p.stamp_glyph, p.designation, p.is_national_park
    ORDER BY ${orderColumn} ${dir} NULLS LAST
    LIMIT 500
  `);

  return NextResponse.json({ parks: rows.rows, sort, dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc' });
}

// POST — add a brand-new park (a newly established NPS unit). Takes the full
// form from the admin Add park panel plus its acknowledgments (ParkWriteAcks);
// see parseParkInput and lib/parkGuards.ts for the rules.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = parseParkInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { park_code } = parsed.value;

  const exists = `A park with code "${park_code}" already exists — use Edit park instead`;
  if (await loadParkSnapshot(park_code)) return NextResponse.json({ error: exists }, { status: 409 });

  const guards = await evaluateParkWrite(park_code, snapshotOf(parsed.value), null);
  const missing = missingAcks(park_code, guards, body ?? {});
  if (missing.length > 0) {
    return NextResponse.json({ error: missing.join(' '), code: 'needs_confirmation', guards }, { status: 409 });
  }

  const result = await createParkLogged(parsed.value, admin.id);
  if (!result.ok) return NextResponse.json({ error: exists }, { status: 409 });

  revalidateParkData(park_code);
  return NextResponse.json({ park_code, change_id: result.changeId }, { status: 201 });
}
