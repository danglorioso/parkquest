import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface ForecastPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  icon: string;
  windSpeed: string;
  windDirection: string;
  isDaytime: boolean;
}

export interface WeatherForecast {
  periods: ForecastPeriod[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ park_code: string }> }
) {
  const { park_code } = await params;

  try {
    const [park] = await db
      .select({ latitude: parks.latitude, longitude: parks.longitude })
      .from(parks)
      .where(eq(parks.park_code, park_code));

    if (!park?.latitude || !park?.longitude) {
      return NextResponse.json({ error: "Park location not found" }, { status: 404 });
    }

    const lat = parseFloat(park.latitude).toFixed(4);
    const lon = parseFloat(park.longitude).toFixed(4);

    const pointsRes = await fetch(
      `https://api.weather.gov/points/${lat},${lon}`,
      { headers: { "User-Agent": "ParkQuest/1.0 (danglorioso@icloud.com)" }, next: { revalidate: 3600 } }
    );

    if (!pointsRes.ok) {
      return NextResponse.json({ error: "NWS points lookup failed" }, { status: 502 });
    }

    const pointsData = await pointsRes.json();
    const forecastUrl: string = pointsData?.properties?.forecast;

    if (!forecastUrl) {
      return NextResponse.json({ error: "No forecast URL returned" }, { status: 502 });
    }

    const forecastRes = await fetch(
      forecastUrl,
      { headers: { "User-Agent": "ParkQuest/1.0 (danglorioso@icloud.com)" }, next: { revalidate: 3600 } }
    );

    if (!forecastRes.ok) {
      return NextResponse.json({ error: "NWS forecast fetch failed" }, { status: 502 });
    }

    const forecastData = await forecastRes.json();
    const rawPeriods: ForecastPeriod[] = (forecastData?.properties?.periods ?? []).slice(0, 14);

    const forecast: WeatherForecast = {
      periods: rawPeriods.map((p) => ({
        name: p.name,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        shortForecast: p.shortForecast,
        icon: p.icon,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection,
        isDaytime: p.isDaytime,
      })),
    };

    return NextResponse.json(forecast, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
