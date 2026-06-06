import { NextResponse } from "next/server";
import { toNpsCode } from "@/lib/npsCodeMap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ park_code: string }> }
) {
  const { park_code } = await params;
  const npsCode = toNpsCode(park_code);
  const apiKey = process.env.NPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ images: [] });
  }

  try {
    const res = await fetch(
      `https://developer.nps.gov/api/v1/parks?parkCode=${npsCode}&api_key=${apiKey}&fields=images`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      return NextResponse.json({ images: [] });
    }

    const data = await res.json();
    const images = (
      data.data?.[0]?.images ?? []
    ).map((img: { url: string; title: string; altText: string }) => ({
      url: img.url,
      title: img.title,
      altText: img.altText ?? "",
    }));

    return NextResponse.json(
      { images },
      { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" } }
    );
  } catch {
    return NextResponse.json({ images: [] });
  }
}
