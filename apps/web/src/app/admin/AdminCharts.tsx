'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

// ── Shared tooltip ──────────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  title: string;
  value: string;
}

// new Date('YYYY-MM-DD') parses as UTC midnight, which toLocaleDateString
// renders as the PREVIOUS day anywhere west of Greenwich — parse day keys
// as local time instead.
function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

// Left-hand scale for the CSS flex/height bar charts below — max at top,
// midpoint, 0 at the baseline. `heightClass` must match the bar area's own
// height class so the ticks line up with the bars beside them.
function YAxis({ max, heightClass }: { max: number; heightClass: string }) {
  return (
    <div className={`flex ${heightClass} w-5 shrink-0 flex-col justify-between text-right leading-none text-ink-mute`} style={{ fontSize: 8 }}>
      <span>{max}</span>
      <span>{Math.round(max / 2)}</span>
      <span>0</span>
    </div>
  );
}

// Light 0/mid/max reference lines behind a bar area, drawn as the
// container's own background rather than absolutely-positioned child divs —
// an element's background always paints before (behind) every descendant,
// content or positioned, so this can't lose a z-index/stacking-context fight.
function gridLinesStyle(positions: string, count = 3): React.CSSProperties {
  const line = 'linear-gradient(var(--hairline), var(--hairline))';
  return {
    backgroundImage: Array(count).fill(line).join(', '),
    backgroundSize: '100% 1px',
    backgroundPosition: positions,
    backgroundRepeat: 'no-repeat',
  };
}
const GRID_LINES_3 = gridLinesStyle('top, center, bottom');
// Sparkline's plot area is padded within its viewBox (max maps to 10% down,
// 0 to 80%), not flush with the box edges — matches its y-axis labels.
const GRID_LINES_2 = gridLinesStyle('0 10%, 0 80%', 2);

function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs shadow-panel"
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
      <div className="flex gap-2">
        <YAxis max={max} heightClass="h-28" />
        <div className="relative flex h-28 flex-1 items-end gap-[3px] border-l border-hairline pl-2" style={GRID_LINES_3}>
          {data.map(d => {
            const heightPct = Math.max((d.count / max) * 100, d.count > 0 ? 6 : 2);
            return (
              <div
                key={d.day}
                className="group flex h-full flex-1 items-end"
                onMouseEnter={e => {
                  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const parent = (e.currentTarget as HTMLDivElement).closest('.relative')!.getBoundingClientRect();
                  setTip({
                    x: r.left - parent.left + r.width / 2,
                    y: r.top - parent.top + r.height * (1 - heightPct / 100),
                    title: parseDay(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    value: `${d.count} signup${d.count !== 1 ? 's' : ''}`,
                  });
                }}
                onMouseLeave={() => setTip(null)}
              >
                <div
                  className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-70"
                  style={{ height: `${heightPct}%`, minHeight: 2 }}
                />
              </div>
            );
          })}
          <ChartTooltip tip={tip} />
        </div>
      </div>
    </div>
  );
}

// ── App Store downloads (units), trailing 30 days ────────────────────────────────

// `units: null` means Apple hasn't published that day yet (report lag, or
// the row simply doesn't exist) — distinct from a real 0-download day.
// Those slots render as an empty gap, not a fake zero-height bar.
export function AppStoreDownloadsChart({ data }: { data: { day: string; units: number | null }[] }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const known = data.map(d => d.units).filter((u): u is number => u != null);
  const max = Math.max(...known, 1);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <YAxis max={max} heightClass="h-28" />
        <div className="flex-1">
          <div className="relative flex h-28 items-end gap-[3px] border-l border-hairline pl-2" style={GRID_LINES_3}>
            {data.map(d => {
              const heightPct = d.units == null ? 0 : Math.max((d.units / max) * 100, d.units > 0 ? 6 : 2);
              return (
                <div
                  key={d.day}
                  className="group flex h-full flex-1 items-end"
                  onMouseEnter={e => {
                    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const parent = (e.currentTarget as HTMLDivElement).closest('.relative')!.getBoundingClientRect();
                    setTip({
                      x: r.left - parent.left + r.width / 2,
                      y: r.top - parent.top + r.height * (1 - heightPct / 100),
                      title: parseDay(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                      value: d.units == null ? 'No data yet' : `${d.units} unit${d.units !== 1 ? 's' : ''}`,
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  {d.units != null && (
                    <div
                      className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-70"
                      style={{ height: `${heightPct}%`, minHeight: 2 }}
                    />
                  )}
                </div>
              );
            })}
            <ChartTooltip tip={tip} />
          </div>
          <div className="mt-1.5 flex justify-between pl-2 text-[10px] text-ink-mute">
            <span>{parseDay(data[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Daily active users, trailing 30 days ─────────────────────────────────────────

export function DailyActiveUsersChart({ data }: { data: { day: string; count: number }[] }) {
  const [tip, setTip] = useState<TooltipState | null>(null);

  // `data` arrives zero-filled from SQL (30 Eastern-time days) — render it
  // as-is. Rebuilding day keys client-side is exactly how this chart broke
  // before (driver day-key format vs. locally-built keys never matching).
  const days = useMemo(
    () => data.map(d => ({ ...d, date: parseDay(d.day) })),
    [data],
  );

  const max = Math.max(...days.map(d => d.count), 1);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <YAxis max={max} heightClass="h-32" />
        <div className="flex-1">
          <div className="relative flex h-32 items-end gap-[3px] border-l border-hairline pl-2" style={GRID_LINES_3}>
            {days.map(d => {
              const heightPct = Math.max((d.count / max) * 100, d.count > 0 ? 6 : 2);
              return (
                <div
                  key={d.day}
                  className="group flex h-full flex-1 items-end"
                  onMouseEnter={e => {
                    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const parent = (e.currentTarget as HTMLDivElement).closest('.relative')!.getBoundingClientRect();
                    setTip({
                      x: r.left - parent.left + r.width / 2,
                      y: r.top - parent.top + r.height * (1 - heightPct / 100),
                      title: d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                      value: `${d.count} active user${d.count !== 1 ? 's' : ''}`,
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  <div
                    className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-70"
                    style={{ height: `${heightPct}%`, minHeight: 2 }}
                  />
                </div>
              );
            })}
            <ChartTooltip tip={tip} />
          </div>
          <div className="mt-1.5 flex justify-between pl-2 text-[10px] text-ink-mute">
            <span>{days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default scroll position is the left (oldest week) — jump to the right
  // so today's column is visible without the user having to scroll first.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

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
      <div ref={scrollRef} className="overflow-x-auto">
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
      const d = parseDay(key);
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
    for (const [key, count] of byDay) dowTotals[parseDay(key).getDay()] += count;

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

// ── App Store acquisition mini bar chart ─────────────────────────────────────────

// One 30-day metric (impressions, page views, downloads, conversion %) as a
// compact bar strip under its stat number — same zero-filled-series contract
// as the other daily charts: render exactly what SQL sent, never rebuild
// day keys client-side.
// `value: null` means this day hasn't been published by Apple yet — an
// empty gap, not a fake zero-height bar. Only a day Apple actually reported
// a real 0 for renders as a (minimum-height) zero bar.
// App Store Connect draws these as a line + soft area fill under the curve,
// not bars — mirrored here (in our own brand green, not Apple's blue, to
// stay consistent with every other chart on this dashboard) rather than
// reusing the bar sparkline the rest of the admin panel uses elsewhere.
export function AppStoreMetricChart({ data, unit }: {
  data: { day: string; value: number | null }[];
  unit?: string;
}) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const gradientId = useId();
  const known = data.map(d => d.value).filter((v): v is number => v != null);
  const max = Math.max(...known, 1);
  const n = data.length;

  // Gaps (report not published yet) simply break the line rather than
  // drawing a misleading drop to zero — x position still comes from the
  // point's real index in the full range, so a gap at the tail (the normal
  // case, Apple's ~48h lag) leaves the chart trailing off before the edge
  // instead of compressing the timeline.
  const points = data
    .map((d, i) => (d.value == null ? null : { day: d.day, x: n > 1 ? (i / (n - 1)) * 100 : 50, y: 32 - (d.value / max) * 28 }))
    .filter((p): p is { day: string; x: number; y: number } => p != null);
  const hoveredPoint = hoverDay != null ? points.find(p => p.day === hoverDay) : undefined;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length
    ? `M ${points[0].x} 36 ${points.map(p => `L ${p.x} ${p.y}`).join(' ')} L ${points[points.length - 1].x} 36 Z`
    : '';

  // Plot area is padded within the 0–40 viewBox (max maps to y=4, 0 maps to
  // y=32, not the box edges) — position the two labels at those same
  // fractional offsets rather than the box's literal top/bottom.
  const maxLabel = Number.isInteger(max) ? String(max) : max.toFixed(1);

  return (
    <div className="flex gap-1.5">
      <div className="relative h-16 w-5 shrink-0 text-right leading-none text-ink-mute" style={{ fontSize: 8 }}>
        <span className="absolute right-0 -translate-y-1/2" style={{ top: '10%' }}>{maxLabel}</span>
        <span className="absolute right-0 -translate-y-1/2" style={{ top: '80%' }}>0</span>
      </div>
      <div className="flex-1">
      <div className="relative h-16 border-l border-hairline pl-2" style={GRID_LINES_2}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {hoveredPoint && (
        // An SVG <circle> here would get squashed into an ellipse by the
        // viewBox's preserveAspectRatio="none" stretch — an HTML dot
        // positioned by percentage isn't subject to that distortion.
        <div
          className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]"
          style={{ left: `${hoveredPoint.x}%`, top: `${(hoveredPoint.y / 40) * 100}%`, background: 'var(--primary)', borderColor: 'var(--surface)' }}
        />
      )}
      <div className="absolute inset-0 flex">
        {data.map(d => (
          <div
            key={d.day}
            className="h-full flex-1"
            onMouseEnter={e => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const parent = (e.currentTarget as HTMLDivElement).closest('.relative')!.getBoundingClientRect();
              // Same fractional y as the dot/gridlines — no data point still
              // anchors near the baseline instead of snapping to the chart top.
              const yFrac = d.value == null ? 0.8 : (32 - (d.value / max) * 28) / 40;
              setHoverDay(d.day);
              setTip({
                x: r.left - parent.left + r.width / 2,
                y: yFrac * parent.height,
                title: parseDay(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                value: d.value == null ? 'No data yet' : `${d.value.toLocaleString()}${unit ?? ''}`,
              });
            }}
            onMouseLeave={() => { setHoverDay(null); setTip(null); }}
          />
        ))}
      </div>
      <ChartTooltip tip={tip} />
      </div>
      <div className="mt-1 flex justify-between pl-2 text-[9px] leading-none text-ink-mute">
        <span>{parseDay(data[0].day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>Today</span>
      </div>
      </div>
    </div>
  );
}

// ── Downloads by device donut ────────────────────────────────────────────────────

// Fixed categorical slot order (series-1..5), assigned to devices sorted by
// download count — never cycled. Anything past the 4th device folds into
// "Other" so the palette is never exhausted.
const DEVICE_SLOTS = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)',
];

function donutArcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const pt = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${pt(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, end)}`,
    `L ${pt(rInner, end)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, start)}`,
    'Z',
  ].join(' ');
}

export function DeviceDonutChart({ data }: { data: { device: string; downloads: number }[] }) {
  const [tip, setTip] = useState<TooltipState | null>(null);

  // `data` arrives sorted desc from SQL; fold the tail into "Other".
  const slices = useMemo(() => {
    const head = data.slice(0, 4);
    const tail = data.slice(4);
    const rows = tail.length
      ? [...head, { device: 'Other', downloads: tail.reduce((s, d) => s + d.downloads, 0) }]
      : head;
    const total = rows.reduce((s, d) => s + d.downloads, 0);
    let angle = 0;
    return rows.map((d, i) => {
      const sweep = (d.downloads / total) * Math.PI * 2;
      const slice = {
        ...d,
        color: DEVICE_SLOTS[i],
        pct: Math.round((d.downloads / total) * 100),
        start: angle,
        end: angle + sweep,
      };
      angle += sweep;
      return slice;
    });
  }, [data]);

  const R_OUT = 54;
  const R_IN = 34;
  // 2px surface gap between fills, expressed as half a pad-angle per edge.
  const pad = 2 / R_OUT / 2;

  const showTip = (e: React.MouseEvent, s: (typeof slices)[number]) => {
    const parent = (e.currentTarget as SVGElement).closest('.relative')!.getBoundingClientRect();
    setTip({
      x: e.clientX - parent.left,
      y: e.clientY - parent.top,
      title: s.device,
      value: `${s.downloads.toLocaleString()} download${s.downloads !== 1 ? 's' : ''} · ${s.pct}%`,
    });
  };

  return (
    <div className="relative flex items-center gap-6">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0">
        {slices.length === 1 ? (
          // A full 360° arc degenerates (start == end mod 2π) — draw a ring.
          <circle
            cx={60} cy={60} r={(R_OUT + R_IN) / 2}
            fill="none" stroke={slices[0].color} strokeWidth={R_OUT - R_IN}
            onMouseMove={e => showTip(e, slices[0])}
            onMouseLeave={() => setTip(null)}
          />
        ) : (
          slices.map(s => (
            <path
              key={s.device}
              d={donutArcPath(60, 60, R_OUT, R_IN, s.start + pad, Math.max(s.end - pad, s.start + pad))}
              fill={s.color}
              className="transition-opacity hover:opacity-70"
              onMouseMove={e => showTip(e, s)}
              onMouseLeave={() => setTip(null)}
            />
          ))
        )}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {slices.map(s => (
          <div key={s.device} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-ink-soft">{s.device}</span>
            <span className="ml-auto font-semibold text-ink">{s.downloads.toLocaleString()}</span>
            <span className="w-8 text-right text-ink-mute">{s.pct}%</span>
          </div>
        ))}
      </div>
      <ChartTooltip tip={tip} />
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
