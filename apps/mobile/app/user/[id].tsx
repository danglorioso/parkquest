import {
  ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Alert, Pressable,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { BADGE_TIER_COLORS, type BadgeTier } from '@/lib/badges';
import { JournalTimeline, type JournalEntry } from '@/components/JournalTimeline';
import { PostCard, ReportSheet, type FeedPost } from '@/components/PostCard';
import { Avatar } from '@/components/Avatar';
import { BadgeInfoModal } from '@/components/BadgeInfoModal';
import { EmptyState } from '@/components/EmptyState';
import { STATIC as C, useColors } from '@/lib/palette';
import { emitUserBlocked } from '@/lib/blocking';

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
  const T = useColors();
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
            <ActivityIndicator color={T.primary} style={{ marginTop: 24, marginBottom: 16 }} />
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
                  <Avatar url={f.avatar_url} name={f.display_name ?? f.username} size={38} />
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
  const T = useColors();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<ProfileBadge | null>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showReportUserSheet, setShowReportUserSheet] = useState(false);
  const [reportedUser, setReportedUser] = useState(false);

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
    setToken(tok);
    try {
      const [res, postsRes] = await Promise.all([
        fetch(`${BASE}/api/profile/${id}`, {
          headers: { Authorization: `Bearer ${tok}` },
        }),
        fetch(`${BASE}/api/feed?author=${encodeURIComponent(id)}&limit=20`, {
          headers: { Authorization: `Bearer ${tok}` },
        }),
      ]);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProfile(await res.json());
      if (postsRes.ok) setPosts(await postsRes.json());
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
        Alert.alert(
          'Cancel request',
          `Cancel your friend request to ${profile.display_name ?? profile.username}?`,
          [
            { text: 'Keep', style: 'cancel' },
            { text: 'Cancel Request', style: 'destructive', onPress: async () => {
              setFriendBusy(true);
              const res = await fetch(`${BASE}/api/friends?userId=${profile.clerk_user_id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${tok}` },
              });
              if (res.ok) setProfile(p => p ? { ...p, friendship_status: 'none' } : p);
              setFriendBusy(false);
            }},
          ]
        );
        setFriendBusy(false);
        return;

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

  const handleBlock = () => {
    if (!profile || blockBusy) return;
    const name = profile.display_name ?? profile.username;
    Alert.alert(
      'Block user',
      `${name} won't be able to see your posts or contact you, and you won't see theirs. This also flags them for review.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block', style: 'destructive', onPress: async () => {
            setBlockBusy(true);
            const tok = await getToken();
            if (!tok) { setBlockBusy(false); return; }
            const res = await fetch(`${BASE}/api/blocks`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: profile.clerk_user_id }),
            });
            setBlockBusy(false);
            if (res.ok) {
              emitUserBlocked(profile.clerk_user_id);
              router.back();
            } else {
              Alert.alert('Error', 'Could not block this user. Please try again.');
            }
          },
        },
      ]
    );
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
  const isPending = profile?.friendship_status === 'pending_sent';
  const displayName = profile?.display_name ?? profile?.username ?? 'Explorer';
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: profile ? (profile.display_name ?? `@${profile.username}`) : 'Profile',
          headerRight: (!isOwnProfile && profile) ? () => (
            <View style={{ position: 'relative' }}>
              {showProfileMenu && (
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowProfileMenu(false)} />
              )}
              <TouchableOpacity
                onPress={() => setShowProfileMenu(v => !v)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={showProfileMenu ? T.primary : C.inkMute} />
              </TouchableOpacity>
              {showProfileMenu && (
                <View style={styles.profileMenu}>
                  <TouchableOpacity
                    style={styles.profileMenuItem}
                    disabled={blockBusy}
                    onPress={() => { setShowProfileMenu(false); handleBlock(); }}
                  >
                    <Text style={[styles.profileMenuItemText, { color: C.liked }]}>Block user</Text>
                  </TouchableOpacity>
                  <View style={styles.profileMenuDivider} />
                  <TouchableOpacity
                    style={styles.profileMenuItem}
                    disabled={reportedUser}
                    onPress={() => { setShowProfileMenu(false); setShowReportUserSheet(true); }}
                  >
                    <Text style={[styles.profileMenuItemText, { color: reportedUser ? C.inkMute : C.liked }]}>
                      {reportedUser ? 'Reported' : 'Report user'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : undefined,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={T.primary} />
          </View>
        ) : notFound || !profile ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              icon="person-outline"
              title="User not found"
              subtitle="This profile doesn't exist."
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <View style={styles.hero}>
              <Avatar url={profile.avatar_url} name={displayName} size={88} style={styles.avatar} />

              <Text style={styles.name}>{displayName}</Text>
              {profile.username ? (
                <Text style={styles.handle}>@{profile.username}</Text>
              ) : null}

              {joinedDate ? (
                <View style={styles.rankRow}>
                  <Text style={styles.joinText}>Joined {joinedDate}</Text>
                </View>
              ) : null}

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
                    isFriend
                      ? styles.friendButtonSecondary
                      : isPending
                        ? [styles.friendButtonOutline, { borderColor: T.primary }]
                        : { backgroundColor: T.primary },
                    friendBusy && { opacity: 0.6 },
                  ]}
                  onPress={handleFriendAction}
                  disabled={friendBusy}
                  activeOpacity={0.8}
                >
                  {friendBusy ? (
                    <ActivityIndicator size="small" color={isFriend ? C.inkMute : isPending ? T.primary : C.onPrimary} />
                  ) : (
                    <>
                      <Ionicons
                        name={friendButtonIcon()}
                        size={16}
                        color={isFriend ? C.inkSoft : isPending ? T.primary : C.onPrimary}
                        style={{ marginRight: 7 }}
                      />
                      <Text
                        style={[
                          styles.friendButtonText,
                          isFriend && styles.friendButtonTextSecondary,
                          isPending && { color: T.primary },
                        ]}
                      >
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
                    style={{ width: '100%', height: 220, borderRadius: 14 }}
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

            {/* Recent posts — same cards as the feed */}
            {token && posts.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader icon="newspaper-outline" title="RECENT POSTS" />
                {posts.map(p => (
                  <PostCard
                    key={p.id}
                    post={p}
                    token={token}
                    myUserId={me?.id ?? ''}
                    myAvatarUrl={me?.imageUrl}
                    myName={me?.fullName ?? me?.username}
                    onDelete={pid => setPosts(prev => prev.filter(x => x.id !== pid))}
                    onParkPress={code => router.push(`/parks/${code}` as never)}
                  />
                ))}
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
          <BadgeInfoModal
            badge={{
              id: selectedBadge.badge_id,
              name: selectedBadge.name,
              emoji: selectedBadge.emoji,
              tier: selectedBadge.tier,
              earned_at: selectedBadge.earned_at,
            }}
            onClose={() => setSelectedBadge(null)}
          />
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

        {showReportUserSheet && token && profile ? (
          <ReportSheet
            token={token}
            targetType="user"
            targetId={profile.clerk_user_id}
            onClose={() => setShowReportUserSheet(false)}
            onSubmitted={() => { setReportedUser(true); Alert.alert('Report submitted', "Thanks — we'll review this."); }}
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
  profileMenu: {
    position: 'absolute', top: 30, right: 0, zIndex: 100,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.hairline,
    borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
    minWidth: 150, overflow: 'hidden',
  },
  profileMenuItem: { paddingHorizontal: 14, paddingVertical: 11 },
  profileMenuItemText: { fontSize: 14, fontWeight: '600' },
  profileMenuDivider: { height: 0.5, backgroundColor: C.hairline },
  hero: {
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  avatar: {
    borderWidth: 2,
    borderColor: 'rgba(27,26,22,0.12)',
    marginBottom: 14,
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
    fontSize: 13,
    color: C.inkMute,
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
    fontSize: 13,
    color: C.inkMute,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 13,
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
    marginBottom: 28,
  },
  friendButton: {
    borderRadius: 10,
    paddingVertical: 13,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendButtonSecondary: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  friendButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  friendButtonText: {
    color: C.onPrimary,
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
    fontSize: 13,
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
    borderRadius: 14,
  },
  mapEmptyText: {
    fontSize: 13,
    color: C.inkMute,
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.visited,
    borderWidth: 2,
    borderColor: C.onPrimary,
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
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    lineHeight: 14,
  },
  badgeChipTier: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  friendRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  friendRowHandle: {
    fontSize: 13,
    color: C.inkMute,
    marginTop: 1,
  },
});
