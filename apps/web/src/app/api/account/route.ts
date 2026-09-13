import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { deleteUserAccount } from '@/lib/deleteUser';

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await deleteUserAccount(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting account:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
