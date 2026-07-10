import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const { action } = await request.json();
  if (action !== 'ban' && action !== 'unban') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const client = await clerkClient();
  const user = action === 'ban' ? await client.users.banUser(id) : await client.users.unbanUser(id);

  return NextResponse.json({ id: user.id, banned: user.banned });
}
