import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteR2PhotosForUser } from "@/lib/photoCleanup";

// Best-effort cleanup for photos that were uploaded but never ended up attached
// to a saved visit/post (abandoned drafts, removed photos during an edit).
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { urls } = await req.json();
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  // Only allow deleting keys that belong to the requesting user — a stray URL
  // for someone else's photo (or garbage input) is silently skipped, not an error.
  const deleted = await deleteR2PhotosForUser(urls, userId);
  return NextResponse.json({ deleted });
}
