import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { ParkDetail } from './api';

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
