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
    <div className="relative overflow-x-auto">
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
      <ChartTooltip tip={tip} />
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
