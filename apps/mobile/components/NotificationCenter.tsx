import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, AppState, FlatList, Linking, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View, ViewStyle,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import {
  getNotifications, getUnreadNotificationCount, markNotificationsRead,
  respondFriendRequest, dismissNotification, type NotificationItem, type NotificationType,
} from '@/lib/api';
import { STATIC as C, dyn, useColors, useThemedStyles, type Colors } from '@/lib/palette';

const TYPE_CONFIG: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }> = {
  friend_request:  { icon: 'person-add', bg: '#EDE9FE', color: '#7C3AED' },
  friend_accepted: { icon: 'checkmark',  bg: '#D1FAE5', color: '#059669' },
  like:            { icon: 'heart',      bg: '#FEE2E2', color: '#DC2626' },
  comment:         { icon: 'chatbubble', bg: '#D1FAE5', color: '#059669' },
  post:            { icon: 'location',   bg: '#DCFCE7', color: '#16A34A' },
  visit_logged:    { icon: 'location',   bg: '#DCFCE7', color: '#16A34A' },
  badge_earned:    { icon: 'trophy',     bg: '#FEF3C7', color: '#D97706' },
  system:          { icon: 'sparkles',   bg: '#FEF3C7', color: '#D97706' },
  recommendation:  { icon: 'sparkles',   bg: '#FEF3C7', color: '#D97706' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function buildText(n: NotificationItem): { actorName: string | null; rest: string } {
  const actorName = n.actor_display_name || n.actor_username || null;
  const d = actorName ?? 'Someone';
  switch (n.type) {
    case 'friend_request':  return { actorName: d, rest: ' sent you a friend request' };
    case 'friend_accepted': return { actorName: d, rest: ' accepted your friend request' };
    case 'like':            return { actorName: d, rest: ' liked your post' };
    case 'comment':         return { actorName: d, rest: ' commented on your post' };
    case 'post':            return { actorName: d, rest: n.park_name ? ` posted at ${n.park_name}` : ' shared a new post' };
    case 'visit_logged':    return { actorName: d, rest: n.park_name ? ` visited ${n.park_name}` : ' logged a visit' };
    case 'badge_earned':    return {
      actorName: null,
      rest: n.metadata?.badge_emoji
        ? `${n.metadata.badge_emoji} You earned the ${n.metadata.badge_name ?? 'badge'} badge!`
        : `You earned a new badge: ${n.metadata?.badge_name ?? 'Unknown'}`,
    };
    default: return { actorName: null, rest: n.metadata?.message ?? 'New notification' };
  }
}

const SWIPE_THRESHOLD = -80;

function SwipeableRow({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > Math.abs(dy) + 4 && dx < -4,
    onPanResponderMove: (_, { dx }) => { if (dx < 0) translateX.setValue(dx); },
    onPanResponderRelease: (_, { dx, vx }) => {
      if (dx < SWIPE_THRESHOLD || vx < -0.8) {
        Animated.timing(translateX, { toValue: -500, duration: 200, useNativeDriver: true })
          .start(onDismiss);
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      }
    },
  })).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={styles.swipeBg} />
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// Outcome of *our own* response to a friend-request notification. Deliberately
// separate from `n.type` (the notification's type describes the event that created
// it — "X sent you a friend request" — and never changes); tracking the response
// in its own field is what lets the settled state keep rendering after Accept/Decline
// instead of the whole friend-request block vanishing.
type FriendReqStatus = 'pending' | 'accepted' | 'declined';

function NotificationRow({
  n, status, onRespond, onNavigateToUser, onNavigateToBadge, onNavigateToPost, onNavigateToPark,
}: {
  n: NotificationItem;
  status: FriendReqStatus;
  onRespond: (friendshipId: number, action: 'accept' | 'reject') => Promise<void>;
  onNavigateToUser: (userId: string) => void;
  onNavigateToBadge: (badgeId: string) => void;
  onNavigateToPost: (postId: number, openMode?: 'likes' | 'comments') => void;
  onNavigateToPark: (parkCode: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const [busy, setBusy] = useState(false);
  const { actorName, rest } = buildText(n);
  const badgeId = n.type === 'badge_earned' ? n.metadata?.badge_id : undefined;
  // Post-anchored types jump straight to the post (comments auto-open there);
  // visit_logged falls back to the park page when no post was attached.
  const postTypes = n.type === 'like' || n.type === 'comment' || n.type === 'post' || n.type === 'visit_logged';

  const handleRespond = async (action: 'accept' | 'reject') => {
    const fid = n.metadata?.friendship_id;
    if (!fid || busy) return;
    setBusy(true);
    try { await onRespond(fid, action); } finally { setBusy(false); }
  };

  const handlePress = badgeId
    ? () => onNavigateToBadge(badgeId)
    : postTypes && n.post_id != null
      ? () => onNavigateToPost(n.post_id!, n.type === 'like' ? 'likes' : n.type === 'comment' ? 'comments' : undefined)
      : n.type === 'visit_logged' && n.park_code
        ? () => onNavigateToPark(n.park_code!)
        : n.actor_id
          ? () => onNavigateToUser(String(n.actor_id))
          : undefined;

  const goToActor = n.actor_id ? () => onNavigateToUser(String(n.actor_id)) : undefined;

  return (
    <TouchableOpacity
      activeOpacity={handlePress ? 0.7 : 1}
      onPress={handlePress}
      style={[styles.row, !n.read && styles.rowUnread]}
    >
      {/* Unread accent bar */}
      {!n.read && <View style={styles.unreadBar} />}

      {/* Avatar / type icon */}
      <View style={{ flexShrink: 0, alignSelf: 'flex-start', position: 'relative' }}>
        {n.actor_id ? (
          <TouchableOpacity onPress={goToActor} activeOpacity={0.7} hitSlop={4}>
            <Avatar url={n.actor_avatar_url} name={actorName ?? undefined} size={40} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.typeCircle, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={18} color={cfg.color} />
          </View>
        )}
        {n.actor_id && (
          <View style={[styles.typeDot, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={8} color={cfg.color} />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.rowText} numberOfLines={3}>
          {n.type === 'friend_request' && status !== 'pending' ? (
            // Settled state replaces the request prompt entirely — the request
            // itself was already resolved, so "sent you a friend request" no
            // longer describes what's true.
            <Text>
              {status === 'accepted' ? 'You are now friends' : 'You declined the friend request'}
              {actorName ? (
                <>
                  {status === 'accepted' ? ' with ' : ' from '}
                  <Text style={styles.rowTextBold} onPress={goToActor}>{actorName}</Text>
                </>
              ) : null}
            </Text>
          ) : n.type === 'badge_earned' ? (
            <>
              {n.metadata?.badge_emoji ? <Text>{n.metadata.badge_emoji} </Text> : null}
              <Text>You earned the </Text>
              <Text style={styles.rowTextBold}>{n.metadata?.badge_name ?? 'badge'}</Text>
              <Text> badge!</Text>
            </>
          ) : (n.type === 'post' || n.type === 'visit_logged') && n.park_name ? (
            <>
              {actorName ? (
                <Text style={styles.rowTextBold} onPress={goToActor}>{actorName}</Text>
              ) : null}
              <Text>{n.type === 'post' ? ' posted at ' : ' visited '}</Text>
              <Text style={styles.rowTextBold}>{n.park_name}</Text>
            </>
          ) : (
            <>
              {actorName ? (
                <Text style={styles.rowTextBold} onPress={goToActor}>{actorName}</Text>
              ) : null}
              <Text>{rest}</Text>
            </>
          )}
        </Text>

        {n.type === 'comment' && n.metadata?.excerpt ? (
          <View style={styles.excerptWrap}>
            <Text style={styles.rowExcerpt} numberOfLines={1}>
              &ldquo;{n.metadata.excerpt}&rdquo;
            </Text>
          </View>
        ) : null}

        {n.type === 'friend_request' && n.metadata?.friendship_id ? (
          status === 'pending' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => handleRespond('accept')}
                disabled={busy}
                style={[styles.acceptBtn, busy && { opacity: 0.6 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRespond('reject')}
                disabled={busy}
                style={[styles.declineBtn, busy && { opacity: 0.6 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Settled indicator — green for accepted, red reserved for declined.
            // No buttons: the choice has already been made.
            <View style={styles.respondedRow}>
              <Ionicons
                name={status === 'accepted' ? 'checkmark-circle' : 'close-circle'}
                size={12}
                color={status === 'accepted' ? C.visited : C.liked}
              />
              <Text style={[styles.respondedText, { color: status === 'accepted' ? C.visited : C.liked }]}>
                {status === 'accepted' ? 'Friends now' : 'Declined'}
              </Text>
            </View>
          )
        ) : null}

        <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

type PushStatus = 'granted' | 'denied' | 'undetermined';

// ── Singleton unread count ────────────────────────────────────────────────────
// Feed and profile tabs both mount NotificationBell simultaneously.
// This singleton ensures one fetch serves both instances.
const _countSetters = new Set<React.Dispatch<React.SetStateAction<number>>>();
let _cachedCount = 0;
let _getTokenFn: (() => Promise<string | null>) | null = null;
let _appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let _notifSub: ReturnType<typeof Notifications.addNotificationReceivedListener> | null = null;

function _broadcastCount(n: number) {
  _cachedCount = n;
  _countSetters.forEach(s => s(n));
}

async function _fetchCount(retriesLeft = 4) {
  if (!_getTokenFn) return;
  try {
    const tok = await _getTokenFn();
    if (!tok) {
      // Cold launch: Clerk may not have restored the session yet. Retry briefly
      // instead of leaving the badge stuck at 0 until the user opens the panel.
      if (retriesLeft > 0) setTimeout(() => _fetchCount(retriesLeft - 1), 750);
      return;
    }
    const d = await getUnreadNotificationCount(tok);
    _broadcastCount(d.unread_count ?? 0);
  } catch { /* silent */ }
}

export function NotificationBell({ style }: { style?: ViewStyle }) {
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const T = useColors();
  const styles = useThemedStyles(makeStyles);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  // Our own accept/decline outcome per friend request, keyed by friendship_id — kept
  // out of `items` so responding never touches (or hides) the underlying notification.
  const [friendReqStatus, setFriendReqStatus] = useState<Record<number, 'accepted' | 'declined'>>({});
  const [pushStatus, setPushStatus] = useState<PushStatus>('undetermined');

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPushStatus(status as PushStatus);
    });
  }, []);

  const dragY = useRef(new Animated.Value(800)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 14 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [dragY, backdropOpacity]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setOpen(false);
    });
  }, [dragY, backdropOpacity]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
    onPanResponderMove: (_, { dy }) => { if (dy > 0) dragY.setValue(dy); },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 80 || vy > 0.8) {
        Animated.parallel([
          Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }),
          Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => { setOpen(false); });
      } else {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      }
    },
  })).current;

  const handleOpenPushSettings = () => Linking.openURL('app-settings:');

  useEffect(() => {
    _countSetters.add(setUnreadCount);
    setUnreadCount(_cachedCount);
    _getTokenFn = getToken;

    if (_countSetters.size === 1) {
      _fetchCount();
      _appStateSub = AppState.addEventListener('change', s => {
        if (s === 'active') _fetchCount();
      });
      _notifSub = Notifications.addNotificationReceivedListener(() => _fetchCount());
    }

    return () => {
      _countSetters.delete(setUnreadCount);
      if (_countSetters.size === 0) {
        _appStateSub?.remove(); _appStateSub = null;
        _notifSub?.remove();   _notifSub = null;
        _getTokenFn = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    // Fallback: animate in after 2.5s even if fetch stalls
    const fallback = setTimeout(() => { if (active) animateIn(); }, 2500);
    (async () => {
      setLoading(true);
      try {
        const tok = await getTokenRef.current();
        if (!tok) { animateIn(); return; }
        const data = await getNotifications(tok);
        if (!active) return;
        setItems(data);
        if (data.some(n => !n.read)) {
          markNotificationsRead(tok)
            .then(() => { if (active) _broadcastCount(0); })
            .catch(() => {});
        } else {
          _broadcastCount(0);
        }
      } catch { /* silent */ } finally {
        if (active) {
          setLoading(false);
          clearTimeout(fallback);
          animateIn();
        }
      }
    })();
    return () => { active = false; clearTimeout(fallback); };
  }, [open, animateIn]);

  const handleRespond = useCallback(async (friendshipId: number, action: 'accept' | 'reject') => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setFriendReqStatus(prev => ({ ...prev, [friendshipId]: action === 'accept' ? 'accepted' : 'declined' }));
    try {
      await respondFriendRequest(tok, friendshipId, action);
    } catch {
      // Roll back to pending so Accept/Decline reappear — the request is still live.
      setFriendReqStatus(prev => {
        const next = { ...prev };
        delete next[friendshipId];
        return next;
      });
    }
  }, []);

  const handleDismiss = useCallback(async (id: number) => {
    setItems(prev => prev.filter(n => n.id !== id));
    try {
      const tok = await getTokenRef.current();
      if (tok) await dismissNotification(tok, id);
    } catch { /* already removed from UI */ }
  }, []);

  const newCount = items.filter(n => !n.read).length;
  const displayCount = open ? newCount : unreadCount;

  return (
    <>
      <TouchableOpacity style={[style, open && styles.bellActive]} activeOpacity={0.7} onPress={() => { dragY.setValue(800); backdropOpacity.setValue(0); setOpen(true); }}>
        <Ionicons name={open ? 'notifications' : 'notifications-outline'} size={18} color={open ? T.primary : C.inkSoft} />
        {displayCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{displayCount > 99 ? '99+' : displayCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={dismiss}
        statusBarTranslucent
      >
        <View style={styles.overlayContainer}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.overlayBackdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismiss} />
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: dragY }] }]}>

            {/* Drag handle */}
            <View style={styles.dragHandle} {...panResponder.panHandlers}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.sheetHeader} {...panResponder.panHandlers}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.sheetTitle}>Notifications</Text>
                  {newCount > 0 && (
                    <View style={styles.newChip}>
                      <Text style={styles.newChipText}>{newCount} new</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={17} color={C.inkMute} />
              </TouchableOpacity>
            </View>

            {/* Denied banner */}
            {pushStatus === 'denied' && (
              <TouchableOpacity
                style={styles.permBanner}
                onPress={handleOpenPushSettings}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications-off-outline" size={13} color="#92400E" />
                <Text style={styles.permBannerText}>Push notifications disabled</Text>
                <Text style={styles.permBannerCta}>Enable →</Text>
              </TouchableOpacity>
            )}

            {/* List */}
            {loading ? (
              <View style={styles.centerBox}>
                <Text style={styles.centerMuted}>Loading…</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyEmoji}>🔔</Text>
                <Text style={styles.emptyTitle}>All quiet here</Text>
                <Text style={styles.centerMuted}>Add friends and interact with posts to get started.</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={n => String(n.id)}
                style={{ maxHeight: 500 }}
                contentContainerStyle={{ paddingTop: 6 }}
                renderItem={({ item }) => (
                  <SwipeableRow onDismiss={() => handleDismiss(item.id)}>
                    <NotificationRow
                      n={item}
                      status={item.metadata?.friendship_id != null ? (friendReqStatus[item.metadata.friendship_id] ?? 'pending') : 'pending'}
                      onRespond={handleRespond}
                      onNavigateToUser={(userId) => {
                        dismiss();
                        router.push(`/user/${userId}` as any);
                      }}
                      onNavigateToBadge={(badgeId) => {
                        dismiss();
                        router.push(`/profile/badges?badgeId=${badgeId}` as any);
                      }}
                      onNavigateToPost={(postId, openMode) => {
                        dismiss();
                        router.push(`/(tabs)/feed/post/${postId}${openMode ? `?open=${openMode}` : ''}` as any);
                      }}
                      onNavigateToPark={(parkCode) => {
                        dismiss();
                        router.push(`/parks/${parkCode}` as any);
                      }}
                    />
                  </SwipeableRow>
                )}
              />
            )}

            {/* Push permission footer */}
            <TouchableOpacity
              style={styles.permFooter}
              onPress={handleOpenPushSettings}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons
                  name={pushStatus === 'granted' ? 'notifications' : 'notifications-off-outline'}
                  size={12}
                  color={pushStatus === 'granted' ? T.primary : C.inkMute}
                />
                <Text style={styles.permFooterLabel}>
                  Push notifications:{' '}
                  <Text style={{ color: pushStatus === 'granted' ? T.primary : C.inkMute, fontWeight: '600' }}>
                    {pushStatus === 'granted' ? 'On' : pushStatus === 'denied' ? 'Off' : 'Not set'}
                  </Text>
                </Text>
              </View>
              <Text style={styles.permFooterAction}>Manage →</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (T: Colors) => StyleSheet.create({
  bellActive: {
    backgroundColor: `${T.primary}12`,
    borderColor: C.hairline,
  },
  badge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#DC2626',
    borderWidth: 1.5, borderColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 13, fontWeight: '700', color: '#fff', lineHeight: 15,
  },

  swipeBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.surfaceAlt,
  },

  overlayContainer: {
    flex: 1, justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden',
  },
  dragHandle: {
    alignItems: 'center', paddingTop: 10, paddingBottom: 4,
  },
  dragIndicator: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: dyn('rgba(27,26,22,0.15)', 'rgba(240,234,217,0.20)'),
  },

  sheetHeader: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sheetTitle: {
    fontWeight: '800', fontSize: 20, color: C.ink, letterSpacing: -0.3,
  },
  newChip: {
    backgroundColor: T.primary, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  newChipText: {
    fontSize: 13, fontWeight: '700', color: C.onPrimary, letterSpacing: 0.3,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.surfaceAlt,
    borderWidth: 0.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center',
  },

  // Rows
  row: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 18, paddingVertical: 13,
    position: 'relative',
    backgroundColor: C.surface,
  },
  rowUnread: {
    backgroundColor: C.surfaceAlt,
  },
  unreadBar: {
    position: 'absolute',
    left: 0, top: 10, bottom: 10,
    width: 3, borderRadius: 2,
    backgroundColor: T.primary,
  },
  typeCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  typeDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 17, height: 17, borderRadius: 9,
    borderWidth: 1.5, borderColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { fontSize: 13.5, color: C.ink, lineHeight: 19 },
  rowTextBold: { fontWeight: '700', fontSize: 13.5, color: C.ink },
  excerptWrap: {
    backgroundColor: C.surfaceAlt, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  rowExcerpt: {
    fontSize: 13, color: C.inkSoft, fontStyle: 'italic',
  },
  rowTime: { fontSize: 13, color: C.inkMute, marginTop: 1 },

  // Friend request
  actionRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  acceptBtn: {
    backgroundColor: T.primary, borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  acceptText: { color: C.onPrimary, fontSize: 13, fontWeight: '700' },
  declineBtn: {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  declineText: { color: C.inkSoft, fontSize: 13, fontWeight: '600' },
  respondedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
  },
  respondedText: { fontSize: 13, color: C.inkMute },

  // Push permission
  permBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: dyn('#FEF3C7', '#3A2E14'),
    borderBottomWidth: 0.5, borderBottomColor: dyn('#F59E0B', '#B98A2E'),
    paddingHorizontal: 16, paddingVertical: 9,
  },
  permBannerText: { flex: 1, fontSize: 13, color: dyn('#92400E', '#F2CD88'), fontWeight: '500' },
  permBannerCta: { fontSize: 13, color: dyn('#92400E', '#F2CD88'), fontWeight: '700' },
  permFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 11,
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
    backgroundColor: C.surface,
    marginTop: 0,
  },
  permFooterLabel: { fontSize: 13, color: C.inkMute },
  permFooterAction: { fontSize: 13, color: C.inkMute, fontWeight: '600' },

  // Empty / loading
  centerBox: {
    height: 400, paddingHorizontal: 32,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  emptyEmoji: { fontSize: 38, marginBottom: 6 },
  emptyTitle: {
    fontSize: 16, color: C.ink, fontWeight: '700', letterSpacing: -0.2,
  },
  centerMuted: {
    fontSize: 13, color: C.inkMute, textAlign: 'center', lineHeight: 19,
  },
});
