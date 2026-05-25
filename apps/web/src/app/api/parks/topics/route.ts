import { NextResponse } from "next/server";

// Returns { [park_code]: string[] } of topics for all NPS parks, cached 24h.
export async function GET() {
  const apiKey = process.env.NPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "NPS API key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://developer.nps.gov/api/v1/parks?limit=500&api_key=${apiKey}`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "NPS API error" }, { status: 502 });
    }

    const raw = await res.json();
    const result: Record<string, string[]> = {};

    for (const p of raw.data ?? []) {
      const code: string = p.parkCode;
      if (code) {
        result[code] = (p.topics ?? []).map((t: { name: string }) => t.name);
      }
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch topics" }, { status: 500 });
  }
}
