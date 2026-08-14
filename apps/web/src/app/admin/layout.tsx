import { redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { Flag } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { reports } from '@/lib/db/schema';
import { Wordmark } from '@/components/Wordmark';
import { AdminNav } from './AdminNav';

export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  // Reports are never deleted, only dismissed or actioned, so this banner
  // clears itself once every open report has been reviewed.
  const [{ openCount }] = await db
    .select({ openCount: sql<number>`count(*)::int` })
    .from(reports)
    .where(eq(reports.status, 'open'));

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/admin" className="flex items-center gap-3">
            <Wordmark size="large" />
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-foreground">
              Admin
            </span>
          </Link>
          <AdminNav />
        </div>
      </header>
      {openCount > 0 && (
        <Link
          href="/admin/reports"
          className="flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15"
        >
          <Flag size={14} strokeWidth={2.5} />
          {openCount} unaddressed report{openCount !== 1 ? 's' : ''} {openCount !== 1 ? 'need' : 'needs'} review
        </Link>
      )}
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
