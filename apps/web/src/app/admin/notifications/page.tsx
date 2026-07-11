'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Users, MapPin, Send, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ParkOption { park_code: string; name: string }
interface Broadcast { message: string; sent_at: string; recipient_count: number }

const fieldClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-primary/40';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export default function BroadcastPage() {
  const [title, setTitle] = useState('ParkQuest');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'all' | 'segment'>('all');
  const [minVisitsOn, setMinVisitsOn] = useState(false);
  const [minVisits, setMinVisits] = useState(3);
  const [parkOn, setParkOn] = useState(false);
  const [parkCode, setParkCode] = useState('');
  const [parks, setParks] = useState<ParkOption[]>([]);

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentBanner, setSentBanner] = useState<string | null>(null);
  const [history, setHistory] = useState<Broadcast[] | null>(null);

  const loadHistory = () => {
    fetch('/api/admin/notifications').then(r => r.json()).then(d => setHistory(d.broadcasts ?? []));
  };

  useEffect(() => {
    fetch('/api/admin/parks?sort=name&dir=asc').then(r => r.json()).then(d => setParks(d.parks ?? []));
    loadHistory();
  }, []);

  // Any change to the audience invalidates the last preview count — never let
  // a stale count be used to justify sending to a now-different group.
  const resetPreview = () => {
    setPreviewCount(null);
    setConfirmArmed(false);
  };

  const filters = [
    ...(audience === 'segment' && minVisitsOn ? [{ type: 'min_visits', value: minVisits }] : []),
    ...(audience === 'segment' && parkOn && parkCode ? [{ type: 'visited_park', park_code: parkCode }] : []),
  ];

  const requestBody = (dryRun: boolean) => ({
    title: title.trim() || undefined,
    message: message.trim(),
    audience,
    filters,
    dry_run: dryRun,
  });

  const canPreview = message.trim().length > 0 && (audience === 'all' || filters.length > 0);

  const preview = async () => {
    if (!canPreview || previewing) return;
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(true)),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to preview audience'); return; }
      setPreviewCount(data.recipient_count);
    } finally {
      setPreviewing(false);
    }
  };

  const send = async () => {
    if (previewCount === null || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(false)),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to send'); return; }
      setSentBanner(`Sent to ${data.recipient_count} user${data.recipient_count === 1 ? '' : 's'} just now.`);
      setMessage('');
      setPreviewCount(null);
      setConfirmArmed(false);
      loadHistory();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Broadcast</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Send a push + in-app notification to all users, or to a segment matching visit activity.
        </p>
      </div>

      <Card className="gap-4 border-hairline p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-ink-mute">Push title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={80}
            className={fieldClass}
            placeholder="ParkQuest"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-ink-mute">Message</label>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); resetPreview(); }}
            maxLength={300}
            rows={3}
            className={fieldClass}
            placeholder="What do you want to tell users?"
          />
          <span className="self-end text-xs text-ink-mute">{message.length}/300</span>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-ink-mute">Audience</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAudience('all'); resetPreview(); }}
              className={`${btnBase} ${audience === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-hairline bg-surface text-ink-soft hover:bg-surface-alt'}`}
            >
              <Users size={14} /> All users
            </button>
            <button
              type="button"
              onClick={() => { setAudience('segment'); resetPreview(); }}
              className={`${btnBase} ${audience === 'segment' ? 'border-primary bg-primary text-primary-foreground' : 'border-hairline bg-surface text-ink-soft hover:bg-surface-alt'}`}
            >
              <MapPin size={14} /> Segment
            </button>
          </div>
        </div>

        {audience === 'segment' && (
          <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-alt p-3.5">
            <p className="text-xs text-ink-mute">Users must match every enabled filter below.</p>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={minVisitsOn} onChange={e => { setMinVisitsOn(e.target.checked); resetPreview(); }} />
              At least
              <input
                type="number"
                min={1}
                value={minVisits}
                onChange={e => { setMinVisits(Math.max(1, Number(e.target.value) || 1)); resetPreview(); }}
                disabled={!minVisitsOn}
                className="w-16 rounded-md border border-hairline bg-surface px-2 py-1 text-sm text-ink disabled:opacity-50"
              />
              logged visits
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={parkOn} onChange={e => { setParkOn(e.target.checked); resetPreview(); }} />
              Visited
              <select
                value={parkCode}
                onChange={e => { setParkCode(e.target.value); resetPreview(); }}
                disabled={!parkOn}
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm text-ink disabled:opacity-50"
              >
                <option value="">Select a park…</option>
                {parks.map(p => (
                  <option key={p.park_code} value={p.park_code}>{p.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        {sentBanner && <p className="text-sm font-semibold text-primary">{sentBanner}</p>}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canPreview || previewing}
            onClick={preview}
            className={`${btnBase} border-hairline bg-surface text-ink-soft hover:bg-surface-alt`}
          >
            <Eye size={14} /> {previewing ? 'Checking…' : 'Preview audience'}
          </button>

          {previewCount !== null && !confirmArmed && (
            <button
              type="button"
              onClick={() => setConfirmArmed(true)}
              disabled={previewCount === 0}
              className={`${btnBase} border-primary bg-primary text-primary-foreground disabled:opacity-50`}
            >
              <Send size={14} /> Send to {previewCount} user{previewCount === 1 ? '' : 's'}
            </button>
          )}

          {confirmArmed && (
            <>
              <span className="text-sm font-semibold text-destructive">Confirm sending to {previewCount} users — cannot be undone.</span>
              <button
                type="button"
                disabled={sending}
                onClick={send}
                className={`${btnBase} border-destructive bg-destructive text-white`}
              >
                {sending ? 'Sending…' : 'Confirm send'}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmArmed(false)}
                className={`${btnBase} border-hairline bg-surface text-ink-soft hover:bg-surface-alt`}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-mute">Recent broadcasts</h2>
        {history === null ? (
          <p className="text-sm text-ink-mute">Loading…</p>
        ) : history.length === 0 ? (
          <Card className="items-center gap-2 border-hairline py-8 text-center shadow-[var(--shadow-card)]">
            <Megaphone className="mx-auto text-ink-mute" size={20} />
            <p className="text-sm text-ink-mute">No broadcasts sent yet.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((b, i) => (
              <Card key={i} className="gap-1 border-hairline p-3.5 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-mute">{new Date(b.sent_at).toLocaleString()}</span>
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-bold text-ink-soft">
                    {b.recipient_count} recipient{b.recipient_count === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-sm text-ink-soft">{b.message}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
