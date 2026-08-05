import {
  ActivityIndicator, Animated, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MenuView } from '@react-native-menu/menu';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import type { BadgeColors } from '@/lib/badges';
import { JournalTimeline, type JournalEntry } from '@/components/JournalTimeline';
import { PostCard, ReportSheet, type FeedPost } from '@/components/PostCard';
import { Avatar } from '@/components/Avatar';
import { AdminStar } from '@/components/AdminStar';
import { BadgeDetailModal, BadgePatch } from '@/components/BadgeDetailModal';
import { EmptyState } from '@/components/EmptyState';
import { AvatarLightbox } from '@/components/AvatarLightbox';
import { STATIC as C, useColors } from '@/lib/palette';
import { emitUserBlocked } from '@/lib/blocking';
import { showToast } from '@/lib/toast';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
// iOS system red — matches the native destructive text color these menu
// items already render in, so the leading SF Symbol matches instead of
// staying the same ink tone as the non-destructive rows.
const MENU_DESTRUCTIVE = '#FF3B30';

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

interface ProfileBadge {
  badge_id: string;
  earned_at: string | null;
  name: string;
  emoji: string;
  tier: string;
  colors?: BadgeColors | null;
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
  is_admin?: boolean;
  created_at: string | null;
  parks_visited: number;
  friend_count: number;
  friendship_status: FriendshipStatus;
  badges: ProfileBadge[];
  visited_parks: VisitedPark[];
  journal?: JournalEntry[];
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

  // Same dim-backdrop + slide-up entrance as the other sheets (LikersSheet,
  // ReportSheet) — this one used the bare "slide" animationType with no
  // dimming at all, so the sheet looked like it had nothing behind it.
  const slide = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, backdropOpacity]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.friendsBackdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View style={[styles.friendsSheet, { transform: [{ translateY: slide }] }]}>
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
        </Animated.View>
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
  const [avatarLightbox, setAvatarLightbox] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showReportUserSheet, setShowReportUserSheet] = useState(false);
  const [reportedUser, setReportedUser] = useState(false);
  const [postBlockReport, setPostBlockReport] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);

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

  // Incoming request — accept/decline inline, right on the profile.
  // POST /api/friends against someone who already sent us a pending request
  // auto-accepts it server-side, and DELETE clears the pending row, so
  // neither needs the friendship_id (which this screen doesn't have).
  const handleAcceptRequest = async () => {
    if (!profile || friendBusy) return;
    const tok = await getToken();
    if (!tok) return;
    setFriendBusy(true);
    try {
      const res = await fetch(`${BASE}/api/friends`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.clerk_user_id }),
      });
      if (res.ok) {
        setProfile(p => p ? { ...p, friendship_status: 'accepted', friend_count: p.friend_count + 1 } : p);
        showToast(`You and ${profile.display_name ?? profile.username} are now friends`);
      } else {
        Alert.alert('Error', 'Could not accept the request. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setFriendBusy(false);
    }
  };

  const handleDeclineRequest = async () => {
    if (!profile || friendBusy) return;
    const tok = await getToken();
    if (!tok) return;
    setFriendBusy(true);
    try {
      const res = await fetch(`${BASE}/api/friends?userId=${profile.clerk_user_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        setProfile(p => p ? { ...p, friendship_status: 'none' } : p);
      } else {
        Alert.alert('Error', 'Could not decline the request. Please try again.');
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
      `${name} won't be able to see your posts or contact you, and you won't see theirs.`,
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
              Alert.alert(
                'User blocked',
                `Would you like to also report ${name}?`,
                [
                  { text: 'Not now', style: 'cancel', onPress: () => router.back() },
                  { text: 'Report', onPress: () => { setPostBlockReport(true); setShowReportUserSheet(true); } },
                ]
              );
            } else {
              Alert.alert('Error', 'Could not block this user. Please try again.');
            }
          },
        },
      ]
    );
  };

  // pending_received renders its own accept/decline pair below, so these
  // only cover the single-button states.
  const friendButtonLabel = () => {
    switch (profile?.friendship_status) {
      case 'accepted':       return 'Friends';
      case 'pending_sent':   return 'Request sent';
      default:               return 'Add friend';
    }
  };

  const friendButtonIcon = (): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (profile?.friendship_status) {
      case 'accepted':         return 'people';
      case 'pending_sent':     return 'time-outline';
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
            <MenuView
              onOpenMenu={() => setShowProfileMenu(true)}
              onCloseMenu={() => setShowProfileMenu(false)}
              onPressAction={({ nativeEvent }) => {
                switch (nativeEvent.event) {
                  case 'block':
                    handleBlock();
                    break;
                  case 'report':
                    setPostBlockReport(false);
                    setShowReportUserSheet(true);
                    break;
                }
              }}
              actions={[
                { id: 'block', title: 'Block user', image: 'person.crop.circle.badge.xmark', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true, disabled: blockBusy } },
                { id: 'report', title: reportedUser ? 'Reported' : 'Report user', image: 'flag', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true, disabled: reportedUser } },
              ]}
            >
              <TouchableOpacity
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={showProfileMenu ? T.primary : C.inkMute} />
              </TouchableOpacity>
            </MenuView>
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
              <TouchableOpacity
                activeOpacity={profile.avatar_url ? 0.85 : 1}
                disabled={!profile.avatar_url}
                onPress={() => setAvatarLightbox(true)}
              >
                <Avatar url={profile.avatar_url} name={displayName} size={88} style={styles.avatar} />
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.name}>{displayName}</Text>
                {profile.is_admin ? <AdminStar size={18} /> : null}
              </View>
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
                <Text style={styles.statLabel}>{profile.friend_count === 1 ? 'FRIEND' : 'FRIENDS'}</Text>
              </TouchableOpacity>
            </View>

            {/* Friend action */}
            {!isOwnProfile ? (
              <View style={styles.section}>
                {profile.friendship_status === 'pending_received' ? (
                  /* Incoming request — inline accept/decline instead of a
                     single "respond" button that bounced through an Alert
                     and the friends screen. Distinct look from "Add friend"
                     since it's a different state. */
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.friendButton, { flex: 1, backgroundColor: T.primary }, friendBusy && { opacity: 0.6 }]}
                      onPress={handleAcceptRequest}
                      disabled={friendBusy}
                      activeOpacity={0.8}
                    >
                      {friendBusy ? (
                        <ActivityIndicator size="small" color={C.onPrimary} />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={16} color={C.onPrimary} style={{ marginRight: 7 }} />
                          <Text style={styles.friendButtonText}>Accept request</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.friendButton, styles.friendButtonOutline, { flex: 1, borderColor: C.hairline }, friendBusy && { opacity: 0.6 }]}
                      onPress={handleDeclineRequest}
                      disabled={friendBusy}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={16} color={C.inkMute} style={{ marginRight: 7 }} />
                      <Text style={[styles.friendButtonText, { color: C.inkSoft }]}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
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
                )}
              </View>
            ) : null}

            {/* Tab switcher — native UISegmentedControl */}
            <View style={styles.section}>
              <SegmentedControl
                values={['Overview', 'Stamps', 'Timeline']}
                selectedIndex={tabIndex}
                onChange={e => setTabIndex(e.nativeEvent.selectedSegmentIndex)}
                backgroundColor={C.surface as string}
                tintColor={T.primary as string}
                fontStyle={{ color: C.inkSoft as string, fontWeight: '600' }}
                activeFontStyle={{ color: C.onPrimary as string, fontWeight: '700' }}
                style={styles.segmentedControl}
              />
            </View>

            {/* Overview — badges earned */}
            {tabIndex === 0 ? (
              profile.badges?.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader icon="ribbon-outline" title="BADGES EARNED" />
                  <View style={styles.badgeWrap}>
                    {profile.badges.map(b => (
                      <TouchableOpacity
                        key={b.badge_id}
                        onPress={() => setSelectedBadge(b)}
                        activeOpacity={0.7}
                        style={styles.badgePreviewItem}
                      >
                        <BadgePatch emoji={b.emoji} tier={b.tier} colors={b.colors} size={56} earned />
                        <Text style={styles.badgeChipName} numberOfLines={2}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.tabEmpty}>
                  <Ionicons name="ribbon-outline" size={22} color={C.inkMute} />
                  <Text style={styles.tabEmptyText}>No badges earned yet</Text>
                </View>
              )
            ) : null}

            {/* Stamps — visited parks map, only when the API returns the
                field, so a stale deployment doesn't show a misleading
                empty state */}
            {tabIndex === 1 ? (
              profile.visited_parks ? (
                <View style={styles.section}>
                  <View style={styles.mapCard}>
                    {mapParks.length > 0 ? (
                      <MapView
                        style={{ width: '100%', height: 220, borderRadius: 14 }}
                        provider={PROVIDER_DEFAULT}
                        initialRegion={mapRegion}
                        rotateEnabled={false}
                        pitchEnabled={false}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        toolbarEnabled={false}
                        pointerEvents="none"
                      >
                        {mapParks.map(p => (
                          <Marker
                            key={p.park_code}
                            coordinate={{ latitude: p.lat, longitude: p.lng }}
                            title={p.name}
                            tracksViewChanges={false}
                            onCalloutPress={() => router.push(`/park/${p.park_code}` as never)}
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
              ) : (
                <View style={styles.tabEmpty}>
                  <Ionicons name="map-outline" size={22} color={C.inkMute} />
                  <Text style={styles.tabEmptyText}>No park visits yet</Text>
                </View>
              )
            ) : null}

            {/* Timeline — recent posts (same cards as the feed) + journal */}
            {tabIndex === 2 ? (
              (token && posts.length > 0) || (profile.journal && profile.journal.length > 0) ? (
                <>
                  {token && posts.length > 0 ? (
                    <View style={styles.section}>
                      <SectionHeader icon="newspaper-outline" title="RECENT POSTS" />
                      {posts.map(p => (
                        <PostCard
                          key={p.id}
                          post={p}
                          myUserId={me?.id ?? ''}
                          myAvatarUrl={me?.imageUrl}
                          myName={me?.fullName ?? me?.username}
                          onDelete={pid => setPosts(prev => prev.filter(x => x.id !== pid))}
                          onParkPress={code => router.push(`/park/${code}` as never)}
                        />
                      ))}
                    </View>
                  ) : null}

                  {profile.journal && profile.journal.length > 0 ? (
                    <View style={styles.section}>
                      <SectionHeader icon="journal-outline" title="JOURNAL" />
                      <JournalTimeline entries={profile.journal ?? []} />
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.tabEmpty}>
                  <Ionicons name="newspaper-outline" size={22} color={C.inkMute} />
                  <Text style={styles.tabEmptyText}>Nothing here yet</Text>
                </View>
              )
            ) : null}

          </ScrollView>
        )}

        {selectedBadge ? (
          <BadgeDetailModal
            badge={{
              id: selectedBadge.badge_id,
              name: selectedBadge.name,
              emoji: selectedBadge.emoji,
              tier: selectedBadge.tier,
              colors: selectedBadge.colors,
              earned: true,
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
            targetType="user"
            targetId={profile.clerk_user_id}
            onClose={() => { setShowReportUserSheet(false); if (postBlockReport) router.back(); }}
            onSubmitted={() => { setReportedUser(true); Alert.alert('Report submitted', "Thanks — we'll review this."); }}
          />
        ) : null}

        <AvatarLightbox visible={avatarLightbox} url={profile?.avatar_url} onClose={() => setAvatarLightbox(false)} />
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
    borderWidth: 2,
    borderColor: C.hairline,
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

  // Tab switcher
  segmentedControl: {
    height: 34,
  },
  tabEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  tabEmptyText: {
    fontSize: 13,
    color: C.inkMute,
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
    gap: 12,
  },
  // Matches the badge carousel/badge page's circular BadgePatch — was a flat
  // rectangular chip here, the only place in the app badges didn't look like
  // the round earned-patch art.
  badgePreviewItem: {
    alignItems: 'center',
    width: 70,
  },
  badgeChipName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 6,
  },

  // Friends list bottom sheet
  friendsBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
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
