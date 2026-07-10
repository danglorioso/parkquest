import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { Wordmark } from '@/components/Wordmark';
import { AdminNav } from './AdminNav';

export const metadata = { title: 'Admin — ParkQuest' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Wordmark size="large" />
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-foreground">
              Admin
            </span>
          </div>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
