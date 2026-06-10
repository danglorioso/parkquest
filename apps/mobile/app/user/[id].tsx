import {
  ActivityIndicator, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#F2EBDB',
  surface:    '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:        '#1B1A16',
  inkSoft:    '#3C3A33',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  primary:    '#1F3D2E',
  accent:     '#C56B3D',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

interface UserProfile {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string | null;
  parks_visited: number;
  friend_count: number;
  friendship_status: FriendshipStatus;
}

function explorerRank(n: number): string {
  if (n >= 63) return 'NATIONAL LEGEND';
  if (n >= 50) return 'PIONEER';
  if (n >= 30) return 'TRAILBLAZER';
  if (n >= 15) return 'RANGER';
  if (n >= 5)  return 'EXPLORER';
  if (n >= 1)  return 'INITIATE';
  return 'TRAILHEAD';
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const { user: me } = useUser();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);

  const isOwnProfile = me?.id === id;

  const loadProfile = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) { setLoading(false); return; }
    try {
      const res = await fetch(`${BASE}/api/profile/${id}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProfile(await res.json());
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleFriendAction = async () => {
    if (!profile || friendBusy) return;
    const tok = await getToken();
    if (!tok) return;
    setFriendBusy(true);

    try {
      const status = profile.friendship_status;

      if (status === 'none') {
        const res = await fetch(`${BASE}/api/friends`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: profile.clerk_user_id }),
        });
        if (res.ok) setProfile(p => p ? { ...p, friendship_status: 'pending_sent' } : p);

      } else if (status === 'pending_sent') {
        const res = await fetch(`${BASE}/api/friends?userId=${profile.clerk_user_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (res.ok) setProfile(p => p ? { ...p, friendship_status: 'none' } : p);

      } else if (status === 'pending_received') {
        Alert.alert(
          'Friend request',
          `${profile.display_name ?? profile.username} sent you a friend request.`,
          [
            { text: 'Decline', style: 'destructive', onPress: async () => {
              // We don't have friendship_id here, so just navigate to friends page
              router.push('/(tabs)/profile/friends' as never);
            }},
            { text: 'Accept', onPress: async () => {
              router.push('/(tabs)/profile/friends' as never);
            }},
          ]
        );
        setFriendBusy(false);
        return;

      } else if (status === 'accepted') {
        Alert.alert(
          'Remove friend',
          `Remove ${profile.display_name ?? profile.username} from your friends?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: async () => {
              setFriendBusy(true);
              const res = await fetch(`${BASE}/api/friends?userId=${profile.clerk_user_id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${tok}` },
              });
              if (res.ok) setProfile(p => p ? {
                ...p,
                friendship_status: 'none',
                friend_count: Math.max(0, p.friend_count - 1),
              } : p);
              setFriendBusy(false);
            }},
          ]
        );
        setFriendBusy(false);
        return;
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setFriendBusy(false);
    }
  };

  const friendButtonLabel = () => {
    switch (profile?.friendship_status) {
      case 'accepted':       return 'Friends';
      case 'pending_sent':   return 'Request sent';
      case 'pending_received': return 'Respond to request';
      default:               return 'Add friend';
    }
  };

  const friendButtonIcon = (): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (profile?.friendship_status) {
      case 'accepted':         return 'people';
      case 'pending_sent':     return 'time-outline';
      case 'pending_received': return 'person-add-outline';
      default:                 return 'person-add-outline';
    }
  };

  const isFriend = profile?.friendship_status === 'accepted';
  const displayName = profile?.display_name ?? profile?.username ?? 'Explorer';
  const initials = displayName[0]?.toUpperCase() ?? '?';
  const joinYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;

  return (
    <>
      <Stack.Screen options={{ title: profile ? (profile.display_name ?? `@${profile.username}`) : 'Profile' }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : notFound || !profile ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Ionicons name="person-outline" size={40} color={C.inkMute} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>User not found</Text>
            <Text style={{ fontSize: 13, color: C.inkMute }}>This profile doesn't exist.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <View style={styles.hero}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}

              <Text style={styles.name}>{displayName}</Text>
              {profile.username ? (
                <Text style={styles.handle}>@{profile.username}</Text>
              ) : null}

              <View style={styles.rankRow}>
                {joinYear ? (
                  <Text style={styles.joinText}>Joined {joinYear}</Text>
                ) : null}
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{explorerRank(profile.parks_visited)}</Text>
                </View>
              </View>

              {profile.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : null}
            </View>

            {/* Stats strip */}
            <View style={styles.statsStrip}>
              <View style={styles.statCell}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                  <Text style={styles.statValue}>{profile.parks_visited}</Text>
                  <Text style={styles.statSub}>/63</Text>
                </View>
                <Text style={styles.statLabel}>PARKS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{profile.friend_count}</Text>
                <Text style={styles.statLabel}>FRIENDS</Text>
              </View>
            </View>

            {/* Friend action */}
            {!isOwnProfile ? (
              <View style={styles.section}>
                <TouchableOpacity
                  style={[
                    styles.friendButton,
                    isFriend && styles.friendButtonSecondary,
                    friendBusy && { opacity: 0.6 },
                  ]}
                  onPress={handleFriendAction}
                  disabled={friendBusy}
                  activeOpacity={0.8}
                >
                  {friendBusy ? (
                    <ActivityIndicator size="small" color={isFriend ? C.inkMute : '#FFFBF1'} />
                  ) : (
                    <>
                      <Ionicons
                        name={friendButtonIcon()}
                        size={16}
                        color={isFriend ? C.inkSoft : '#FFFBF1'}
                        style={{ marginRight: 7 }}
                      />
                      <Text style={[styles.friendButtonText, isFriend && styles.friendButtonTextSecondary]}>
                        {friendButtonLabel()}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(27,26,22,0.12)',
    marginBottom: 14,
  },
  avatarFallback: {
    backgroundColor: '#F7F0DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 30,
    fontWeight: '800',
    color: C.inkMute,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  handle: {
    fontSize: 14,
    color: C.inkMute,
    marginTop: 3,
  },
  rankRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  joinText: {
    fontSize: 11,
    color: C.inkMute,
  },
  rankBadge: {
    backgroundColor: C.primary + '18',
    borderRadius: 100,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rankText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: 1.2,
  },
  bio: {
    fontSize: 13.5,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingVertical: 16,
    marginBottom: 16,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
  },
  statSub: {
    fontSize: 12,
    color: C.inkMute,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 1.1,
    marginTop: 2,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: C.hairline,
    marginVertical: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  friendButton: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendButtonSecondary: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  friendButtonText: {
    color: '#FFFBF1',
    fontWeight: '700',
    fontSize: 14,
  },
  friendButtonTextSecondary: {
    color: C.inkSoft,
  },
});
