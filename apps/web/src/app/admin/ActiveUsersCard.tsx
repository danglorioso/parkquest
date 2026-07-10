'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';

const WINDOWS = [
  { key: 'today', label: 'Today', active: 1 },
  { key: '7d', label: '7d', active: 7 },
  { key: '30d', label: '30d', active: 30 },
] as const;

export function ActiveUsersCard({
  today, d7, d30,
}: { today: number; d7: number; d30: number }) {
  const [windowKey, setWindowKey] = useState<(typeof WINDOWS)[number]['key']>('7d');
  const values = { today, '7d': d7, '30d': d30 };

  return (
    <Card className="flex-row items-center gap-3 border-hairline p-3 shadow-[var(--shadow-card)]">
      <span className="shrink-0 rounded-md bg-surface-alt p-2 text-primary">
        <Activity size={15} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xl font-extrabold leading-tight tracking-tight text-ink">{values[windowKey].toLocaleString()}</div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute">Active</span>
          <div className="flex gap-0.5 rounded-md bg-surface-alt p-0.5">
            {WINDOWS.map(w => (
              <button
                key={w.key}
                onClick={() => setWindowKey(w.key)}
                className={`rounded px-1 py-0.5 text-[9.5px] font-bold ${
                  windowKey === w.key ? 'bg-primary text-primary-foreground' : 'text-ink-mute'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
