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

const C = {
  bg:           '#F2EBDB',
  surface:      '#FFFBF1',
  surfaceAlt:   '#F7F0DE',
  ink:          '#1B1A16',
  inkSoft:      '#3C3A33',
  inkMute:      '#7A746A',
  hairline:     'rgba(27,26,22,0.10)',
  hairlineSoft: 'rgba(27,26,22,0.06)',
  primary:      '#1F3D2E',
  unreadAccent: '#1F3D2E',
};

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

function NotificationRow({
  n, responded, onRespond, onNavigateToUser,
}: {
  n: NotificationItem;
  responded: boolean;
  onRespond: (friendshipId: number, action: 'accept' | 'reject') => Promise<void>;
  onNavigateToUser: (userId: string) => void;
}) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const [busy, setBusy] = useState(false);
  const { actorName, rest } = buildText(n);

  const handleRespond = async (action: 'accept' | 'reject') => {
    const fid = n.metadata?.friendship_id;
    if (!fid || busy) return;
    setBusy(true);
    try { await onRespond(fid, action); } finally { setBusy(false); }
  };

  return (
    <TouchableOpacity
      activeOpacity={n.actor_id ? 0.7 : 1}
      onPress={n.actor_id ? () => onNavigateToUser(String(n.actor_id)) : undefined}
      style={[styles.row, !n.read && styles.rowUnread]}
    >
      {/* Unread accent bar */}
      {!n.read && <View style={styles.unreadBar} />}

      {/* Avatar / type icon */}
      <View style={{ flexShrink: 0, alignSelf: 'flex-start', position: 'relative' }}>
        {n.actor_id ? (
          <Avatar url={n.actor_avatar_url} name={actorName ?? undefined} size={40} />
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
          {actorName ? (
            <Text style={styles.rowTextBold}>{actorName}</Text>
          ) : null}
          <Text>{rest}</Text>
        </Text>

        {n.type === 'comment' && n.metadata?.excerpt ? (
          <View style={styles.excerptWrap}>
            <Text style={styles.rowExcerpt} numberOfLines={1}>
              &ldquo;{n.metadata.excerpt}&rdquo;
            </Text>
          </View>
        ) : null}

        {n.type === 'friend_request' && n.metadata?.friendship_id ? (
          responded ? (
            <View style={styles.respondedRow}>
              <Ionicons name="checkmark-circle" size={12} color={C.inkMute} />
              <Text style={styles.respondedText}>Responded</Text>
            </View>
          ) : (
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

async function _fetchCount() {
  if (!_getTokenFn) return;
  try {
    const tok = await _getTokenFn();
    if (!tok) return;
    const d = await getUnreadNotificationCount(tok);
    _broadcastCount(d.unread_count ?? 0);
  } catch { /* silent */ }
}

export function NotificationBell({ style }: { style?: ViewStyle }) {
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
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
    setItems(prev => prev.map(n =>
      n.metadata?.friendship_id === friendshipId
        ? { ...n, type: action === 'accept' ? 'friend_accepted' : ('friend_rejected' as NotificationType) }
        : n
    ));
    try {
      await respondFriendRequest(tok, friendshipId, action);
    } catch {
      setItems(prev => prev.map(n =>
        n.metadata?.friendship_id === friendshipId
          ? { ...n, type: 'friend_request' as NotificationType }
          : n
      ));
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
        <Ionicons name={open ? 'notifications' : 'notifications-outline'} size={18} color={open ? C.primary : C.inkSoft} />
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
                <Text style={styles.sheetKicker}>ACTIVITY</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 }}>
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
                contentContainerStyle={{ paddingVertical: 6 }}
                renderItem={({ item }) => (
                  <SwipeableRow onDismiss={() => handleDismiss(item.id)}>
                    <NotificationRow
                      n={item}
                      responded={item.type !== 'friend_request'}
                      onRespond={handleRespond}
                      onNavigateToUser={(userId) => {
                        dismiss();
                        router.push(`/user/${userId}` as any);
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
                  color={pushStatus === 'granted' ? C.primary : C.inkMute}
                />
                <Text style={styles.permFooterLabel}>
                  Push notifications:{' '}
                  <Text style={{ color: pushStatus === 'granted' ? C.primary : C.inkMute, fontWeight: '600' }}>
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

const styles = StyleSheet.create({
  bellActive: {
    backgroundColor: 'rgba(31,61,46,0.07)',
    borderColor: C.hairline,
  },
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 14, height: 14, borderRadius: 7,
    backgroundColor: '#DC2626',
    borderWidth: 1.5, borderColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 8, fontWeight: '700', color: '#fff', lineHeight: 9,
  },

  swipeBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#D45040',
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
    backgroundColor: 'rgba(27,26,22,0.15)',
  },

  sheetHeader: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  sheetKicker: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 1.5,
    color: C.inkMute,
  },
  sheetTitle: {
    fontWeight: '800', fontSize: 20, color: C.ink, letterSpacing: -0.3,
  },
  newChip: {
    backgroundColor: C.primary, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  newChipText: {
    fontSize: 9.5, fontWeight: '700', color: '#FFFBF1', letterSpacing: 0.3,
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
    backgroundColor: '#EEF4EE',
  },
  unreadBar: {
    position: 'absolute',
    left: 0, top: 10, bottom: 10,
    width: 3, borderRadius: 2,
    backgroundColor: C.unreadAccent,
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
    fontSize: 12, color: C.inkSoft, fontStyle: 'italic',
  },
  rowTime: { fontSize: 11, color: C.inkMute, marginTop: 1 },

  // Friend request
  actionRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  acceptBtn: {
    backgroundColor: C.primary, borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  acceptText: { color: '#FFFBF1', fontSize: 12.5, fontWeight: '700' },
  declineBtn: {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  declineText: { color: C.inkSoft, fontSize: 12.5, fontWeight: '600' },
  respondedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
  },
  respondedText: { fontSize: 11.5, color: C.inkMute },

  // Push permission
  permBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 0.5, borderBottomColor: '#F59E0B',
    paddingHorizontal: 16, paddingVertical: 9,
  },
  permBannerText: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '500' },
  permBannerCta: { fontSize: 12, color: '#92400E', fontWeight: '700' },
  permFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 11,
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
    backgroundColor: C.surfaceAlt,
  },
  permFooterLabel: { fontSize: 11.5, color: C.inkMute },
  permFooterAction: { fontSize: 11.5, color: C.inkMute, fontWeight: '600' },

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
