import { DeviceEventEmitter } from 'react-native';

// Emitted right after a successful block so any screen holding posts/comments
// in local state (feed, profile, etc.) can filter the blocked user out
// immediately, without waiting on a refetch.
const BLOCKED_EVENT = 'pq-user-blocked';

export function emitUserBlocked(userId: string): void {
  DeviceEventEmitter.emit(BLOCKED_EVENT, userId);
}

export function onUserBlocked(cb: (userId: string) => void) {
  const sub = DeviceEventEmitter.addListener(BLOCKED_EVENT, cb);
  return () => sub.remove();
}
