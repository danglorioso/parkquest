'use client';

import { useEffect, useState } from 'react';
import type { EnrichedReport } from '@parkquest/types';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  other: 'Other',
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<EnrichedReport[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    fetch('/api/admin/reports?status=open').then(r => r.json()).then(setReports);
  };

  useEffect(load, []);

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

  if (reports === null) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Reports queue</h1>
      {reports.length === 0 ? (
        <p style={{ color: '#888', fontSize: 14 }}>No open reports. All clear.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map(r => (
            <div key={r.id} style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {r.target_type.toUpperCase()} · {REASON_LABELS[r.reason] ?? r.reason}
                </span>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
                Reported by <strong>@{r.reporter_username ?? r.reporter_id}</strong>
                {r.target_username ? <> — target: <strong>@{r.target_username}</strong></> : null}
              </p>
              {r.target_content ? (
                <p style={{ fontSize: 13, background: '#f7f7f7', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  {r.target_content}
                </p>
              ) : null}
              {r.details ? (
                <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Details: {r.details}</p>
              ) : null}
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busyId === r.id} onClick={() => act(r.id, 'dismiss')} style={btnStyle}>
                  Dismiss
                </button>
                {r.target_type !== 'user' && (
                  <button disabled={busyId === r.id} onClick={() => act(r.id, 'remove_content')} style={btnStyle}>
                    Remove content
                  </button>
                )}
                <button disabled={busyId === r.id} onClick={() => act(r.id, 'ban_user')} style={{ ...btnStyle, color: '#C04040', borderColor: '#C04040' }}>
                  Ban user
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '6px 12px',
  borderRadius: 8, border: '1px solid #ccc', background: 'white', cursor: 'pointer',
};
