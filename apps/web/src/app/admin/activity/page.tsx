import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 40;

type ActivityRow = {
  type: string;
  created_at: string;
  detail: string;
  actor_username: string | null;
  actor_display_name: string | null;
  target_username: string | null;
  target_display_name: string | null;
  park_name: string | null;
  badge_name: string | null;
  badge_emoji: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  visit: 'Visit',
  post: 'Post',
  like: 'Like',
  comment: 'Comment',
  badge_earned: 'Badge',
  notification: 'Notification',
  friendship: 'Friendship',
  report: 'Report',
};

function actorLabel(username: string | null, displayName: string | null) {
  return username ? `@${username}` : displayName ?? 'Unknown user';
}

const SORT_COLUMNS = ['type', 'actor', 'park', 'when'] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];
const DEFAULT_SORT: SortColumn = 'when';

function isSortColumn(v: string | undefined): v is SortColumn {
  return !!v && (SORT_COLUMNS as readonly string[]).includes(v);
}

const SORT_EXPR: Record<SortColumn, ReturnType<typeof sql>> = {
  type: sql`e.type`,
  actor: sql`COALESCE(au.username, au.display_name, '')`,
  park: sql`COALESCE(p.name, '')`,
  when: sql`e.created_at`,
};

function SortHeader({
  col, label, sort, dir,
}: { col: SortColumn; label: string; sort: SortColumn; dir: 'asc' | 'desc' }) {
  const active = sort === col;
  // Clicking an already-active column flips direction; switching columns
  // starts descending (matches "most recent / most of" as the useful default).
  const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="px-4 py-3">
      <Link
        href={`/admin/activity?sort=${col}&dir=${nextDir}&page=1`}
        className={`flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label} <Icon size={12} />
      </Link>
    </th>
  );
}

export default async function AdminActivityPage({
  searchParams,
}: { searchParams: Promise<{ page?: string; sort?: string; dir?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const sort: SortColumn = isSortColumn(params.sort) ? params.sort : DEFAULT_SORT;
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc';
  const dirSql = dir === 'asc' ? sql`ASC` : sql`DESC`;
  const orderExpr = SORT_EXPR[sort];

  // Every mutating action (visit, post, like, comment, badge earned,
  // notification, friend request, report) has its own table with no shared
  // audit log — union them into one timeline ordered by created_at, rather
  // than adding a new audit table just for this view.
  const result = await db.execute(sql`
    WITH events AS (
      SELECT 'visit' AS type, v.created_at AS created_at, v.clerk_user_id AS actor_id,
        NULL::varchar AS target_id, v.park_code AS park_code, NULL::varchar AS badge_id,
        CASE WHEN v.is_bucket_list THEN 'added park to bucket list' ELSE 'logged a visit' END AS detail
      FROM visits v

      UNION ALL
      SELECT 'post', po.created_at, po.clerk_user_id, NULL, po.park_code, NULL,
        CASE
          WHEN po.badge_id IS NOT NULL THEN 'shared a badge post'
          WHEN po.quoted_post_id IS NOT NULL THEN 'reposted a post'
          WHEN po.caption IS NOT NULL AND po.caption <> '' THEN 'posted: "' || LEFT(po.caption, 60) || '"'
          ELSE 'created a post'
        END
      FROM posts po

      UNION ALL
      SELECT 'like', l.created_at, l.user_id, po.clerk_user_id, po.park_code, NULL, 'liked a post'
      FROM likes l JOIN posts po ON l.post_id = po.id

      UNION ALL
      SELECT 'comment', c.created_at, c.user_id, po.clerk_user_id, po.park_code, NULL,
        'commented: "' || LEFT(c.content, 60) || '"'
      FROM comments c JOIN posts po ON c.post_id = po.id

      UNION ALL
      SELECT 'badge_earned', ub.earned_at, ub.clerk_user_id, NULL, NULL, ub.badge_id, 'earned a badge'
      FROM user_badges ub

      UNION ALL
      SELECT 'notification', n.created_at, n.actor_id, n.recipient_id, n.park_code, NULL,
        n.type || COALESCE(' — ' || (n.metadata->>'message'), '')
      FROM notifications n

      UNION ALL
      SELECT 'friendship', f.created_at, f.requester_id, f.recipient_id, NULL, NULL,
        'friend request ' || f.status
      FROM friendships f

      UNION ALL
      SELECT 'report', r.created_at, r.reporter_id, NULL, NULL, NULL,
        'reported ' || r.target_type || ' (' || r.reason || ') — ' || r.status
      FROM reports r
    )
    SELECT
      e.type AS type, e.created_at AS created_at, e.detail AS detail,
      au.username AS actor_username, au.display_name AS actor_display_name,
      tu.username AS target_username, tu.display_name AS target_display_name,
      p.name AS park_name, cb.name AS badge_name, cb.emoji AS badge_emoji
    FROM events e
    LEFT JOIN user_profiles au ON au.clerk_user_id = e.actor_id
    LEFT JOIN user_profiles tu ON tu.clerk_user_id = e.target_id
    LEFT JOIN parks p ON p.park_code = e.park_code
    LEFT JOIN custom_badges cb ON cb.badge_id = e.badge_id
    ORDER BY ${orderExpr} ${dirSql}, e.created_at DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `);

  const rows = result.rows as unknown as ActivityRow[];
  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Activity</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Every visit, post, like, comment, badge earned, notification, friend request, and report — most recent first.
        </p>
      </div>

      <Card className="border-hairline p-0 shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-bold uppercase tracking-wide text-ink-mute">
              <SortHeader col="type" label="Type" sort={sort} dir={dir} />
              <SortHeader col="actor" label="Actor" sort={sort} dir={dir} />
              <th className="px-4 py-3">Detail</th>
              <SortHeader col="park" label="Park" sort={sort} dir={dir} />
              <SortHeader col="when" label="When" sort={sort} dir={dir} />
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i} className="border-b border-hairline-soft last:border-0">
                <td className="px-4 py-3">
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-semibold text-ink-soft">
                    {TYPE_LABEL[r.type] ?? r.type}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-ink">
                  {actorLabel(r.actor_username, r.actor_display_name)}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {r.badge_name ? `${r.badge_emoji ?? ''} ${r.detail} — ${r.badge_name}` : r.detail}
                  {r.type === 'friendship' || r.type === 'notification'
                    ? ` → ${actorLabel(r.target_username, r.target_display_name)}`
                    : ''}
                </td>
                <td className="px-4 py-3 text-ink-soft">{r.park_name ?? '—'}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-mute">No activity found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Pagination
        page={page}
        hasMore={hasMore}
        basePath="/admin/activity"
        extraParams={`&sort=${sort}&dir=${dir}`}
      />
    </div>
  );
}
