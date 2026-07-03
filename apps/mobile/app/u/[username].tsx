import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState } from '@/components/EmptyState';
import { STATIC, useColors } from '@/lib/palette';

// Universal Link entry point: https://parkquest.me/u/<username> opens here
// when the app is installed. Resolves the username to a Clerk user id and
// forwards to the regular profile screen.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function UserShareLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const T = useColors();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!username) { setFailed(true); return; }
    let cancelled = false;
    fetch(`${BASE}/api/users/${encodeURIComponent(username)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data?.clerk_user_id) {
          router.replace(`/user/${data.clerk_user_id}` as never);
        } else {
          setFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [username, router]);

  return (
    <View style={styles.screen}>
      {failed ? (
        <EmptyState
          icon="person-outline"
          title="Profile not found"
          subtitle={`@${username ?? 'unknown'} doesn't seem to exist.`}
          action={{ label: 'Go to feed', onPress: () => router.replace('/(tabs)/feed' as never) }}
        />
      ) : (
        <ActivityIndicator color={T.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: STATIC.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
