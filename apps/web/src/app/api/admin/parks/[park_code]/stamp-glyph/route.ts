import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { parks } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import type { CustomStampGlyph, StampGlyphShape } from '@parkquest/types';

const MAX_PATHS = 60;
// Detailed traced line-art (Inkscape/Illustrator bitmap trace) commonly
// produces single paths well past 20k characters — this just guards against
// pathological uploads, not realistic hand-traced icons.
const MAX_D_LENGTH = 300_000;

function validateGlyph(body: unknown): CustomStampGlyph | string {
  if (typeof body !== 'object' || body === null) return 'Invalid body';
  const { viewBox, paths } = body as Record<string, unknown>;

  if (typeof viewBox !== 'string' || !/^-?[\d.]+\s+-?[\d.]+\s+[\d.]+\s+[\d.]+$/.test(viewBox.trim())) {
    return 'viewBox must be four numbers, e.g. "0 0 24 24"';
  }
  if (!Array.isArray(paths) || paths.length === 0) return 'paths must be a non-empty array';
  if (paths.length > MAX_PATHS) return `Too many paths (max ${MAX_PATHS})`;

  const cleaned: StampGlyphShape[] = [];
  for (const p of paths) {
    if (typeof p !== 'object' || p === null) return 'Invalid path entry';
    const { d, fill, opacity } = p as Record<string, unknown>;
    if (typeof d !== 'string' || d.length === 0 || d.length > MAX_D_LENGTH) return 'Invalid path data';
    if (fill !== undefined && fill !== 'ink' && fill !== 'white') return 'fill must be "ink" or "white"';
    if (opacity !== undefined && (typeof opacity !== 'number' || opacity < 0 || opacity > 1)) return 'opacity must be 0-1';
    cleaned.push({ d, fill: fill as 'ink' | 'white' | undefined, opacity: opacity as number | undefined });
  }

  return { viewBox: viewBox.trim(), paths: cleaned };
}

// PUT /api/admin/parks/[park_code]/stamp-glyph — set a park's custom stamp
// icon, parsed client-side from an uploaded SVG's <path> elements.
export async function PUT(request: Request, { params }: { params: Promise<{ park_code: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { park_code } = await params;
  const [park] = await db.select({ park_code: parks.park_code }).from(parks).where(eq(parks.park_code, park_code));
  if (!park) return NextResponse.json({ error: 'Park not found' }, { status: 404 });

  const parsed = validateGlyph(await request.json().catch(() => null));
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  await db.update(parks).set({ stamp_glyph: parsed }).where(eq(parks.park_code, park_code));

  return NextResponse.json({ stamp_glyph: parsed });
}

// DELETE /api/admin/parks/[park_code]/stamp-glyph — clear back to the
// hand-authored PARK_GLYPHS fallback (or the default scene).
export async function DELETE(_request: Request, { params }: { params: Promise<{ park_code: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { park_code } = await params;
  await db.update(parks).set({ stamp_glyph: null }).where(eq(parks.park_code, park_code));

  return NextResponse.json({ message: 'Cleared' });
}
