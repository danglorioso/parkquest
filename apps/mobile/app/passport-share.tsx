import {
  ActivityIndicator, Alert, Dimensions, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as SMS from 'expo-sms';
import {
  EXPORT_H, EXPORT_W, PassportExportCard,
  type ExportStamp, type PassportExportData,
} from '@/components/PassportExportCard';
import { buildMrzLines, passportNo } from '@/lib/passport';
import { showToast } from '@/lib/toast';
import { useColors } from '@/lib/palette';
import { GlassIconBg } from '@/components/GlassIconBg';
import type { CustomStampGlyph } from '@parkquest/types';

// Pre-share screen (Flighty-style): a live preview of the exportable
// passport image in the middle, an aspect toggle top-right, and share
// destinations along the bottom. Presented as a modal over whatever opened
// it (profile page's passport card or the passport screen itself).

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const GOLD = '#F0C550';

interface Park {
  park_code: string;
  name: string;
  states: string;
  stamp_glyph: CustomStampGlyph | null;
  is_national_park: boolean;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

const FILENAME = 'parkquest-passport.png';

export default function PassportShareScreen() {
  const { getToken, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const T = useColors();

  const [data, setData] = useState<PassportExportData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);
  // Measured instead of guessed — a flat fudge-factor left a big gap of dead
  // green above/below the card on tall screens (previewZone centers its
  // content, so any slack it doesn't need becomes visible padding).
  // Real top-bar/destination-row heights let the card grow to fill it.
  const [topBarH, setTopBarH] = useState(0);
  const [destRowH, setDestRowH] = useState(0);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const tok = await getTokenRef.current();
      if (!tok) return;
      const auth = { headers: { Authorization: `Bearer ${tok}` } };
      const [profile, visits, parks, badgesRes] = await Promise.all([
        fetch(`${BASE}/api/profile`, auth).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/visits`,  auth).then(r => r.ok ? r.json() : []) as Promise<Visit[]>,
        fetch(`${BASE}/api/parks`,   auth).then(r => r.ok ? r.json() : []) as Promise<Park[]>,
        fetch(`${BASE}/api/badges`,  auth).then(r => r.ok ? r.json() : { badges: [] }),
      ]);

      const visitedMap = new Map<string, string>();
      (visits ?? []).forEach(v => {
        if (!v.is_bucket_list && v.visited_date) visitedMap.set(v.park_code, v.visited_date);
      });

      // Share card mirrors the passport screen: National Parks only (the
      // curated 63), not every park area the app tracks.
      const nationalParks = (parks ?? []).filter(p => p.is_national_park);

      const visitedStamps: ExportStamp[] = [];
      const stampedStates = new Set<string>();
      const allStates = new Set<string>();
      nationalParks.forEach((p, idx) => {
        p.states.split(',').forEach(s => allStates.add(s.trim()));
        const date = visitedMap.get(p.park_code);
        if (date) {
          visitedStamps.push({
            park_code: p.park_code, name: p.name, states: p.states,
            colorIdx: idx, stamp_glyph: p.stamp_glyph, visited_date: date,
          });
          p.states.split(',').forEach(s => stampedStates.add(s.trim()));
        }
      });
      visitedStamps.sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));

      const allBadges = badgesRes?.badges ?? badgesRes ?? [];
      const name = profile?.display_name ?? profile?.username ?? 'Explorer';
      const username = profile?.username ?? user?.username ?? '';
      const visitedCount = visitedStamps.length;
      const [mrzLine1, mrzLine2] = buildMrzLines({
        name, username, userId: userId ?? null,
        createdAt: user?.createdAt ?? null, visitedCount,
      });

      setData({
        name,
        username,
        avatarUrl: profile?.avatar_url || user?.imageUrl || null,
        joinDate: user?.createdAt
          ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : null,
        visitedCount,
        totalParks: nationalParks.length,
        tripsCount: (visits ?? []).filter(v => !v.is_bucket_list && v.visited_date).length,
        statesCount: stampedStates.size,
        totalParkStates: allStates.size,
        badgeCount: allBadges.filter((b: { earned: boolean }) => b.earned).length,
        totalBadges: allBadges.length,
        passportNo: passportNo(username || 'explorer'),
        mrzLine1,
        mrzLine2,
        firstStamp: visitedStamps[0] ?? null,
        latestStamp: visitedStamps.length > 1 ? visitedStamps[visitedStamps.length - 1] : null,
      });
    } catch (e) {
      console.error('Passport share load:', e);
      setFailed(true);
    }
  }, [userId, user]);

  useEffect(() => { load(); }, [load]);

  // Fit the fixed-size export card into the space between header and
  // destination row — scaled visually, captured at full design size.
  // Waits for the real top-bar/destination-row heights (see topBarH/destRowH
  // above) rather than a guessed constant, so the card fills the space
  // actually available instead of floating in a sea of dead cover green.
  const winH = Dimensions.get('window').height;
  const scale = useMemo(() => {
    const availW = Dimensions.get('window').width - 32;
    // destRowH already bakes in its own paddingBottom: insets.bottom + 18 (it's
    // measured via onLayout, which includes padding) — don't subtract
    // insets.bottom a second time here, only insets.top (consumed by the
    // screen's own paddingTop, outside topBarH).
    const availH = winH - insets.top - topBarH - destRowH - 24;
    return Math.min(availW / EXPORT_W, availH / EXPORT_H.square, 1);
  }, [winH, insets.top, topBarH, destRowH]);

  const capture = useCallback(async (): Promise<string | null> => {
    try {
      return await captureRef(cardRef, { format: 'png', quality: 1, fileName: FILENAME });
    } catch (e) {
      console.error('Passport capture:', e);
      Alert.alert('Export failed', 'Could not render the passport image. Please try again.');
      return null;
    }
  }, []);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }, [busy]);

  const shareMessages = () => withBusy(async () => {
    const uri = await capture();
    if (!uri) return;
    if (!(await SMS.isAvailableAsync())) {
      // Simulators / iPads without Messages — fall back to the system sheet
      await Share.share({ url: uri });
      return;
    }
    // Image only, no pre-filled text
    await SMS.sendSMSAsync([], '', {
      attachments: { uri, mimeType: 'image/png', filename: FILENAME },
    });
  });

  const saveToPhotos = () => withBusy(async () => {
    const uri = await capture();
    if (!uri) return;
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow ParkQuest to add to your photo library in Settings to save your passport.');
      return;
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    showToast('Saved to Photos');
  });

  const shareMore = () => withBusy(async () => {
    const uri = await capture();
    if (!uri) return;
    try {
      await Share.share({ url: uri });
    } catch {
      // user dismissed the share sheet
    }
  });

  const destinations = [
    { label: 'Messages', icon: 'chatbubble' as const,          onPress: shareMessages },
    { label: 'Photos',   icon: 'images' as const,              onPress: saveToPhotos },
    { label: 'More',     icon: 'ellipsis-horizontal' as const, onPress: shareMore },
  ];

  return (
    <View style={[st.screen, { backgroundColor: T.primaryDeep, paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Top bar: close / title / aspect toggle */}
      <View style={st.topBar} onLayout={e => setTopBarH(e.nativeEvent.layout.height)}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={st.roundBtn}>
          <GlassIconBg fallbackColor="rgba(8,16,12,0.45)" />
          <Ionicons name="close" size={22} color={GOLD} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.title}>Your Passport</Text>
          <Text style={st.subtitle}>View and Share</Text>
        </View>
        {/* Spacer balances the X so the title stays centered */}
        <View style={{ width: 44 }} />
      </View>

      {/* Preview */}
      <View style={st.previewZone}>
        {data ? (
          <View
            style={{
              width: EXPORT_W * scale,
              height: EXPORT_H.square * scale,
              borderRadius: 18 * scale,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 20,
            }}
          >
            {/* Captured at full design size; only the on-screen preview is scaled */}
            <View
              ref={cardRef}
              collapsable={false}
              style={{
                position: 'absolute', top: 0, left: 0,
                transform: [{ scale }],
                transformOrigin: 'top left',
              }}
            >
              <PassportExportCard data={data} variant="square" />
            </View>
          </View>
        ) : failed ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Ionicons name="cloud-offline-outline" size={32} color={GOLD} style={{ opacity: 0.7 }} />
            <Text style={{ color: GOLD, fontSize: 14, fontWeight: '600', opacity: 0.8 }}>Failed to load</Text>
            <TouchableOpacity onPress={load} style={st.retryBtn}>
              <Text style={{ color: GOLD, fontWeight: '700', fontSize: 13 }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ActivityIndicator color={GOLD} />
        )}
      </View>

      {/* Destinations */}
      <View
        style={[st.destRow, { paddingBottom: insets.bottom + 18 }]}
        onLayout={e => setDestRowH(e.nativeEvent.layout.height)}
      >
        {destinations.map(d => (
          <TouchableOpacity
            key={d.label}
            onPress={d.onPress}
            disabled={!data || busy}
            activeOpacity={0.7}
            style={[st.dest, (!data || busy) && { opacity: 0.4 }]}
          >
            <View style={st.destIcon}>
              <GlassIconBg borderRadius={16} fallbackColor="rgba(8,16,12,0.45)" />
              <Ionicons name={d.icon} size={22} color={GOLD} />
            </View>
            <Text style={st.destLabel}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  roundBtn: {
    // 44pt — the app-wide round icon button size (matches the park page /
    // profile header buttons); GlassIconBg supplies the fill.
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.6,
    marginTop: 1,
  },
  previewZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,169,74,0.4)',
  },
  destRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    paddingTop: 12,
  },
  dest: {
    alignItems: 'center',
    gap: 6,
  },
  destIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.8,
  },
});
