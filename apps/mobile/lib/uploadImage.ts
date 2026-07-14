import * as ImageManipulator from 'expo-image-manipulator';

// Vercel Functions hard-cap request bodies at 4.5 MB and /api/upload enforces 4 MB —
// stay a little under that so the request never bounces.
const MAX_UPLOAD_BYTES = 3.8 * 1024 * 1024;
// Never shrink below this longest edge, even if the byte cap is still exceeded —
// at 0.6 quality a photo this size always fits.
const MIN_DIMENSION = 1280;

// Content-Types /api/upload accepts. Anything else gets sent as image/jpeg — sharp
// sniffs the actual bytes server-side, so a mislabeled header still converts fine.
const SERVER_ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// The crop step (log-visit.tsx) already caps the long edge to a sane display size
// before this runs, so most photos pass through untouched. This is the last-resort
// safety net for whatever still blows past the server's request cap.
export async function fitUnderUploadCap(
  uri: string,
  mimeType?: string,
): Promise<{ blob: Blob; mimeType: string }> {
  let blob = await (await fetch(uri)).blob();
  if (blob.size <= MAX_UPLOAD_BYTES) {
    return { blob, mimeType: mimeType && SERVER_ACCEPTED.has(mimeType) ? mimeType : 'image/jpeg' };
  }

  // Recompress at original dimensions before touching resolution.
  let result = await ImageManipulator.manipulateAsync(
    uri, [], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  blob = await (await fetch(result.uri)).blob();

  let width = result.width;
  while (blob.size > MAX_UPLOAD_BYTES && width > MIN_DIMENSION) {
    width = Math.max(MIN_DIMENSION, Math.round(width * 0.75));
    result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }], // height omitted — scales proportionally
      { compress: width === MIN_DIMENSION ? 0.6 : 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    blob = await (await fetch(result.uri)).blob();
  }
  return { blob, mimeType: 'image/jpeg' };
}
