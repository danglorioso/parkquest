import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { evaluateParkWrite, loadParkSnapshot, parseParkInput, revalidateParkData, snapshotOf, updateParkLogged } from '@/lib/parkAdmin';
import { changedFields, missingAcks } from '@/lib/parkGuards';

export async function GET(_request: Request, { params }: { params: Promise<{ park_code: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { park_code } = await params;
  const park = await loadParkSnapshot(park_code);
  if (!park) return NextResponse.json({ error: 'Park not found' }, { status: 404 });
  return NextResponse.json({ park: { park_code, ...park } });
}

// PATCH — edit/redesignate an existing park (e.g. monument → National Park).
// Body: the full form, `base` (the park exactly as the admin loaded it), and
// any acknowledgments the guards ask for (ParkWriteAcks). park_code is
// immutable: visits, posts, and badges all reference it, and NPS keeps the
// same code through a redesignation anyway.
export async function PATCH(request: Request, { params }: { params: Promise<{ park_code: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { park_code } = await params;
  const current = await loadParkSnapshot(park_code);
  if (!current) return NextResponse.json({ error: 'Park not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.base || typeof body.base !== 'object') {
    return NextResponse.json({ error: 'Missing base — reload the park and try again' }, { status: 400 });
  }

  // What the admin loaded must still be what's stored — otherwise they'd be
  // overwriting a change (another admin's, an NPS sync's) they never saw.
  const drifted = changedFields(current, body.base);
  if (drifted.length > 0) {
    return NextResponse.json({
      error: `This park changed since you loaded it (${drifted.join(', ')}). Reload it to see the latest before saving.`,
      code: 'conflict',
    }, { status: 409 });
  }

  const parsed = parseParkInput({ ...body, park_code }, current.designation);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const next = snapshotOf(parsed.value);

  const guards = await evaluateParkWrite(park_code, next, current);
  if (guards.changedFields.length === 0) return NextResponse.json({ park: { park_code, ...current }, change_id: null });
  const missing = missingAcks(park_code, guards, body);
  if (missing.length > 0) {
    return NextResponse.json({ error: missing.join(' '), code: 'needs_confirmation', guards }, { status: 409 });
  }

  const result = await updateParkLogged({ park_code, before: current, set: next, action: 'update', adminId: admin.id });
  if (!result.ok) {
    return NextResponse.json({ error: 'This park changed while saving. Reload it and try again.', code: 'conflict' }, { status: 409 });
  }

  revalidateParkData(park_code);
  return NextResponse.json({ park: { park_code, ...result.after }, change_id: result.changeId });
}
