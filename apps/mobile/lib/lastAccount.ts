import * as SecureStore from 'expo-secure-store';

// Remembers the account + method last used to sign in on this device, so the
// landing screen can offer a one-tap "Continue as ..." instead of making the
// user guess whether they registered with a password or Apple/Google — Clerk
// sessions expire after 7 days and drop the user back to a blank sign-in.

export type AuthStrategy = 'password' | 'google' | 'apple';

export interface LastAccount {
  userId: string;
  strategy: AuthStrategy;
  name: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
}

const KEY = 'pq_last_account';

export async function getLastAccount(): Promise<LastAccount | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as LastAccount) : null;
  } catch {
    return null;
  }
}

// Call the instant a session is created — the strategy used is only known at
// the sign-in call site, Clerk's Session resource doesn't expose it after
// the fact (an account can have a password AND linked Apple/Google at once).
export async function markLastAuthStrategy(strategy: AuthStrategy, email?: string | null) {
  try {
    const existing = await getLastAccount();
    const next: LastAccount = {
      userId: existing?.userId ?? '',
      strategy,
      name: existing?.name ?? null,
      username: existing?.username ?? null,
      email: email ?? existing?.email ?? null,
      avatarUrl: existing?.avatarUrl ?? null,
    };
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  } catch { /* best-effort — quick-resume is a convenience, not a requirement */ }
}

// Call whenever a live session is confirmed — refreshes the display profile
// (name/avatar/username), but never clobbers a strategy already recorded by
// markLastAuthStrategy above.
export async function syncLastAccountProfile(profile: {
  userId: string; name: string | null; username: string | null;
  email: string | null; avatarUrl: string | null; fallbackStrategy: AuthStrategy;
}) {
  try {
    const existing = await getLastAccount();
    const next: LastAccount = {
      userId: profile.userId,
      strategy: existing?.strategy ?? profile.fallbackStrategy,
      name: profile.name,
      username: profile.username,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    };
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  } catch { /* best-effort */ }
}

export async function clearLastAccount() {
  try { await SecureStore.deleteItemAsync(KEY); } catch { /* best-effort */ }
}
