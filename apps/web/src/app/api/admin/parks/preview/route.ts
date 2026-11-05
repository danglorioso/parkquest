import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { evaluateParkWrite, loadParkSnapshot, looseSnapshot, parseParkInput, snapshotOf } from '@/lib/parkAdmin';

// POST — read-only "what happens if I save this" for the Add/Edit park panels.
// Body: { mode: 'add' | 'edit', form }. Returns the guards (impact, whether a
// typed confirmation is needed, coordinate warnings) plus the validation error
// the form would currently fail with, if any. Writes nothing.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { mode?: unknown; form?: Record<string, unknown> } | null;
  const form = body?.form;
  const park_code = typeof form?.park_code === 'string' ? form.park_code.trim().toLowerCase() : '';
  if (!form || !park_code) return NextResponse.json({ error: 'form.park_code is required' }, { status: 400 });

  const current = await loadParkSnapshot(park_code);
  const isEdit = body?.mode === 'edit';
  if (isEdit && !current) return NextResponse.json({ error: 'Park not found' }, { status: 404 });
  if (!isEdit && current) {
    return NextResponse.json({ guards: null, invalid: `A park with code "${park_code}" already exists — use Edit park instead` });
  }

  const parsed = parseParkInput(form, current?.designation);
  const next = parsed.ok ? snapshotOf(parsed.value) : looseSnapshot(form);
  const guards = await evaluateParkWrite(park_code, next, current);
  return NextResponse.json({ guards, invalid: parsed.ok ? null : parsed.error });
}
