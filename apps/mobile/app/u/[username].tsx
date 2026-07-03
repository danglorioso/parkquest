import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Universal Link entry point: https://parkquest.me/u/<username> opens here
// when the app is installed. Resolves the username to a Clerk user id and
// forwards to the regular profile screen.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const C = {
  bg:      '#F2EBDB',
  ink:     '#1B1A16',
  inkMute: '#7A746A',
  primary: '#1F3D2E',
};

export default function UserShareLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
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
        <>
          <Text style={styles.title}>Profile not found</Text>
          <Text style={styles.body}>@{username ?? 'unknown'} doesn't seem to exist.</Text>
          <Text style={styles.link} onPress={() => router.replace('/(tabs)/feed' as never)}>
            Go to feed
          </Text>
        </>
      ) : (
        <ActivityIndicator color={C.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: '700', color: C.ink },
  body:  { fontSize: 13.5, color: C.inkMute, textAlign: 'center' },
  link:  { fontSize: 14, fontWeight: '700', color: C.primary, marginTop: 8, padding: 8 },
});
