import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getBadgeStats } from '@/lib/badgeStats';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const stats = await getBadgeStats();
  return NextResponse.json(stats);
}
