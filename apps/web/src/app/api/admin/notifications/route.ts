import { NextResponse } from 'next/server';
import { sql, SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import { sendPushToUsers } from '@/lib/push';

const MESSAGE_MAX_LEN = 300;
const TITLE_MAX_LEN = 80;
const INSERT_CHUNK_SIZE = 500;

type Filter =
  | { type: 'min_visits'; value: number }
  | { type: 'visited_park'; park_code: string };

function isFilter(f: unknown): f is Filter {
  if (!f || typeof f !== 'object') return false;
  const r = f as Record<string, unknown>;
  if (r.type === 'min_visits') return typeof r.value === 'number' && r.value > 0;
  if (r.type === 'visited_park') return typeof r.park_code === 'string' && r.park_code.length > 0;
  return false;
}

// A visited park (not a bucket-list entry) counts toward both filter types.
function filterCondition(f: Filter): SQL {
  if (f.type === 'min_visits') {
    return sql`(SELECT COUNT(*) FROM visits v WHERE v.clerk_user_id = up.clerk_user_id AND v.visited_date IS NOT NULL AND v.is_bucket_list = false) >= ${Math.floor(f.value)}`;
  }
  return sql`EXISTS (SELECT 1 FROM visits v WHERE v.clerk_user_id = up.clerk_user_id AND v.park_code = ${f.park_code} AND v.visited_date IS NOT NULL AND v.is_bucket_list = false)`;
}

interface Recipient {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const PREVIEW_LIMIT = 60;

async function getRecipients(audience: 'all' | 'segment', filters: Filter[]): Promise<Recipient[]> {
  if (audience === 'all') {
    const rows = await db.execute(sql`SELECT clerk_user_id, username, display_name, avatar_url FROM user_profiles`);
    return rows.rows as unknown as Recipient[];
  }
  if (filters.length === 0) return [];
  const conditions = sql.join(filters.map(filterCondition), sql` AND `);
  const rows = await db.execute(sql`SELECT up.clerk_user_id, up.username, up.display_name, up.avatar_url FROM user_profiles up WHERE ${conditions}`);
  return rows.rows as unknown as Recipient[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'ParkQuest';
  const audience = body.audience === 'segment' ? 'segment' : 'all';
  const audienceLabel = typeof body.audience_label === 'string' && body.audience_label.trim()
    ? body.audience_label.trim().slice(0, 120)
    : (audience === 'all' ? 'All users' : 'Segment');
  const filters: Filter[] = Array.isArray(body.filters) ? body.filters.filter(isFilter) : [];
  const dryRun = body.dry_run === true;

  // A message is only required to actually send — previewing who a segment
  // matches shouldn't be gated behind having written the copy yet.
  if (!dryRun && !message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > MESSAGE_MAX_LEN) {
    return NextResponse.json({ error: `Message must be ${MESSAGE_MAX_LEN} characters or fewer` }, { status: 400 });
  }
  if (title.length > TITLE_MAX_LEN) {
    return NextResponse.json({ error: `Title must be ${TITLE_MAX_LEN} characters or fewer` }, { status: 400 });
  }
  if (audience === 'segment' && filters.length === 0) {
    return NextResponse.json({ error: 'Add at least one segment filter' }, { status: 400 });
  }

  const recipients = await getRecipients(audience, filters);
  const recipientIds = recipients.map(r => r.clerk_user_id);

  if (dryRun) {
    return NextResponse.json({
      recipient_count: recipients.length,
      preview: recipients.slice(0, PREVIEW_LIMIT),
    });
  }
  if (recipientIds.length === 0) {
    return NextResponse.json({ recipient_count: 0, sent: true });
  }

  for (const batch of chunk(recipientIds, INSERT_CHUNK_SIZE)) {
    await db.insert(notifications).values(
      batch.map(recipientId => ({
        recipient_id: recipientId,
        actor_id: null,
        type: 'system' as const,
        metadata: { message, title, audience_label: audienceLabel },
      }))
    ).catch(() => {});
  }

  await sendPushToUsers(recipientIds, { title, body: message }).catch(() => {});

  return NextResponse.json({ recipient_count: recipientIds.length, sent: true });
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const rows = await db.execute(sql`
    SELECT
      metadata->>'message' AS message,
      metadata->>'title' AS title,
      metadata->>'audience_label' AS audience_label,
      MIN(created_at) AS sent_at,
      COUNT(*)::int AS recipient_count
    FROM notifications
    WHERE type = 'system' AND actor_id IS NULL
    GROUP BY metadata->>'message', metadata->>'title', metadata->>'audience_label', date_trunc('minute', created_at)
    ORDER BY sent_at DESC
    LIMIT 20
  `);

  return NextResponse.json({
    broadcasts: rows.rows as { message: string; title: string | null; audience_label: string | null; sent_at: string; recipient_count: number }[],
  });
}
