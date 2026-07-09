import { currentUser } from '@clerk/nextjs/server';

export async function requireAdmin() {
  const user = await currentUser();
  if (!user || user.publicMetadata?.role !== 'admin') return null;
  return user;
}
