'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Flag, Users, Image as ImageIcon, MapPin, Award, Trees, Megaphone, Menu, X } from 'lucide-react';

const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/reports', label: 'Reports', icon: Flag },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/posts', label: 'Posts', icon: ImageIcon },
  { href: '/admin/visits', label: 'Visits', icon: MapPin },
  { href: '/admin/badges', label: 'Badges', icon: Award },
  { href: '/admin/parks', label: 'Parks', icon: Trees },
  { href: '/admin/notifications', label: 'Broadcast', icon: Megaphone },
];

function renderLinks(pathname: string, onNavigate?: () => void) {
  return LINKS.map(({ href, label, icon: Icon, exact }) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-ink-mute hover:bg-surface-alt hover:text-ink'
        }`}
      >
        <Icon size={14} strokeWidth={2.25} />
        {label}
      </Link>
    );
  });
}

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Inline nav — medium screens and up */}
      <nav className="hidden flex-wrap gap-1 md:flex">
        {renderLinks(pathname)}
      </nav>

      {/* Hamburger — narrow / mobile-web viewports */}
      <div className="relative md:hidden">
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle admin navigation"
          className="flex items-center justify-center rounded-lg border border-hairline bg-surface p-2 text-ink"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20 bg-black/20" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-30 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-hairline bg-surface p-2 shadow-panel">
              {renderLinks(pathname, () => setOpen(false))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
