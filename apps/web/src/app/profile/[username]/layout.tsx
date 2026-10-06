import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const [profile] = await db
    .select({ display_name: userProfiles.display_name, username: userProfiles.username })
    .from(userProfiles)
    .where(eq(userProfiles.username, username))
    .limit(1);

  if (!profile) return { title: "Profile" };

  const handle = `@${profile.username}`;
  const title = profile.display_name?.trim()
    ? `${profile.display_name.trim()} (${handle}) - ParkQuest`
    : `${handle} - ParkQuest`;
  return { title };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
