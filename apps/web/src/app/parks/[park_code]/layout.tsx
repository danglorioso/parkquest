import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { parks } from "@/lib/db/schema";

export async function generateMetadata({ params }: { params: Promise<{ park_code: string }> }): Promise<Metadata> {
  const { park_code } = await params;
  const [park] = await db
    .select({ name: parks.name })
    .from(parks)
    .where(eq(parks.park_code, park_code))
    .limit(1);

  return { title: park ? `${park.name} - ParkQuest` : "Park Details" };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
