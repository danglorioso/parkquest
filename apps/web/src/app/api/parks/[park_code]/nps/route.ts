import { NextResponse } from "next/server";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ park_code: string }> }
) {
  const { park_code } = await params;
  const apiKey = process.env.NPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "NPS API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://developer.nps.gov/api/v1/parks?parkCode=${park_code}&api_key=${apiKey}`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "NPS API error" }, { status: 502 });
    }

    const raw = await res.json();
    const p = raw.data?.[0];

    if (!p) {
      return NextResponse.json({ error: "Park not found in NPS API" }, { status: 404 });
    }

    const data: NpsData = {
      images: (p.images ?? []).map((img: { url: string; title: string; altText: string; credit: string }) => ({
        url: img.url,
        title: img.title ?? "",
        altText: img.altText ?? "",
        credit: img.credit ?? "",
      })),
      activities: (p.activities ?? []).map((a: { name: string }) => a.name),
      topics: (p.topics ?? []).map((t: { name: string }) => t.name),
      operatingHours: p.operatingHours ?? [],
      entranceFees: (p.entranceFees ?? []).map((f: { cost: string; title: string; description: string }) => ({
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

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch NPS data" }, { status: 500 });
  }
}
