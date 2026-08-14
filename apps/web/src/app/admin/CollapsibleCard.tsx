'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';

// Wraps a dashboard section in a Card whose header toggles the body open/
// closed. `headerRight` stays visible even when collapsed (a running total,
// a "view all" link) — `children` and `subtitle` both hide.
export function CollapsibleCard({
  title, headerRight, subtitle, defaultOpen = true, children, cardClassName, id,
}: {
  title: ReactNode;
  headerRight?: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  cardClassName?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Card id={id} className={cardClassName ?? 'scroll-mt-20 border-hairline p-5 shadow-[var(--shadow-card)]'}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={open}
        >
          <Chevron className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
          <h2 className="truncate text-sm font-bold uppercase tracking-wide text-ink-mute">{title}</h2>
        </button>
        {headerRight}
      </div>
      {open && subtitle && <p className="mb-4 mt-1 text-xs text-ink-mute">{subtitle}</p>}
      {open && <div className={subtitle ? '' : 'mt-4'}>{children}</div>}
    </Card>
  );
}
