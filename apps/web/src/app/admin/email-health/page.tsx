'use client';

import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface DomainStatus { name: string; status: string; region: string }
interface Health {
  configured: boolean;
  apiKeyValid: boolean;
  domains: DomainStatus[];
  error?: string;
}

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const DOMAIN_OK = new Set(['verified']);

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {ok ? <CheckCircle2 size={16} className="shrink-0 text-primary" /> : <XCircle size={16} className="shrink-0 text-destructive" />}
      <span className="text-sm font-semibold text-ink">{label}</span>
      {detail && <span className="text-sm text-ink-mute">— {detail}</span>}
    </div>
  );
}

export default function EmailHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadHealth = () => {
    setLoading(true);
    fetch('/api/admin/email-health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ configured: false, apiKeyValid: false, domains: [], error: 'Request failed' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadHealth(); }, []);

  const sendTest = async () => {
    if (sending) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/admin/email-health', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSendResult({ ok: false, message: data.error ?? 'Send failed' });
        return;
      }
      setSendResult({ ok: true, message: `Sent to ${data.to} (id ${data.id}). Check your inbox — and spam folder.` });
    } catch {
      setSendResult({ ok: false, message: 'Request failed' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Email health</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Verify Resend is configured correctly and can actually deliver — report alerts and new-user
          alerts go out silently, so a failure here explains why you never see them.
        </p>
      </div>

      <Card className="gap-4 border-hairline p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">Status</h2>
          <button
            type="button"
            onClick={loadHealth}
            disabled={loading}
            className={`${btnBase} border-hairline bg-surface text-ink-soft hover:bg-surface-alt`}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {health === null ? (
          <p className="text-sm text-ink-mute">Checking…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <StatusRow ok={health.configured} label="RESEND_API_KEY is set" />
            <StatusRow
              ok={health.apiKeyValid}
              label="API key works"
              detail={!health.apiKeyValid ? health.error : undefined}
            />

            {health.apiKeyValid && (
              <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-alt p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-mute">Sending domains</p>
                {health.domains.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle size={14} /> No domains on this Resend account — every send will fail.
                  </p>
                ) : (
                  health.domains.map(d => {
                    const ok = DOMAIN_OK.has(d.status);
                    return (
                      <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-ink">{d.name} <span className="text-ink-mute">({d.region})</span></span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ok ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
                          {d.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="gap-4 border-hairline p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">Send yourself a test email</h2>
        <p className="text-sm text-ink-mute">
          Sends a real email through Resend, from the same sender used for admin alerts, to the address
          on your Clerk account. If this doesn't land, the automated alerts aren't landing either.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={sendTest}
            disabled={sending || health?.apiKeyValid === false}
            className={`${btnBase} border-primary bg-primary text-primary-foreground`}
          >
            <Mail size={14} /> {sending ? 'Sending…' : 'Send test email to myself'}
          </button>
        </div>

        {sendResult && (
          <p className={`flex items-center gap-2 text-sm font-semibold ${sendResult.ok ? 'text-primary' : 'text-destructive'}`}>
            {sendResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {sendResult.message}
          </p>
        )}
      </Card>
    </div>
  );
}
