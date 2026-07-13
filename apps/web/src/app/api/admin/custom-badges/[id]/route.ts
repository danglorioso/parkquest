import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customBadges, userBadges, posts } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import { validateBadge } from '../validate';

async function findBadge(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) return null;
  const [badge] = await db.select().from(customBadges).where(eq(customBadges.id, id));
  return badge ?? null;
}

// PATCH /api/admin/custom-badges/[id] — update a badge.
// badge_id stays stable so existing user_badges/posts keep pointing at it;
// criteria/display changes take effect the next time each user's badges are
// evaluated (they can award AND revoke).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const badge = await findBadge((await params).id);
  if (!badge) return NextResponse.json({ error: 'Badge not found' }, { status: 404 });

  const parsed = validateBadge(await request.json().catch(() => null));
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  const [updated] = await db
    .update(customBadges)
    .set({
      name: parsed.name,
      description: parsed.description,
      emoji: parsed.emoji,
      tier: parsed.tier,
      colors: parsed.colors,
      conditions: parsed.conditions,
      enabled: parsed.enabled,
      updated_at: new Date(),
    })
    .where(eq(customBadges.id, badge.id))
    .returning();

  return NextResponse.json({ badge: updated });
}

// DELETE /api/admin/custom-badges/[id] — remove the badge everywhere:
// definition, every user's earned copy, and any badge share posts for it.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const badge = await findBadge((await params).id);
  if (!badge) return NextResponse.json({ error: 'Badge not found' }, { status: 404 });

  await Promise.all([
    db.delete(userBadges).where(eq(userBadges.badge_id, badge.badge_id)),
    db.delete(posts).where(eq(posts.badge_id, badge.badge_id)),
  ]);
  await db.delete(customBadges).where(eq(customBadges.id, badge.id));

  return NextResponse.json({ message: 'Deleted' });
}
