'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Users, MapPin, Send, Eye, UserCheck, Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CollapsibleCard } from '../CollapsibleCard';

interface ParkOption { park_code: string; name: string }
interface Broadcast { message: string; title: string | null; audience_label: string | null; sent_at: string; recipient_count: number }
interface RecipientPreview { clerk_user_id: string; username: string | null; display_name: string | null; avatar_url: string | null }

const fieldClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-primary/40';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export default function BroadcastPage() {
  const [title, setTitle] = useState('ParkQuest');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'all' | 'segment' | 'users'>('all');
  const [minVisitsOn, setMinVisitsOn] = useState(false);
  const [minVisits, setMinVisits] = useState(3);
  const [parkOn, setParkOn] = useState(false);
  const [parkCode, setParkCode] = useState('');
  const [parks, setParks] = useState<ParkOption[]>([]);

  // Specific-users picker. `selected` keeps full user objects (not just ids)
  // so chips stay renderable when a search narrows the list below.
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<RecipientPreview[]>([]);
  const [selected, setSelected] = useState<Map<string, RecipientPreview>>(new Map());

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewUsers, setPreviewUsers] = useState<RecipientPreview[] | null>(null);
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

  // Debounced user search for the specific-users picker.
  useEffect(() => {
    if (audience !== 'users') return;
    const t = setTimeout(() => {
      fetch(`/api/admin/notifications/recipients?q=${encodeURIComponent(pickerQuery)}`)
        .then(r => r.json())
        .then(d => setPickerResults(d.users ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [audience, pickerQuery]);

  // Any change to the audience (not the message — that doesn't affect who
  // matches) invalidates the last preview count — never let a stale count be
  // used to justify sending to a now-different group.
  const resetPreview = () => {
    setPreviewCount(null);
    setPreviewUsers(null);
    setConfirmArmed(false);
  };

  const filters = [
    ...(audience === 'segment' && minVisitsOn ? [{ type: 'min_visits', value: minVisits }] : []),
    ...(audience === 'segment' && parkOn && parkCode ? [{ type: 'visited_park', park_code: parkCode }] : []),
  ];

  const audienceLabel = audience === 'all'
    ? 'All users'
    : audience === 'users'
      ? `${selected.size} hand-picked user${selected.size === 1 ? '' : 's'}`
      : filters.length === 0
        ? 'Segment'
        : filters.map(f => f.type === 'min_visits'
            ? `≥${f.value} visits`
            : `Visited ${parks.find(p => p.park_code === f.park_code)?.name ?? f.park_code}`
          ).join(' & ');

  const requestBody = (dryRun: boolean) => ({
    title: title.trim() || undefined,
    message: message.trim(),
    audience,
    audience_label: audienceLabel,
    filters,
    user_ids: audience === 'users' ? [...selected.keys()] : [],
    dry_run: dryRun,
  });

  const canPreview = audience === 'all' || (audience === 'users' ? selected.size > 0 : filters.length > 0);

  const toggleUser = (u: RecipientPreview) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(u.clerk_user_id)) next.delete(u.clerk_user_id);
      else next.set(u.clerk_user_id, u);
      return next;
    });
    resetPreview();
  };
  const canSend = previewCount !== null && previewCount > 0 && message.trim().length > 0;

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
      setPreviewUsers(data.preview ?? []);
    } finally {
      setPreviewing(false);
    }
  };

  const send = async () => {
    if (!canSend || sending) return;
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
      setPreviewUsers(null);
      setConfirmArmed(false);
      setSelected(new Map());
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
            onChange={e => setMessage(e.target.value)}
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
            <button
              type="button"
              onClick={() => { setAudience('users'); resetPreview(); }}
              className={`${btnBase} ${audience === 'users' ? 'border-primary bg-primary text-primary-foreground' : 'border-hairline bg-surface text-ink-soft hover:bg-surface-alt'}`}
            >
              <UserCheck size={14} /> Specific users
            </button>
          </div>
        </div>

        {audience === 'users' && (
          <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-alt p-3.5">
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[...selected.values()].map(u => (
                  <button
                    key={u.clerk_user_id}
                    type="button"
                    onClick={() => toggleUser(u)}
                    className="flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft hover:bg-surface"
                    title="Remove"
                  >
                    {u.display_name || (u.username ? `@${u.username}` : u.clerk_user_id)}
                    <X size={11} />
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
                className={`${fieldClass} pl-8`}
                placeholder="Search by username or name…"
              />
            </div>

            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {pickerResults.length === 0 ? (
                <p className="px-1 py-2 text-sm text-ink-mute">No users found.</p>
              ) : (
                pickerResults.map(u => {
                  const isSelected = selected.has(u.clerk_user_id);
                  return (
                    <button
                      key={u.clerk_user_id}
                      type="button"
                      onClick={() => toggleUser(u)}
                      className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-surface'
                      }`}
                    >
                      <input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" />
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt="" className="h-6 w-6 flex-shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {(u.username ?? '?')[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="min-w-0 truncate text-ink-soft">
                        {u.display_name || (u.username ? `@${u.username}` : u.clerk_user_id)}
                        {u.display_name && u.username && <span className="ml-1.5 text-xs text-ink-mute">@{u.username}</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

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
              disabled={!canSend}
              title={message.trim().length === 0 ? 'Write a message before sending' : undefined}
              className={`${btnBase} border-primary bg-primary text-primary-foreground disabled:opacity-50`}
            >
              <Send size={14} /> Send to {previewCount} user{previewCount === 1 ? '' : 's'}
            </button>
          )}

          {previewCount !== null && !confirmArmed && message.trim().length === 0 && (
            <span className="text-xs text-ink-mute">Write a message before sending.</span>
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

        {previewUsers !== null && (
          previewUsers.length === 0 ? (
            <p className="text-sm text-ink-mute">No users match this audience.</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-alt p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-mute">
                Matching users {previewCount !== null && previewCount > previewUsers.length ? `(showing ${previewUsers.length} of ${previewCount})` : `(${previewUsers.length})`}
              </p>
              <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {previewUsers.map(u => (
                  <div key={u.clerk_user_id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="h-6 w-6 flex-shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {(u.username ?? '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-ink-soft">{u.display_name || (u.username ? `@${u.username}` : u.clerk_user_id)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </Card>

      <CollapsibleCard title="Recent broadcasts">
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
                <p className="text-sm font-semibold text-ink">{b.title || 'ParkQuest'}</p>
                <p className="text-sm text-ink-soft">{b.message}</p>
                {b.audience_label && (
                  <span className="mt-0.5 self-start rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink-mute">
                    {b.audience_label}
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}
