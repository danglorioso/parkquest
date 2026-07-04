import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "./r2";

// visits.photos is string[]; posts.photos is nominally { url, key, name }[] but in
// practice visit-linked posts get the same string[] as visits — handle both shapes.
export function extractPhotoUrls(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map(p => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object" && "url" in p) return String((p as { url: unknown }).url);
      return null;
    })
    .filter((u): u is string => !!u);
}

function r2KeyFromUrl(url: string): string | null {
  const prefix = `${R2_PUBLIC_URL}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

async function deleteR2Keys(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  await r2.send(new DeleteObjectsCommand({
    Bucket: R2_BUCKET,
    Delete: { Objects: keys.map(Key => ({ Key })) },
  }));
  return keys.length;
}

// For client-supplied URLs — restricts deletion to keys owned by the requesting user.
export async function deleteR2PhotosForUser(urls: string[], userId: string): Promise<number> {
  const ownerPrefix = `visits/${userId}/`;
  const keys = urls
    .map(r2KeyFromUrl)
    .filter((k): k is string => !!k && k.startsWith(ownerPrefix));
  return deleteR2Keys(keys);
}

// For server-internal cleanup where ownership was already established by the
// caller's own auth-scoped DB query (e.g. a row fetched WHERE clerk_user_id = userId).
export async function deleteR2PhotosTrusted(urls: string[]): Promise<number> {
  const keys = urls.map(r2KeyFromUrl).filter((k): k is string => !!k);
  return deleteR2Keys(keys);
}
