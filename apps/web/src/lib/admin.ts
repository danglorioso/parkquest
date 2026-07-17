import { currentUser } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export async function requireAdmin() {
  const user = await currentUser();
  if (!user || user.publicMetadata?.role !== 'admin') return null;

  // Lazily mirror admin status onto user_profiles.is_admin — display-only
  // (the star badge next to admin names in feeds/comments). Clerk stays the
  // source of truth for authorization; this just self-heals whenever an
  // admin touches any admin endpoint, so no manual flag-setting per
  // environment. Deliberately never un-sets: revoking admin is rare enough
  // to handle by hand, and a stray star is harmless while a DB write on
  // every admin request isn't.
  after(async () => {
    await db.execute(sql`
      UPDATE user_profiles SET is_admin = true
      WHERE clerk_user_id = ${user.id} AND is_admin = false
    `).catch(() => {});
  });

  return user;
}
