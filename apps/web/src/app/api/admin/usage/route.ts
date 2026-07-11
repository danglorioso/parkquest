import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@/lib/db';
import { r2, R2_BUCKET } from '@/lib/r2';
import { requireAdmin } from '@/lib/admin';

// Free-tier ceilings for the services this app runs on. Update if the plan changes.
const NEON_LIMIT_BYTES = 0.5 * 1024 ** 3; // Neon free plan: 0.5 GB storage
const R2_LIMIT_BYTES = 10 * 1024 ** 3; // Cloudflare R2 free plan: 10 GB storage

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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [dbSize, r2Usage] = await Promise.all([
    db.execute(sql`SELECT pg_database_size(current_database())::float8 AS bytes`)
      .then(r => (r.rows as { bytes: number }[])[0]),
    getR2Usage(),
  ]);

  return NextResponse.json({
    database: { used_bytes: dbSize.bytes, limit_bytes: NEON_LIMIT_BYTES },
    storage: { used_bytes: r2Usage.bytes, limit_bytes: R2_LIMIT_BYTES, object_count: r2Usage.objects },
  });
}
