import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { userProfiles } from '@/lib/db/schema';
import { deleteUserAccount } from '@/lib/deleteUser';

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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json({ error: 'Cannot delete your own admin account from here' }, { status: 400 });
  }

  const { confirmUsername } = await request.json();

  const [row] = await db.select({ username: userProfiles.username })
    .from(userProfiles)
    .where(eq(userProfiles.clerk_user_id, id));
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Server-side re-check of the same typed confirmation the dashboard
  // requires — a stray or scripted request can't rely on the client-side
  // gate alone to nuke an account.
  if (confirmUsername !== row.username) {
    return NextResponse.json({ error: 'Confirmation text does not match username' }, { status: 400 });
  }

  await deleteUserAccount(id);

  return NextResponse.json({ success: true });
}
