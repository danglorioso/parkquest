import AsyncStorage from '@react-native-async-storage/async-storage';

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
