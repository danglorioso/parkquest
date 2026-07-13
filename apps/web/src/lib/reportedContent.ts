import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reports } from '@/lib/db/schema';

// Post ids this user has reported — kept out of their feed regardless of
// report status until they withdraw the report (DELETE /api/reports?id=).
export async function getReportedPostIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ target_id: reports.target_id })
    .from(reports)
    .where(and(eq(reports.reporter_id, userId), eq(reports.target_type, 'post')));

  return rows.map(r => Number(r.target_id)).filter(Number.isFinite);
}
