/**
 * NPS park photos are served at full camera resolution (often ~4000px wide,
 * 2–6MB+ each). expo-image downscales them to the view on the MAIN thread
 * after decode, so a feed of these hung older iPads for seconds (Sentry App
 * Hang, 2.0.4 build 174). nps.gov resizes on the fly via `?width=` (aspect
 * kept, never upscaled), so request a screen-sized copy instead.
 *
 * One width app-wide on purpose: the feed card, park hero, gallery strip,
 * lightbox and the offline prefetch (offlineParks.ts) all resolve to the same
 * URL, so each photo is downloaded/cached once and offline downloads keep
 * hitting. 2400px covers the park hero's 2x pull-down stretch on a 3x phone.
 */
const NPS_IMAGE_WIDTH = 2400;

const NPS_HOST = /^https?:\/\/(www\.)?nps\.gov\//i;

export function npsImage(url: string): string;
export function npsImage(url: string | null | undefined): string | null | undefined;
export function npsImage(url: string | null | undefined) {
  if (!url || !NPS_HOST.test(url) || /[?&](max)?width=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}width=${NPS_IMAGE_WIDTH}`;
}
