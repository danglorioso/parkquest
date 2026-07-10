'use server';

import { revalidatePath } from 'next/cache';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/lib/admin';

export async function banUserAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Unauthorized');

  const userId = String(formData.get('userId'));
  const client = await clerkClient();
  await client.users.banUser(userId);
  revalidatePath('/admin/users');
}

export async function unbanUserAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Unauthorized');

  const userId = String(formData.get('userId'));
  const client = await clerkClient();
  await client.users.unbanUser(userId);
  revalidatePath('/admin/users');
}
