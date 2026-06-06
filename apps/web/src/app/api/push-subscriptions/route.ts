import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { endpoint, keys } = await request.json();
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    await db
      .insert(pushSubscriptions)
      .values({ clerk_user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { clerk_user_id: userId, p256dh: keys.p256dh, auth: keys.auth },
      });

    return NextResponse.json({ message: "Subscribed" });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.clerk_user_id, userId), eq(pushSubscriptions.endpoint, endpoint)));

    return NextResponse.json({ message: "Unsubscribed" });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}
