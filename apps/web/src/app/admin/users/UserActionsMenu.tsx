'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react';

export function UserActionsMenu({ userId, username, banned }: { userId: string; username: string; banned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [banArmed, setBanArmed] = useState(false);

  const toggleBan = async () => {
    if (busy) return;
    // Unban is harmless to reverse — only banning gets the arm-then-confirm
    // click. First click arms it, second click (within 3s) executes.
    if (!banned && !banArmed) {
      setBanArmed(true);
      setTimeout(() => setBanArmed(false), 3000);
      return;
    }
    setBanArmed(false);
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: banned ? 'unban' : 'ban' }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    if (busy || confirmText !== username) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmUsername: confirmText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to delete user');
        return;
      }
      setConfirmOpen(false);
      setConfirmText('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="User actions"
        className="rounded-md p-1.5 text-ink-mute hover:bg-surface-alt hover:text-ink"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setBanArmed(false); }} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-hairline bg-surface p-1 shadow-panel">
            <button
              onClick={toggleBan}
              disabled={busy}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold disabled:opacity-50 ${
                banned ? 'text-ink-soft hover:bg-surface-alt' :
                banArmed ? 'bg-destructive/10 text-destructive' : 'text-destructive hover:bg-destructive/10'
              }`}
            >
              {banned ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
              {banned ? 'Unban user' : banArmed ? 'Click again to confirm' : 'Ban user'}
            </button>
            <button
              onClick={() => { setOpen(false); setBanArmed(false); setConfirmOpen(true); setConfirmText(''); setError(null); }}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Delete user
            </button>
          </div>
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-5 shadow-panel">
            <h2 className="text-base font-extrabold text-ink">Delete @{username}?</h2>
            <p className="mt-2 text-sm text-ink-soft">
              This permanently deletes their account and all data — profile, posts, visits, badges,
              comments, likes, friendships, notifications, and push tokens. This cannot be undone.
            </p>
            <p className="mt-3 text-xs font-semibold text-ink-mute">
              Type <span className="font-mono text-ink">{username}</span> to confirm.
            </p>
            <input
              autoFocus
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={username}
              className="mt-2 w-full rounded-md border border-hairline bg-surface-alt px-3 py-2 text-sm text-ink focus:border-destructive focus:outline-none"
            />
            {error && <p className="mt-2 text-xs font-semibold text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setConfirmOpen(false); setConfirmText(''); setError(null); }}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-alt disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteUser}
                disabled={busy || confirmText !== username}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
