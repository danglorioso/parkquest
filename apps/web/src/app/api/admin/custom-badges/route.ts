import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customBadges, userBadges } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import { validateCustomBadge, slugifyBadgeId } from './validate';

// GET /api/admin/custom-badges — all custom badges with earned counts
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [rows, counts] = await Promise.all([
    db.select().from(customBadges).orderBy(desc(customBadges.created_at)),
    db.select({ badge_id: userBadges.badge_id, count: sql<number>`COUNT(*)::int` })
      .from(userBadges).groupBy(userBadges.badge_id),
  ]);
  const countMap = new Map(counts.map(c => [c.badge_id, c.count]));

  return NextResponse.json({
    badges: rows.map(b => ({ ...b, earned_count: countMap.get(b.badge_id) ?? 0 })),
  });
}

// POST /api/admin/custom-badges — create a custom badge
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const parsed = validateCustomBadge(await request.json().catch(() => null));
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  // Derive a unique badge_id from the name
  const base = slugifyBadgeId(parsed.name);
  let badgeId = base;
  for (let i = 2; ; i++) {
    const [existing] = await db
      .select({ id: customBadges.id })
      .from(customBadges)
      .where(eq(customBadges.badge_id, badgeId));
    if (!existing) break;
    badgeId = `${base}_${i}`;
  }

  const [created] = await db
    .insert(customBadges)
    .values({
      badge_id: badgeId,
      name: parsed.name,
      description: parsed.description,
      emoji: parsed.emoji,
      tier: parsed.tier,
      colors: parsed.colors,
      conditions: parsed.conditions,
      enabled: parsed.enabled,
    })
    .returning();

  return NextResponse.json({ badge: created }, { status: 201 });
}
