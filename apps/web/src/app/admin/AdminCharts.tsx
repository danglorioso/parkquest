'use client';

import { useMemo, useState } from 'react';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

// ── Shared tooltip ──────────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  title: string;
  value: string;
}

function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs shadow-panel"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <div className="font-semibold text-ink">{tip.value}</div>
      <div className="text-ink-mute">{tip.title}</div>
    </div>
  );
}

// ── Signups bar chart ────────────────────────────────────────────────────────────

export function SignupsChart({ data }: { data: { day: string; count: number }[] }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="relative">
      <div className="flex h-28 items-end gap-[3px]">
        {data.map(d => (
          <div
            key={d.day}
            className="group flex-1"
            onMouseEnter={e => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const parent = (e.currentTarget as HTMLDivElement).closest('.relative')!.getBoundingClientRect();
              setTip({
                x: r.left - parent.left + r.width / 2,
                y: r.top - parent.top,
                title: new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                value: `${d.count} signup${d.count !== 1 ? 's' : ''}`,
              });
            }}
            onMouseLeave={() => setTip(null)}
          >
            <div
              className="rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-70"
              style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 6 : 2)}%`, minHeight: 2 }}
            />
          </div>
        ))}
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}

// ── Contribution heatmap ─────────────────────────────────────────────────────────

function bucketLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.8) return 4;
  return 5;
}

export function ContributionHeatmap({ data }: { data: { day: string; count: number }[] }) {
  const [tip, setTip] = useState<TooltipState | null>(null);

  const { weeks, max } = useMemo(() => {
    const byDay = new Map(data.map(d => [d.day, d.count]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Walk back to the most recent Sunday, then 52 more weeks before that.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - 53 * 7 + 1);

    const days: { date: Date; count: number }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      days.push({ date: new Date(d), count: byDay.get(key) ?? 0 });
    }
    const weeks: { date: Date; count: number }[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const max = Math.max(...data.map(d => d.count), 1);
    return { weeks, max };
  }, [data]);

  const monthLabels = useMemo(() => {
    const labels: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const month = week[0].date.getMonth();
      if (month !== lastMonth) {
        labels.push({ weekIndex: i, label: week[0].date.toLocaleDateString(undefined, { month: 'short' }) });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  return (
    // Tooltip lives in this outer wrapper (no overflow set) rather than the
    // scrollable inner div — `overflow-x-auto` forces the browser to treat
    // overflow-y as `auto` too, which clipped the tooltip whenever a hovered
    // cell sat in the top row.
    <div className="relative pt-1">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="mb-1 flex gap-[3px] pl-6" style={{ width: weeks.length * 13 }}>
            {weeks.map((_, i) => {
              const label = monthLabels.find(m => m.weekIndex === i);
              return (
                <div key={i} className="w-[10px] shrink-0 text-[10px] text-ink-mute">
                  {label?.label ?? ''}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] pr-1 text-[10px] text-ink-mute">
              <span className="h-[10px]" />
              <span className="h-[10px] leading-[10px]">Mon</span>
              <span className="h-[10px]" />
              <span className="h-[10px] leading-[10px]">Wed</span>
              <span className="h-[10px]" />
              <span className="h-[10px] leading-[10px]">Fri</span>
              <span className="h-[10px]" />
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => {
                  const level = bucketLevel(day.count, max);
                  return (
                    <div
                      key={di}
                      className="h-[10px] w-[10px] rounded-[2px]"
                      style={{ background: `var(--heat-${level})` }}
                      onMouseEnter={e => {
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const parent = (e.currentTarget as HTMLDivElement).closest('.relative')!.getBoundingClientRect();
                        setTip({
                          x: r.left - parent.left + r.width / 2,
                          y: r.top - parent.top,
                          title: day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                          value: `${day.count} active user${day.count !== 1 ? 's' : ''}`,
                        });
                      }}
                      onMouseLeave={() => setTip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5 pl-6 text-[10px] text-ink-mute">
            <span>Less</span>
            {[0, 1, 2, 3, 4, 5].map(level => (
              <div key={level} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: `var(--heat-${level})` }} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}

// ── Activity insights (day-of-week mix + streaks) — fills the dead space
// beside the heatmap on wide screens ──────────────────────────────────────────

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActivityInsights({ data }: { data: { day: string; count: number }[] }) {
  const stats = useMemo(() => {
    const byDay = new Map(data.map(d => [d.day, d.count]));
    const activeDates = data.filter(d => d.count > 0).map(d => d.day).sort();

    const totalActiveDays = activeDates.length;

    let longestStreak = 0;
    let currentRun = 0;
    let prev: Date | null = null;
    for (const key of activeDates) {
      const d = new Date(key);
      if (prev) {
        const gapDays = Math.round((d.getTime() - prev.getTime()) / 86_400_000);
        currentRun = gapDays === 1 ? currentRun + 1 : 1;
      } else {
        currentRun = 1;
      }
      longestStreak = Math.max(longestStreak, currentRun);
      prev = d;
    }

    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const [key, count] of byDay) dowTotals[new Date(key).getDay()] += count;

    return { totalActiveDays, longestStreak, dowTotals };
  }, [data]);

  const maxDow = Math.max(...stats.dowTotals, 1);

  return (
    <div className="flex w-full flex-col gap-5 md:w-56">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xl font-extrabold text-ink">{stats.longestStreak}</div>
          <div className="text-[11px] uppercase tracking-wide text-ink-mute">Longest streak</div>
        </div>
        <div>
          <div className="text-xl font-extrabold text-ink">{stats.totalActiveDays}</div>
          <div className="text-[11px] uppercase tracking-wide text-ink-mute">Active days</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-mute">By day of week</div>
        <div className="flex flex-col gap-1.5">
          {DOW_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-[11px] text-ink-mute">{label}</span>
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(stats.dowTotals[i] / maxDow) * 100}%`, background: 'var(--heat-4)' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reports status bar ───────────────────────────────────────────────────────────

export function ReportsStatusBar({ status }: { status: { open: number; actioned: number; dismissed: number } }) {
  const total = Math.max(status.open + status.actioned + status.dismissed, 1);
  const segments = [
    { key: 'open', count: status.open, color: 'var(--status-warning)', label: 'Open', Icon: Clock },
    { key: 'actioned', count: status.actioned, color: 'var(--status-good)', label: 'Actioned', Icon: CheckCircle2 },
    { key: 'dismissed', count: status.dismissed, color: 'var(--status-muted)', label: 'Dismissed', Icon: XCircle },
  ] as const;

  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {segments.map(s => (
          s.count > 0 && (
            <div key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
          )
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-sm">
            <s.Icon size={14} style={{ color: s.color }} />
            <span className="font-semibold text-ink">{s.count}</span>
            <span className="text-ink-mute">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hourly activity — multi-line, trailing 30 days ────────────────────────────────

interface HourlyPoint {
  hour: number;
  active_users: number;
  posts: number;
  likes: number;
  comments: number;
  visits: number;
}

const HOURLY_SERIES = [
  { key: 'active_users', label: 'Active users', color: 'var(--series-1)' },
  { key: 'posts', label: 'Posts', color: 'var(--series-2)' },
  { key: 'likes', label: 'Likes', color: 'var(--series-3)' },
  { key: 'comments', label: 'Comments', color: 'var(--series-4)' },
  { key: 'visits', label: 'Trips logged', color: 'var(--series-5)' },
] as const;

const CHART_W = 640;
const CHART_H = 200;
const PAD_L = 28;
const PAD_B = 20;

function hourLabel(h: number) {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function HourlyActivityChart({ data }: { data: HourlyPoint[] }) {
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const max = Math.max(
    ...data.flatMap(d => HOURLY_SERIES.map(s => d[s.key])),
    1,
  );

  const plotW = CHART_W - PAD_L;
  const plotH = CHART_H - PAD_B;
  const xFor = (hour: number) => PAD_L + (hour / 23) * plotW;
  const yFor = (value: number) => plotH - (value / max) * plotH;

  const lines = HOURLY_SERIES.map(s => ({
    ...s,
    path: data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(d.hour)} ${yFor(d[s.key])}`).join(' '),
  }));

  const hovered = hoverHour != null ? data.find(d => d.hour === hoverHour) : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ height: 'auto' }}>
        {/* Recessive gridlines */}
        {[0, 0.5, 1].map(t => (
          <line
            key={t}
            x1={PAD_L} x2={CHART_W} y1={plotH * (1 - t)} y2={plotH * (1 - t)}
            stroke="var(--hairline)" strokeWidth={1}
          />
        ))}
        {/* Y axis max label */}
        <text x={0} y={6} fontSize={9} fill="var(--ink-mute)">{max}</text>
        <text x={0} y={plotH + 4} fontSize={9} fill="var(--ink-mute)">0</text>

        {lines.map(s => (
          <path key={s.key} d={s.path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Hover focus line */}
        {hoverHour != null && (
          <line x1={xFor(hoverHour)} x2={xFor(hoverHour)} y1={0} y2={plotH} stroke="var(--ink-mute)" strokeWidth={1} strokeDasharray="2,2" />
        )}

        {/* X axis labels, every 3 hours */}
        {data.filter(d => d.hour % 3 === 0).map(d => (
          <text key={d.hour} x={xFor(d.hour)} y={CHART_H} fontSize={9} fill="var(--ink-mute)" textAnchor="middle">
            {hourLabel(d.hour)}
          </text>
        ))}

        {/* Invisible hover targets, one per hour */}
        {data.map((d, i) => {
          const left = i === 0 ? PAD_L : (xFor(d.hour) + xFor(data[i - 1].hour)) / 2;
          const right = i === data.length - 1 ? CHART_W : (xFor(d.hour) + xFor(data[i + 1].hour)) / 2;
          return (
            <rect
              key={d.hour}
              x={left} y={0} width={right - left} height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverHour(d.hour)}
              onMouseLeave={() => setHoverHour(null)}
            />
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-hairline bg-surface px-2.5 py-2 text-xs shadow-panel"
          style={{
            left: `${(xFor(hovered.hour) / CHART_W) * 100}%`,
            top: 0,
            transform: xFor(hovered.hour) / CHART_W > 0.75 ? 'translate(-100%, 0)' : xFor(hovered.hour) / CHART_W < 0.1 ? 'translate(0, 0)' : 'translate(-50%, 0)',
          }}
        >
          <div className="mb-1 font-semibold text-ink">{hourLabel(hovered.hour)}</div>
          {HOURLY_SERIES.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.label}: <span className="font-semibold text-ink">{hovered[s.key]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {HOURLY_SERIES.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-ink-mute">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top parks list ───────────────────────────────────────────────────────────────

export function TopParksList({ parks }: { parks: { park_code: string; name: string; visit_count: number }[] }) {
  const max = Math.max(...parks.map(p => p.visit_count), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {parks.map(p => (
        <div key={p.park_code} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm text-ink-soft">{p.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(p.visit_count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-semibold text-ink">{p.visit_count}</span>
        </div>
      ))}
    </div>
  );
}
