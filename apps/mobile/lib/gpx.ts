import { distanceBetween, encodePolyline, type LatLng } from '@/lib/hikeStats';

export interface ParsedGpx {
  distanceMeters: number;
  durationSeconds: number | null;
  elevationGainMeters: number | null;
  routePolyline: string;
}

// Regex-based GPX <trkpt> extraction — GPX's track-point shape is regular
// enough that pulling in a full XML parser dependency isn't worth it.
// Handles lat/lon in either attribute order.
export function parseGpx(xml: string): ParsedGpx | null {
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
  const points: LatLng[] = [];
  const elevations: (number | null)[] = [];
  const times: (number | null)[] = [];

  let match: RegExpExecArray | null;
  while ((match = trkptRegex.exec(xml))) {
    const [, attrs, body] = match;
    const lat = attrs.match(/lat="(-?[\d.]+)"/)?.[1];
    const lon = attrs.match(/lon="(-?[\d.]+)"/)?.[1];
    if (!lat || !lon) continue;
    points.push({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
    const ele = body.match(/<ele>([-\d.]+)<\/ele>/)?.[1];
    elevations.push(ele ? parseFloat(ele) : null);
    const time = body.match(/<time>([^<]+)<\/time>/)?.[1];
    times.push(time ? new Date(time).getTime() : null);
  }

  if (points.length < 2) return null;

  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) distanceMeters += distanceBetween(points[i - 1], points[i]);

  let elevationGainMeters: number | null = null;
  if (elevations.every(e => e != null)) {
    elevationGainMeters = 0;
    for (let i = 1; i < elevations.length; i++) {
      const gain = elevations[i]! - elevations[i - 1]!;
      if (gain > 0) elevationGainMeters += gain;
    }
  }

  let durationSeconds: number | null = null;
  const firstTime = times.find(t => t != null);
  const lastTime = [...times].reverse().find(t => t != null);
  if (firstTime != null && lastTime != null && lastTime > firstTime) {
    durationSeconds = Math.round((lastTime - firstTime) / 1000);
  }

  // Downsample very dense tracks — keeps the stored polyline and the map
  // render reasonable without losing the route's shape.
  const MAX_POINTS = 500;
  const sampled = points.length <= MAX_POINTS
    ? points
    : points.filter((_, i) => i % Math.ceil(points.length / MAX_POINTS) === 0 || i === points.length - 1);

  return {
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
    routePolyline: encodePolyline(sampled),
  };
}
