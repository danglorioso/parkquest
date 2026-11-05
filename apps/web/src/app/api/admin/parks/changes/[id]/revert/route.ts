import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { evaluateParkWrite, planRevert, revalidateParkData, snapshotOf, updateParkLogged } from '@/lib/parkAdmin';
import { missingAcks } from '@/lib/parkGuards';

// POST — undo one park_changes entry: restores the fields it touched to their
// earlier values (see planRevert for when that's refused). Goes through the
// same guards as an edit, and is itself logged (action 'revert'), so a revert
// can be reverted too. Body: { dry_run?: true } to just get the guards, or the
// acknowledgments (ParkWriteAcks) to apply it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid change id' }, { status: 400 });
  const body = (await request.json().catch(() => null)) ?? {};

  const plan = await planRevert(id);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const next = snapshotOf(plan.next);
  const guards = await evaluateParkWrite(plan.park_code, next, plan.current);
  if (body.dry_run === true) return NextResponse.json({ park_code: plan.park_code, guards });

  const missing = missingAcks(plan.park_code, guards, body);
  if (missing.length > 0) {
    return NextResponse.json({ error: missing.join(' '), code: 'needs_confirmation', guards }, { status: 409 });
  }

  const result = await updateParkLogged({
    park_code: plan.park_code, before: plan.current, set: next, action: 'revert', adminId: admin.id, revertsChangeId: id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: 'The park changed while reverting. Reload and try again.', code: 'conflict' }, { status: 409 });
  }

  revalidateParkData(plan.park_code);
  return NextResponse.json({ park_code: plan.park_code, change_id: result.changeId });
}
