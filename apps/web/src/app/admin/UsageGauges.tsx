'use client';

import { useEffect, useState } from 'react';
import { Database, HardDrive } from 'lucide-react';

interface Usage {
  database: { used_bytes: number; limit_bytes: number };
  storage: { used_bytes: number; limit_bytes: number; object_count: number };
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function gaugeColor(ratio: number) {
  if (ratio >= 0.9) return 'var(--destructive)';
  if (ratio >= 0.7) return 'var(--status-warning)';
  return 'var(--primary)';
}

function Gauge({
  icon: Icon, label, used, limit, detail,
}: { icon: React.ElementType; label: string; used: number; limit: number; detail?: string }) {
  const ratio = Math.min(used / limit, 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          <Icon size={14} className="shrink-0 text-ink-mute" />
          <span className="font-semibold text-ink">{label}</span>
          {detail && <span className="text-xs text-ink-mute">· {detail}</span>}
        </div>
        <span className="text-xs text-ink-mute">
          <span className="font-semibold text-ink">{formatBytes(used)}</span>
          {' '}of {formatBytes(limit)} · {(ratio * 100).toFixed(ratio < 0.01 ? 2 : 1)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(ratio * 100, 0.5)}%`, background: gaugeColor(ratio) }}
        />
      </div>
    </div>
  );
}

export function UsageGauges() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/admin/usage')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(setUsage)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-ink-mute">Couldn&apos;t load usage data.</p>;

  if (!usage) {
    return (
      <div className="flex flex-col gap-5">
        {[0, 1].map(i => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="h-4 w-40 animate-pulse rounded bg-surface-alt" />
            <div className="h-2 animate-pulse rounded-full bg-surface-alt" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Gauge
        icon={Database}
        label="Database"
        detail="Neon free plan"
        used={usage.database.used_bytes}
        limit={usage.database.limit_bytes}
      />
      <Gauge
        icon={HardDrive}
        label="Photo storage"
        detail={`R2 · ${usage.storage.object_count.toLocaleString()} objects`}
        used={usage.storage.used_bytes}
        limit={usage.storage.limit_bytes}
      />
    </div>
  );
}
