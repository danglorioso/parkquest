'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, ShieldOff, ShieldCheck } from 'lucide-react';

export function BanButton({ userId, banned }: { userId: string; banned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const toggle = async () => {
    if (busy) return;
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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-hairline bg-surface p-1 shadow-panel">
            <button
              onClick={toggle}
              disabled={busy}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold disabled:opacity-50 ${
                banned ? 'text-ink-soft hover:bg-surface-alt' : 'text-destructive hover:bg-destructive/10'
              }`}
            >
              {banned ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
              {banned ? 'Unban user' : 'Ban user'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
