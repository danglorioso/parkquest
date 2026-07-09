import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';

export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
      <nav style={{ display: 'flex', gap: 20, marginBottom: 28, fontSize: 14, fontWeight: 600 }}>
        <a href="/admin">Dashboard</a>
        <a href="/admin/reports">Reports</a>
      </nav>
      {children}
    </div>
  );
}
