import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { expoPushTokens } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    await db
      .insert(expoPushTokens)
      .values({ clerk_user_id: userId, token })
      .onConflictDoUpdate({
        target: expoPushTokens.token,
        set: { clerk_user_id: userId },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving push token:", error);
    return NextResponse.json({ error: "Failed to save token" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = await request.json();
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    await db
      .delete(expoPushTokens)
      .where(and(eq(expoPushTokens.clerk_user_id, userId), eq(expoPushTokens.token, token)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error removing push token:", error);
    return NextResponse.json({ error: "Failed to remove token" }, { status: 500 });
  }
}
