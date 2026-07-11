import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@/lib/db';
import { r2, R2_BUCKET } from '@/lib/r2';
import { requireAdmin } from '@/lib/admin';

// Fallback ceilings used only when the Neon Management API call below is
// unavailable (no NEON_API_KEY/NEON_PROJECT_ID). Update if the plan changes.
const NEON_LIMIT_BYTES = 0.5 * 1000 ** 3;
const R2_LIMIT_BYTES = 10 * 1000 ** 3; // Cloudflare R2 free plan: 10 GB storage

async function getR2Usage() {
  let bytes = 0;
  let objects = 0;
  let continuationToken: string | undefined;
  do {
    const page = await r2.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      ContinuationToken: continuationToken,
    }));
    for (const obj of page.Contents ?? []) {
      bytes += obj.Size ?? 0;
      objects += 1;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { bytes, objects };
}

// Neon's console "storage used" is `synthetic_storage_size` — all branches'
// data deduplicated via copy-on-write, plus retained PITR history. Summing
// per-branch `logical_size` instead double-counts pages branches share, and
// pg_database_size() only sees this database's live pages on one branch, so
// both undercount/overcount vs. what the console and plan limit actually use.
async function getNeonUsage(): Promise<{ used: number; limit: number } | null> {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const { project } = await res.json() as {
    project: { synthetic_storage_size?: number; branch_logical_size_limit_bytes?: number };
  };
  if (typeof project.synthetic_storage_size !== 'number') return null;

  return {
    used: project.synthetic_storage_size,
    limit: project.branch_logical_size_limit_bytes ?? NEON_LIMIT_BYTES,
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [neonUsage, pgSize, r2Usage] = await Promise.all([
    getNeonUsage(),
    db.execute(sql`SELECT pg_database_size(current_database())::float8 AS bytes`)
      .then(r => (r.rows as { bytes: number }[])[0].bytes),
    getR2Usage(),
  ]);

  return NextResponse.json({
    database: {
      used_bytes: neonUsage?.used ?? pgSize,
      limit_bytes: neonUsage?.limit ?? NEON_LIMIT_BYTES,
      approximate: neonUsage === null,
    },
    storage: { used_bytes: r2Usage.bytes, limit_bytes: R2_LIMIT_BYTES, object_count: r2Usage.objects },
  });
}
