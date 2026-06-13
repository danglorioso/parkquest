import {
  ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { BADGE_MAP, BADGE_TIER_COLORS, type BadgeTier } from '@/lib/badges';
import { JournalTimeline, type JournalEntry } from '@/components/JournalTimeline';

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

interface ProfileBadge {
  badge_id: string;
  earned_at: string | null;
  name: string;
  emoji: string;
  tier: string;
}

interface VisitedPark {
  park_code: string;
  name: string;
  states: string;
  latitude: string | null;
  longitude: string | null;
  visited_date: string | null;
}

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
  badges: ProfileBadge[];
  visited_parks: VisitedPark[];
  journal?: JournalEntry[];
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

function tierColors(tier: string) {
  return BADGE_TIER_COLORS[tier as BadgeTier] ?? BADGE_TIER_COLORS.bronze;
}

// ── Section header — icon + mono kicker, matches web profile sections ─────────

function SectionHeader({ icon, title }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={13} color={C.inkMute} />
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

// ── Badge detail modal — emoji, tier, how-to-earn, earned date ─────────────────

function BadgeInfoModal({ badge, onClose }: { badge: ProfileBadge; onClose: () => void }) {
  const def = BADGE_MAP.get(badge.badge_id);
  const t = tierColors(badge.tier);
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.badgeOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.badgeModal}>
          <TouchableOpacity onPress={onClose} style={styles.badgeModalClose}>
            <Ionicons name="close" size={16} color={C.inkMute} />
          </TouchableOpacity>

          <View style={[styles.badgeModalEmoji, { backgroundColor: t.fill + '14', borderColor: t.fill + '44' }]}>
            <Text style={{ fontSize: 36 }}>{badge.emoji}</Text>
          </View>
          <Text style={styles.badgeModalName}>{badge.name}</Text>
          <Text style={[styles.badgeModalTier, { color: t.fill }]}>{badge.tier}</Text>

          {def ? (
            <View style={styles.badgeModalHow}>
              <Text style={styles.badgeModalHowKicker}>HOW TO EARN</Text>
              <Text style={styles.badgeModalHowText}>{def.description}</Text>
            </View>
          ) : null}

          {earnedDate ? (
            <Text style={styles.badgeModalEarned}>
              Earned on <Text style={{ fontWeight: '700', color: C.inkSoft }}>{earnedDate}</Text>
            </Text>
          ) : (
            <Text style={[styles.badgeModalEarned, { fontStyle: 'italic' }]}>Not yet earned</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

interface FriendRow {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

function FriendListModal({ userId, onClose, onNavigate }: {
  userId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const { getToken } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const tok = await getToken();
        const res = await fetch(`${BASE}/api/friends?userId=${userId}&type=friends`, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
        if (res.ok) setFriends(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.friendsSheet}>
          <View style={styles.friendsHandle} />
          <Text style={styles.friendsTitle}>
            {loading ? 'Friends' : `${friends.length} ${friends.length === 1 ? 'Friend' : 'Friends'}`}
          </Text>
          {loading ? (
            <ActivityIndicator color={C.primary} style={{ marginTop: 24, marginBottom: 16 }} />
          ) : friends.length === 0 ? (
            <Text style={styles.friendsEmpty}>No friends yet</Text>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={f => f.clerk_user_id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  style={styles.friendRow}
                  onPress={() => onNavigate(f.clerk_user_id)}
                  activeOpacity={0.7}
                >
                  {f.avatar_url ? (
                    <Image source={{ uri: f.avatar_url }} style={styles.friendAvatar} />
                  ) : (
                    <View style={[styles.friendAvatar, styles.friendAvatarFallback]}>
                      <Text style={styles.friendAvatarInitials}>
                        {(f.display_name ?? f.username ?? '?').trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.friendRowName}>{f.display_name ?? f.username}</Text>
                    {f.display_name ? <Text style={styles.friendRowHandle}>@{f.username}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.inkMute} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.friendRowSep} />}
            />
          )}
          <View style={{ height: 24 }} />
        </View>
      </View>
    </Modal>
  );
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
  const [selectedBadge, setSelectedBadge] = useState<ProfileBadge | null>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);

  const isOwnProfile = me?.id === id;

  // Unique visited parks with coords, for the mini map
  const mapParks = useMemo(() => {
    const seen = new Set<string>();
    return (profile?.visited_parks ?? [])
      .filter(v => {
        if (!v.latitude || !v.longitude || seen.has(v.park_code)) return false;
        seen.add(v.park_code);
        return true;
      })
      .map(v => ({
        park_code: v.park_code,
        name: v.name,
        lat: parseFloat(v.latitude!),
        lng: parseFloat(v.longitude!),
      }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [profile]);

  const mapRegion = useMemo(() => {
    if (mapParks.length === 0) return undefined;
    const lats = mapParks.map(p => p.lat);
    const lngs = mapParks.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 4),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 4),
    };
  }, [mapParks]);

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
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

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
                {joinedDate ? (
                  <Text style={styles.joinText}>Joined {joinedDate}</Text>
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
              <TouchableOpacity
                style={styles.statCell}
                onPress={() => setShowFriendsModal(true)}
                activeOpacity={0.7}
                disabled={profile.friend_count === 0}
              >
                <Text style={styles.statValue}>{profile.friend_count}</Text>
                <Text style={styles.statLabel}>FRIENDS</Text>
              </TouchableOpacity>
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

            {/* Visited parks map — only when the API returns the field, so a
                stale deployment doesn't show a misleading empty state */}
            {profile.visited_parks ? (
            <View style={styles.section}>
              <SectionHeader icon="map-outline" title="VISITED PARKS" />
              <View style={styles.mapCard}>
                {mapParks.length > 0 ? (
                  <MapView
                    style={{ width: '100%', height: 220 }}
                    provider={PROVIDER_DEFAULT}
                    initialRegion={mapRegion}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                  >
                    {mapParks.map(p => (
                      <Marker
                        key={p.park_code}
                        coordinate={{ latitude: p.lat, longitude: p.lng }}
                        title={p.name}
                        tracksViewChanges={false}
                        onCalloutPress={() => router.push(`/parks/${p.park_code}` as never)}
                      >
                        <View style={styles.markerDot} />
                      </Marker>
                    ))}
                  </MapView>
                ) : (
                  <View style={styles.mapEmpty}>
                    <Ionicons name="map-outline" size={22} color={C.inkMute} />
                    <Text style={styles.mapEmptyText}>No park visits yet</Text>
                  </View>
                )}
              </View>
            </View>
            ) : null}

            {/* Badges earned */}
            {profile.badges?.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader icon="ribbon-outline" title="BADGES EARNED" />
                <View style={styles.badgeWrap}>
                  {profile.badges.map(b => {
                    const t = tierColors(b.tier);
                    return (
                      <TouchableOpacity
                        key={b.badge_id}
                        onPress={() => setSelectedBadge(b)}
                        activeOpacity={0.7}
                        style={[styles.badgeChip, {
                          backgroundColor: t.fill + '14',
                          borderColor: t.fill + '33',
                        }]}
                      >
                        <Text style={{ fontSize: 15 }}>{b.emoji}</Text>
                        <View>
                          <Text style={styles.badgeChipName}>{b.name}</Text>
                          <Text style={[styles.badgeChipTier, { color: t.fill }]}>{b.tier}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Journal timeline */}
            {profile.journal && profile.journal.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader icon="journal-outline" title="JOURNAL" />
                <JournalTimeline entries={profile.journal ?? []} />
              </View>
            ) : null}

          </ScrollView>
        )}

        {selectedBadge ? (
          <BadgeInfoModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
        ) : null}

        {showFriendsModal && profile ? (
          <FriendListModal
            userId={profile.clerk_user_id}
            onClose={() => setShowFriendsModal(false)}
            onNavigate={(friendId) => {
              setShowFriendsModal(false);
              router.push(`/user/${friendId}` as never);
            }}
          />
        ) : null}
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

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionHeaderText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 1.4,
  },

  // Visited parks map
  mapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: '#CECDBC',
  },
  mapEmpty: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.surface,
  },
  mapEmptyText: {
    fontSize: 13,
    color: C.inkMute,
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2F7A4A',
    borderWidth: 2,
    borderColor: '#FFFBF1',
  },

  // Badge chips
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeChipName: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.ink,
    lineHeight: 14,
  },
  badgeChipTier: {
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Badge detail modal — light theme, matches web profile BadgeModal
  badgeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  badgeModal: {
    backgroundColor: C.bg,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingVertical: 32,
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  badgeModalClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    padding: 4,
  },
  badgeModalEmoji: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badgeModalName: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  badgeModalTier: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 5,
    marginBottom: 20,
  },
  badgeModalHow: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  badgeModalHowKicker: {
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: C.inkMute,
    marginBottom: 6,
  },
  badgeModalHowText: {
    fontSize: 13.5,
    color: C.inkSoft,
    lineHeight: 21,
  },
  badgeModalEarned: {
    fontSize: 12,
    color: C.inkMute,
    textAlign: 'center',
  },

  // Friends list bottom sheet
  friendsSheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  friendsHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.hairline,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  friendsTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  friendsEmpty: {
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  friendRowSep: {
    height: 0.5,
    backgroundColor: C.hairline,
  },
  friendAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  friendAvatarFallback: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarInitials: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFBF1',
  },
  friendRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  friendRowHandle: {
    fontSize: 12,
    color: C.inkMute,
    marginTop: 1,
  },
});
