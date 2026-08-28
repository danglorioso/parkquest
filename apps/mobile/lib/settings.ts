import AsyncStorage from '@react-native-async-storage/async-storage';
import { PARK_TYPES } from './parkTypes';

export type DefaultVisibility = 'public' | 'friends' | 'private';

const KEY = 'pq-default-visibility';
const FALLBACK: DefaultVisibility = 'public';

export async function getDefaultVisibility(): Promise<DefaultVisibility> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw === 'public' || raw === 'friends' || raw === 'private' ? raw : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export async function setDefaultVisibility(v: DefaultVisibility): Promise<void> {
  try { await AsyncStorage.setItem(KEY, v); } catch { /* ignore */ }
}

// Which park designations the map + all-parks list start with enabled —
// user-configurable (Profile → Appearance), all types shown until changed.
const PARK_TYPES_KEY = 'pq-default-park-types';

export async function getDefaultParkTypes(): Promise<string[]> {
  const fallback = PARK_TYPES.map(t => t.key);
  try {
    const raw = await AsyncStorage.getItem(PARK_TYPES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(x => typeof x === 'string') ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function setDefaultParkTypes(keys: string[]): Promise<void> {
  try { await AsyncStorage.setItem(PARK_TYPES_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
}
