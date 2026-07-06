import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { FeedPost } from '@/components/PostCard';

// Same AsyncStorage-blob + DeviceEventEmitter shape as offlineParks.ts, applied
// to the last-seen feed page so the Feed tab can fall back to it when offline.
const CACHE_KEY = 'pq-feed-offline-cache';
const CHANGE_EVENT = 'pq-feed-offline-changed';

export interface FeedCache {
  posts: FeedPost[];
  fetchedAt: string; // ISO
}

export async function loadOfflineFeed(): Promise<FeedCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveOfflineFeed(posts: FeedPost[]): Promise<void> {
  const cache: FeedCache = { posts, fetchedAt: new Date().toISOString() };
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  DeviceEventEmitter.emit(CHANGE_EVENT);
}

export function onOfflineFeedChanged(cb: () => void) {
  const sub = DeviceEventEmitter.addListener(CHANGE_EVENT, cb);
  return () => sub.remove();
}
