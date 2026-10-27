'use client';

import { useEffect, useState } from 'react';

// Shown until /api/parks/count answers (and on the server render). Keep it
// current when convenient, but a stale value here only flashes for a moment —
// the real count comes from the parks table, so redesignations need no deploy.
export const NATIONAL_PARK_COUNT_FALLBACK = 64;

let cached: number | null = null;
let inflight: Promise<number | null> | null = null;

function loadCount(): Promise<number | null> {
  inflight ??= fetch('/api/parks/count')
    .then(r => (r.ok ? r.json() : null))
    .then(b => (typeof b?.national_parks === 'number' && b.national_parks > 0 ? b.national_parks : null))
    .catch(() => null)
    .then(n => {
      if (n == null) inflight = null; // let a later mount retry
      else cached = n;
      return n;
    });
  return inflight;
}

/** Live number of National Parks (rows with is_national_park), for copy like "all 64". */
export function useNationalParkCount(): number {
  const [count, setCount] = useState(cached ?? NATIONAL_PARK_COUNT_FALLBACK);
  useEffect(() => {
    let alive = true;
    loadCount().then(n => { if (alive && n != null) setCount(n); });
    return () => { alive = false; };
  }, []);
  return count;
}
