'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Flag, Users, Image as ImageIcon, MapPin, Award } from 'lucide-react';

const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/reports', label: 'Reports', icon: Flag },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/posts', label: 'Posts', icon: ImageIcon },
  { href: '/admin/visits', label: 'Visits', icon: MapPin },
  { href: '/admin/badges', label: 'Badges', icon: Award },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
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
      })}
    </nav>
  );
}
