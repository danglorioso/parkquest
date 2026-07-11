'use client';

import { useEffect, useState } from 'react';
import { Flag, Trash2, ShieldOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { EnrichedReport, ReportStatus } from '@parkquest/types';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  impersonation: 'Impersonation',
  misleading: 'Misleading or fake account',
  blocked: 'Blocked by user',
  other: 'Other',
};

const TABS: { key: ReportStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'actioned', label: 'Actioned' },
];

const btnBase =
  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';

export default function AdminReportsPage() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<EnrichedReport[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = (s: ReportStatus) => {
    setReports(null);
    fetch(`/api/admin/reports?status=${s}`).then(r => r.json()).then(setReports);
  };

  useEffect(() => load(status), [status]);

  const act = async (id: number, action: 'dismiss' | 'remove_content' | 'ban_user') => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) setReports(prev => prev?.filter(r => r.id !== id) ?? prev);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Reports queue</h1>
        <p className="mt-1 text-sm text-ink-mute">
          {reports === null ? 'Loading…' : `${reports.length} ${status} report${reports.length !== 1 ? 's' : ''}.`}
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === t.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-hairline bg-surface text-ink-soft hover:bg-surface-alt'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reports === null ? (
        <p className="text-sm text-ink-mute">Loading…</p>
      ) : reports.length === 0 ? (
        <Card className="items-center gap-2 border-hairline py-10 text-center shadow-[var(--shadow-card)]">
          <Flag className="mx-auto text-ink-mute" size={22} />
          <p className="text-sm text-ink-mute">No {status} reports.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map(r => (
            <Card key={r.id} className="gap-2 border-hairline p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
                  {r.target_type} #{r.target_id} · {REASON_LABELS[r.reason] ?? r.reason}
                </span>
                <span className="text-xs text-ink-mute">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-sm text-ink-soft">
                Reported by <strong className="text-ink">@{r.reporter_username ?? r.reporter_id}</strong>
                {r.target_username ? <> — target: <strong className="text-ink">@{r.target_username}</strong></> : null}
              </p>
              {r.target_photos && r.target_photos.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto">
                  {r.target_photos.slice(0, 4).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt="" className="h-24 w-24 flex-shrink-0 rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}
              {r.target_content ? (
                <p className="rounded-lg bg-surface-alt p-2.5 text-sm text-ink-soft">{r.target_content}</p>
              ) : null}
              {r.details ? (
                <p className="text-sm text-ink-mute">Details: {r.details}</p>
              ) : null}
              {status === 'open' ? (
                <div className="mt-1 flex gap-2">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, 'dismiss')}
                    className={`${btnBase} border-hairline bg-surface text-ink-soft hover:bg-surface-alt`}
                  >
                    Dismiss
                  </button>
                  {r.target_type !== 'user' && (
                    <button
                      disabled={busyId === r.id}
                      onClick={() => act(r.id, 'remove_content')}
                      className={`${btnBase} border-hairline bg-surface text-ink-soft hover:bg-surface-alt`}
                    >
                      <Trash2 size={12} /> Remove content
                    </button>
                  )}
                  <button
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, 'ban_user')}
                    className={`${btnBase} border-destructive/40 bg-surface text-destructive hover:bg-destructive/10`}
                  >
                    <ShieldOff size={12} /> Ban user
                  </button>
                </div>
              ) : (
                <p className="text-xs text-ink-mute">
                  {r.status === 'dismissed' ? 'Dismissed' : 'Actioned'}
                  {r.reviewed_at ? ` on ${new Date(r.reviewed_at).toLocaleString()}` : ''}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
