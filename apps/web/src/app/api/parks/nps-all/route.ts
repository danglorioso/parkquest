import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parks } from "@/lib/db/schema";
import { toNpsCode } from "@/lib/npsCodeMap";

// Mirrors [park_code]/nps/route.ts's NpsData shape exactly — this endpoint exists
// so the mobile app's "download for offline" flow can fetch every park's full
// detail payload (gallery images, activities, topics, hours, fees, directions,
// contact info) in a single upstream NPS request instead of 60+ per-park calls.
// Previously this only mapped images/activities/entranceFees, which is why the
// offline cache built from it was missing everything else the detail screen shows.
export interface NpsImage {
  url: string;
  title: string;
  altText: string;
  credit: string;
}

export interface NpsHours {
  name: string;
  description: string;
  standardHours: Record<string, string>;
  exceptions: { name: string; startDate: string; endDate: string; exceptionHours: Record<string, string> }[];
}

export interface NpsFee {
  cost: string;
  title: string;
  description: string;
}

export interface NpsData {
  images: NpsImage[];
  activities: string[];
  topics: string[];
  operatingHours: NpsHours[];
  entranceFees: NpsFee[];
  directionsInfo: string;
  directionsUrl: string;
  weatherInfo: string;
  phone: string;
  email: string;
  url: string;
  designation: string;
}

// Legacy alias — the web map view (MapRightPanel/map/page.tsx) only reads the
// images/activities/entranceFees subset and imports this name specifically.
// The route now returns the full NpsData shape, which is a superset, so the
// existing consumers keep working unchanged.
export type NpsSummary = NpsData;

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
      images?: Array<{ url: string; title: string; altText: string; credit: string }>;
      activities?: Array<{ name: string }>;
      topics?: Array<{ name: string }>;
      operatingHours?: NpsHours[];
      entranceFees?: Array<{ cost: string; title: string; description: string }>;
      directionsInfo?: string;
      directionsUrl?: string;
      weatherInfo?: string;
      contacts?: {
        phoneNumbers?: { phoneNumber: string }[];
        emailAddresses?: { emailAddress: string }[];
      };
      url?: string;
      designation?: string;
    }> = raw.data ?? [];

    const result: Record<string, NpsData> = {};

    for (const p of npsParks) {
      const data: NpsData = {
        images: (p.images ?? []).map((img) => ({
          url: img.url,
          title: img.title ?? "",
          altText: img.altText ?? "",
          credit: img.credit ?? "",
        })),
        activities: (p.activities ?? []).map((a) => a.name),
        topics: (p.topics ?? []).map((t) => t.name),
        operatingHours: p.operatingHours ?? [],
        entranceFees: (p.entranceFees ?? []).map((f) => ({
          cost: f.cost,
          title: f.title,
          description: f.description,
        })),
        directionsInfo: p.directionsInfo ?? "",
        directionsUrl: p.directionsUrl ?? "",
        weatherInfo: p.weatherInfo ?? "",
        phone: p.contacts?.phoneNumbers?.[0]?.phoneNumber ?? "",
        email: p.contacts?.emailAddresses?.[0]?.emailAddress ?? "",
        url: p.url ?? "",
        designation: p.designation ?? "",
      };
      // Apply to all local codes that map to this NPS code
      for (const localCode of npsCodeToLocalCodes[p.parkCode] ?? []) {
        result[localCode] = data;
      }
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({});
  }
}
