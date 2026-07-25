// Formatting + polyline decoding shared by the GPX import step (log-visit
// wizard) and the route/stat display on visit detail + post cards.

export function fmtMiles(meters: number): string {
  return `${(meters / 1609.34).toFixed(meters >= 1609.34 * 10 ? 0 : 1)} mi`;
}

export function fmtElevationFt(meters: number): string {
  return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtPace(meters: number, seconds: number): string {
  if (meters <= 0) return '—';
  const paceSecPerMile = seconds / (meters / 1609.34);
  const m = Math.floor(paceSecPerMile / 60);
  const s = Math.round(paceSecPerMile % 60);
  return `${m}:${String(s).padStart(2, '0')} /mi`;
}

export interface LatLng { latitude: number; longitude: number; }

// Google's encoded polyline algorithm — Strava's `summary_polyline` uses it.
// No existing dependency in this codebase covers it; the algorithm is short
// enough to not warrant pulling one in.
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// Inverse of decodePolyline — used to store a GPX-imported route in the same
// route_polyline column Strava activities fill in.
export function encodePolyline(points: LatLng[]): string {
  let out = '';
  let prevLat = 0, prevLng = 0;

  const encodeValue = (v: number) => {
    v = v < 0 ? ~(v << 1) : (v << 1);
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  };

  for (const { latitude, longitude } of points) {
    const lat = Math.round(latitude * 1e5);
    const lng = Math.round(longitude * 1e5);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

// Haversine distance in meters.
export function distanceBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
