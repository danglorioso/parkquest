import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appStoreDailyStats, appStoreDeviceDownloads } from "@/lib/db/schema";
import {
  fetchDailySalesSummary,
  ensureAnalyticsReportRequest,
  fetchAnalyticsDailyMetrics,
} from "@/lib/appStoreConnect";

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

// Walk back over the last 7 days rather than just "yesterday" — Apple's
// reports land 24-48h late and inconsistently, so this both catches up
// whichever day just became available and re-fetches recent days in case
// an earlier run saw a 404 or partial data.
function trailingDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(isoDate(d));
  }
  return dates;
}

async function syncSales(dates: string[]) {
  const results: { date: string; status: "saved" | "not_yet_available" }[] = [];
  for (const reportDate of dates) {
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
  return results;
}

// Analytics (impressions/page views/download splits) comes from a separate
// Apple pipeline. The two report families publish independently, so each is
// upserted on its own — only the columns that family owns — and a day where
// e.g. engagement lands before downloads self-heals on the next run.
async function syncAnalytics(dates: string[]) {
  const { requestId, justCreated } = await ensureAnalyticsReportRequest();
  if (justCreated) {
    // Apple takes ~24-48h to generate the first reports for a new request.
    return { status: "report_request_created" as const };
  }

  const { engagement, downloads } = await fetchAnalyticsDailyMetrics(requestId, dates);

  for (const [date, m] of engagement) {
    await db
      .insert(appStoreDailyStats)
      .values({
        report_date: date,
        units: 0,
        proceeds: 0,
        proceeds_currency: "USD",
        impressions: m.impressions,
        impressions_unique: m.impressionsUnique,
        product_page_views: m.productPageViews,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: appStoreDailyStats.report_date,
        set: {
          impressions: m.impressions,
          impressions_unique: m.impressionsUnique,
          product_page_views: m.productPageViews,
          updated_at: new Date(),
        },
      });
  }

  for (const [date, m] of downloads) {
    await db
      .insert(appStoreDailyStats)
      .values({
        report_date: date,
        units: 0,
        proceeds: 0,
        proceeds_currency: "USD",
        first_time_downloads: m.firstTimeDownloads,
        redownloads: m.redownloads,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: appStoreDailyStats.report_date,
        set: {
          first_time_downloads: m.firstTimeDownloads,
          redownloads: m.redownloads,
          updated_at: new Date(),
        },
      });

    for (const [device, d] of m.byDevice) {
      await db
        .insert(appStoreDeviceDownloads)
        .values({
          report_date: date,
          device,
          first_time_downloads: d.firstTimeDownloads,
          redownloads: d.redownloads,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [appStoreDeviceDownloads.report_date, appStoreDeviceDownloads.device],
          set: {
            first_time_downloads: d.firstTimeDownloads,
            redownloads: d.redownloads,
            updated_at: new Date(),
          },
        });
    }
  }

  return {
    status: "ok" as const,
    engagement_days: [...engagement.keys()].sort(),
    download_days: [...downloads.keys()].sort(),
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dates = trailingDates();
  const results = await syncSales(dates);

  // Analytics failing (missing report request, Apple hiccup) must not lose
  // the sales rows that already saved — report the error instead of 500ing.
  let analytics;
  try {
    analytics = await syncAnalytics(dates);
  } catch (e) {
    analytics = { status: "error" as const, message: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ results, analytics });
}
