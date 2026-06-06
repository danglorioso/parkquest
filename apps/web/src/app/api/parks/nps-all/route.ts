import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parks } from "@/lib/db/schema";
import { toNpsCode } from "@/lib/npsCodeMap";

export interface NpsSummary {
  images: Array<{ url: string; title: string; altText: string }>;
  activities: string[];
  entranceFees: Array<{ cost: string; title: string; description: string }>;
}

export async function GET() {
  const apiKey = process.env.NPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({});
  }

  try {
    const allParks = await db.select({ park_code: parks.park_code }).from(parks);
    const allLocalCodes = allParks.map((p) => p.park_code);

    // Deduplicate NPS codes (e.g. sequ + king both map to "seki")
    const npsCodeToLocalCodes: Record<string, string[]> = {};
    for (const localCode of allLocalCodes) {
      const npsCode = toNpsCode(localCode);
      (npsCodeToLocalCodes[npsCode] ??= []).push(localCode);
    }
    const uniqueNpsCodes = Object.keys(npsCodeToLocalCodes);

    const codesParam = uniqueNpsCodes.join(",");
    const res = await fetch(
      `https://developer.nps.gov/api/v1/parks?parkCode=${codesParam}&limit=500&api_key=${apiKey}`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      return NextResponse.json({});
    }

    const raw = await res.json();
    const npsParks: Array<{
      parkCode: string;
      images: Array<{ url: string; title: string; altText: string }>;
      activities: Array<{ name: string }>;
      entranceFees: Array<{ cost: string; title: string; description: string }>;
    }> = raw.data ?? [];

    const result: Record<string, NpsSummary> = {};

    for (const p of npsParks) {
      const summary: NpsSummary = {
        images: (p.images ?? []).map((img) => ({
          url: img.url,
          title: img.title ?? "",
          altText: img.altText ?? "",
        })),
        activities: (p.activities ?? []).map((a) => a.name),
        entranceFees: (p.entranceFees ?? []).map((f) => ({
          cost: f.cost,
          title: f.title,
          description: f.description,
        })),
      };
      // Apply to all local codes that map to this NPS code
      for (const localCode of npsCodeToLocalCodes[p.parkCode] ?? []) {
        result[localCode] = summary;
      }
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({});
  }
}
