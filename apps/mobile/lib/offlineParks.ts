import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { ParkDetail, NpsData } from './api';

// Same AsyncStorage-blob + DeviceEventEmitter shape as drafts.ts, applied to
// the full parks list so Parks/Map tabs can fall back to it when offline.
const CACHE_KEY = 'pq-parks-offline-cache';
const CHANGE_EVENT = 'pq-parks-offline-changed';

export interface ParksCache {
  parks: ParkDetail[];
  fetchedAt: string; // ISO
}

export async function loadOfflineParks(): Promise<ParksCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveOfflineParks(parks: ParkDetail[]): Promise<void> {
  const cache: ParksCache = { parks, fetchedAt: new Date().toISOString() };
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  DeviceEventEmitter.emit(CHANGE_EVENT);
}

export function onOfflineParksChanged(cb: () => void) {
  const sub = DeviceEventEmitter.addListener(CHANGE_EVENT, cb);
  return () => sub.remove();
}

// ── Full park detail (NPS) cache ────────────────────────────────────────────────
// Separate blob/key from the base parks list above — deliberately kept apart so
// that the silent background refreshes map.tsx/parks/index.tsx already do against
// the lightweight `/api/parks` list (just the base ParkDetail fields) never clobber
// this richer cache, which is only ever written by the explicit "download for
// offline" action (it requires the much heavier bulk NPS fetch + image prefetch).
// Without this split, any ordinary tab visit while online would silently wipe out
// a user's downloaded gallery/trail/hours/fees data with an empty map.
const NPS_CACHE_KEY = 'pq-parks-nps-offline-cache';
const NPS_CHANGE_EVENT = 'pq-parks-nps-offline-changed';

export interface ParksNpsCache {
  npsByCode: Record<string, NpsData>;
  fetchedAt: string; // ISO
}

export async function loadOfflineParksNps(): Promise<ParksNpsCache | null> {
  try {
    const raw = await AsyncStorage.getItem(NPS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveOfflineParksNps(npsByCode: Record<string, NpsData>): Promise<void> {
  const cache: ParksNpsCache = { npsByCode, fetchedAt: new Date().toISOString() };
  try { await AsyncStorage.setItem(NPS_CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  DeviceEventEmitter.emit(NPS_CHANGE_EVENT);
}

export function onOfflineParksNpsChanged(cb: () => void) {
  const sub = DeviceEventEmitter.addListener(NPS_CHANGE_EVENT, cb);
  return () => sub.remove();
}

// Downloads the actual image bytes (cover photos + every gallery image) into
// expo-image's disk cache so they render offline too — caching the URL strings in
// the JSON blobs above isn't enough on its own, since nothing has actually fetched
// those bytes until something tries to render that exact URL.
export async function prefetchParkImages(
  parks: ParkDetail[],
  npsByCode: Record<string, NpsData>,
): Promise<void> {
  const urls = new Set<string>();
  for (const p of parks) {
    if (p.image_url) urls.add(p.image_url);
  }
  for (const nps of Object.values(npsByCode)) {
    for (const img of nps.images ?? []) {
      if (img.url) urls.add(img.url);
    }
  }
  if (urls.size === 0) return;
  try {
    await ExpoImage.prefetch([...urls], 'disk');
  } catch { /* best-effort — a few failed images shouldn't fail the whole download */ }
}
