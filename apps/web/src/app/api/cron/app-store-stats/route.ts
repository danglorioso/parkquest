import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appStoreDailyStats } from "@/lib/db/schema";
import { fetchDailySalesSummary } from "@/lib/appStoreConnect";

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
// when CRON_SECRET is set as a project env var — this just checks it's
// actually them and not an open, publicly-callable endpoint.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Walk back over the last 7 days rather than just "yesterday" — Apple's
  // reports land 24-48h late and inconsistently, so this both catches up
  // whichever day just became available and re-fetches recent days in case
  // an earlier run saw a 404 or partial data.
  const results: { date: string; status: "saved" | "not_yet_available" }[] = [];
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const reportDate = isoDate(d);

    const summary = await fetchDailySalesSummary(reportDate);
    if (!summary) {
      results.push({ date: reportDate, status: "not_yet_available" });
      continue;
    }

    await db
      .insert(appStoreDailyStats)
      .values({
        report_date: reportDate,
        units: summary.units,
        proceeds: summary.proceeds,
        proceeds_currency: summary.proceedsCurrency,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: appStoreDailyStats.report_date,
        set: {
          units: summary.units,
          proceeds: summary.proceeds,
          proceeds_currency: summary.proceedsCurrency,
          updated_at: new Date(),
        },
      });
    results.push({ date: reportDate, status: "saved" });
  }

  return NextResponse.json({ results });
}
