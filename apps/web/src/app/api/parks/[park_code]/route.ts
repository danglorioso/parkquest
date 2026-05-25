import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { parks } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ park_code: string }> }
) {
  try {
    const { park_code } = await params;
    const [park] = await db
      .select()
      .from(parks)
      .where(eq(parks.park_code, park_code))
      .limit(1);

    if (!park) {
      return NextResponse.json({ error: "Park not found" }, { status: 404 });
    }

    return NextResponse.json(park);
  } catch (error) {
    console.error("Error fetching park:", error);
    return NextResponse.json({ error: "Failed to fetch park" }, { status: 500 });
  }
}
