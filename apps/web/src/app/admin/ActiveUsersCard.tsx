'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';

const WINDOWS = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
] as const;

export function ActiveUsersCard({
  h1, h24, d7, d30,
}: { h1: number; h24: number; d7: number; d30: number }) {
  const [windowKey, setWindowKey] = useState<(typeof WINDOWS)[number]['key']>('1h');
  const values = { '1h': h1, '24h': h24, '7d': d7, '30d': d30 };

  return (
    <Card className="items-start gap-2 border-hairline p-3.5 shadow-[var(--shadow-card)]">
      <span className="shrink-0 rounded-md bg-surface-alt p-2 text-primary">
        <Activity size={15} strokeWidth={2.25} />
      </span>
      <div className="text-xl font-extrabold leading-tight tracking-tight text-ink">{values[windowKey].toLocaleString()}</div>
      <div className="flex w-full flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-ink-mute">Active</span>
        <div className="flex w-full gap-0.5 rounded-md bg-surface-alt p-0.5">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              className={`flex-1 rounded px-1 py-1 text-[10px] font-bold ${
                windowKey === w.key ? 'bg-primary text-primary-foreground' : 'text-ink-mute'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
