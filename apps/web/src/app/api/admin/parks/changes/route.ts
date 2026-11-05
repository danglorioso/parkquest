import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { listParkChanges } from '@/lib/parkAdmin';

// GET ?park_code=&limit= — the park_changes audit log, newest first.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const park_code = searchParams.get('park_code')?.trim().toLowerCase() || undefined;
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 30, 1), 200);
  return NextResponse.json({ changes: await listParkChanges({ park_code, limit }) });
}
