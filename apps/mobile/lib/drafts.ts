import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

// Single source of truth for the visit-draft storage schema, shared between the
// log-visit modal (reads/writes drafts) and the tab bar (just needs to know if any exist).
export const DRAFT_KEY = 'pq-visit-drafts';
export const MAX_DRAFTS = 5;
const CHANGE_EVENT = 'pq-drafts-changed';

export interface SavedDraft<T> {
  id: string;
  savedAt: string; // ISO
  parkName?: string;
  draft: T;
}

export async function loadRawDrafts<T>(): Promise<SavedDraft<T>[]> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function upsertRawDraft<T>(entry: SavedDraft<T>): Promise<void> {
  try {
    const rest = (await loadRawDrafts<T>()).filter(s => s.id !== entry.id);
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify([entry, ...rest].slice(0, MAX_DRAFTS)));
  } catch { /* ignore */ }
  DeviceEventEmitter.emit(CHANGE_EVENT);
}

export async function deleteRawDraft(id: string): Promise<void> {
  try {
    const rest = (await loadRawDrafts()).filter(s => s.id !== id);
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
  } catch { /* ignore */ }
  DeviceEventEmitter.emit(CHANGE_EVENT);
}

export async function hasDrafts(): Promise<boolean> {
  return (await loadRawDrafts()).length > 0;
}

export function onDraftsChanged(cb: () => void) {
  const sub = DeviceEventEmitter.addListener(CHANGE_EVENT, cb);
  return () => sub.remove();
}
