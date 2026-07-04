import { auth } from "@clerk/nextjs/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
// Vercel Functions hard-cap request bodies at 4.5 MB (platform limit, not configurable) —
// so clients must resize/compress *before* posting here. This is a defensive ceiling on
// top of that, not the primary size control.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 1600; // longest edge, px — plenty for feed/thumbnail display, a fraction of the storage

// Server-mediated upload: the client sends already-resized image bytes here (not a
// presigned R2 PUT), and this does one more resize/recompress pass as a safety net
// before anything is written to R2 — guards against a client that skips its own
// resize step, and normalizes everything (including HEIC) to a consistent JPEG.
export async function POST(req: Request) {
  if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: "R2 not configured — fill in CLOUDFLARE_R2_* env vars" }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const input = Buffer.from(await req.arrayBuffer());
  if (input.byteLength === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (input.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  let output: Buffer;
  try {
    output = await sharp(input)
      .rotate() // auto-orient from EXIF before it gets stripped, then strip it
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error("Image processing failed:", error);
    return NextResponse.json({ error: "Could not process image" }, { status: 400 });
  }

  const key = `visits/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: output,
    ContentType: "image/jpeg",
  }));

  return NextResponse.json({ publicUrl: `${R2_PUBLIC_URL}/${key}` });
}
