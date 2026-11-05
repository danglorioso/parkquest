import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { fetchNpsCandidates, fetchNpsUnit } from '@/lib/parkAdmin';

// GET ?code=xxxx — one NPS unit, to prefill the Add/Edit park form.
// GET (no code)  — NPS units the app could show that aren't in the parks
// table yet (see fetchNpsCandidates). Both read-only.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const code = new URL(request.url).searchParams.get('code')?.trim().toLowerCase();
  try {
    if (!code) return NextResponse.json({ candidates: await fetchNpsCandidates() });
    const unit = await fetchNpsUnit(code);
    if (!unit) return NextResponse.json({ error: `NPS doesn't list "${code}" (yet) — fill the form in by hand` }, { status: 404 });
    return NextResponse.json({ unit });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'NPS lookup failed' }, { status: 502 });
  }
}
