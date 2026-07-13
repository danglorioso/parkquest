import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { badgeOverrides } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import { ALL_BADGES } from '@/lib/badges';
import { validateBadgeDisplay, validateConditions } from '../../custom-badges/validate';

// PUT /api/admin/builtin-badges/[badgeId] — set the admin override for one
// built-in badge. `conditions: null` keeps the code-defined criteria;
// a condition list replaces them. Criteria changes take effect the next time
// each user's badges are evaluated (they can award AND revoke).
export async function PUT(request: Request, { params }: { params: Promise<{ badgeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { badgeId } = await params;
  if (!ALL_BADGES.some(b => b.id === badgeId)) {
    return NextResponse.json({ error: 'Unknown built-in badge' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const display = validateBadgeDisplay(b);
  if (typeof display === 'string') return NextResponse.json({ error: display }, { status: 400 });

  let conditions = null;
  if (b.conditions !== null && b.conditions !== undefined) {
    const parsed = validateConditions(b.conditions);
    if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });
    conditions = parsed;
  }

  const values = { ...display, conditions, updated_at: new Date() };
  const [saved] = await db
    .insert(badgeOverrides)
    .values({ badge_id: badgeId, ...values })
    .onConflictDoUpdate({ target: badgeOverrides.badge_id, set: values })
    .returning();

  return NextResponse.json({ override: saved });
}

// DELETE /api/admin/builtin-badges/[badgeId] — reset the badge to its
// code-defined definition and criteria.
export async function DELETE(_request: Request, { params }: { params: Promise<{ badgeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { badgeId } = await params;
  await db.delete(badgeOverrides).where(eq(badgeOverrides.badge_id, badgeId));
  return NextResponse.json({ message: 'Reset to default' });
}
