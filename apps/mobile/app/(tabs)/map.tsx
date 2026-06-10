import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Linking, PanResponder, Platform,
  Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fullStateName } from '@/lib/stateNames';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkSoft:     '#3C3A33',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  hairlineSoft:'rgba(27,26,22,0.06)',
  primary:     '#1F3D2E',
  accent:      '#C56B3D',
  visited:     '#2F7A4A',
  bucket:      '#D89A3A',
  unvisited:   '#A8A29A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const SHEET_PEEK = SCREEN_H * 0.48;
const SHEET_FULL = SCREEN_H * 0.92;

// ── Types ─────────────────────────────────────────────────────────────────────

type ParkStatus = 'visited' | 'bucketList' | 'notVisited';
type FilterStatus = 'all' | 'visited' | 'bucketList' | 'notVisited';

interface VisitEntry {
  id: number;
  visited_date: string;
  end_date?: string | null;
  title?: string | null;
  notes?: string | null;
}

interface FullVisit {
  id: number;
  visited_date: string;
  end_date?: string | null;
  title?: string | null;
  notes?: string | null;
  rating?: number | null;
  photos?: string[] | null;
}

interface OperatingHours {
  name: string;
  description: string;
  standardHours: Record<string, string>;
}

interface WeatherPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  isDaytime: boolean;
}

interface ParkForMap {
  park_code: string;
  name: string;
  states: string;
  latitude: number;
  longitude: number;
  status: ParkStatus;
  description?: string | null;
  image_url?: string | null;
  visits?: VisitEntry[];
  title?: string | null;
  notes?: string | null;
  photos?: string[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const PARK_PALETTES = [
  '#3F5949', '#5C6B4B', '#B86A3E', '#8B5A3C',
  '#3F5C6B', '#2D4F66', '#4A3F5C', '#5C4A3F',
];
function parkBgColor(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PARK_PALETTES.length;
  return PARK_PALETTES[idx];
}

const GRADIENTS: [string, string, string][] = [
  ['#1F3D2E', '#2F7A4A', '#C56B3D'],
  ['#2D4F66', '#1F3D2E', '#D89A3A'],
  ['#7B3A1F', '#C56B3D', '#1F3D2E'],
  ['#3A2E5C', '#6E97A3', '#D89A3A'],
  ['#2F7A4A', '#1F3D2E', '#2D4F66'],
];
function gradientColors(code: string): [string, string, string] {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx];
}

function markerConfig(status: ParkStatus, selected: boolean) {
  const color =
    status === 'visited'    ? C.visited :
    status === 'bucketList' ? C.bucket  : C.unvisited;
  const dotR  = selected ? 10 : status === 'visited' ? 7.5 : 6;
  const haloR = selected ? 17 : status === 'visited' ? 13  : 10;
  const haloOpacity = selected ? 0.24 : 0.15;
  return { color, dotR, haloR, haloOpacity };
}

function formatDateRange(start: string, end?: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  if (!end) return s.toLocaleDateString('en-US', opts);
  const e = new Date(end);
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${days}d`;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function weatherEmoji(shortForecast: string): string {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunder') || f.includes('storm'))    return '⛈️';
  if (f.includes('snow') && f.includes('rain'))         return '🌨️';
  if (f.includes('heavy snow'))                         return '❄️';
  if (f.includes('snow'))                               return '❄️';
  if (f.includes('heavy rain') || f.includes('showers')) return '🌧️';
  if (f.includes('rain') || f.includes('drizzle'))     return '🌦️';
  if (f.includes('fog') || f.includes('haze'))         return '🌫️';
  if (f.includes('windy') || f.includes('breezy'))     return '🌬️';
  if (f.includes('partly cloudy') || f.includes('partly sunny')) return '⛅';
  if (f.includes('mostly cloudy'))                      return '🌥️';
  if (f.includes('cloud') || f.includes('overcast'))   return '☁️';
  if (f.includes('sunny') || f.includes('clear'))      return '☀️';
  return '🌤️';
}

// ── ParkMarker ────────────────────────────────────────────────────────────────

function ParkMarker({ park, selected }: { park: ParkForMap; selected: boolean }) {
  const { color, dotR, haloR, haloOpacity } = markerConfig(park.status, selected);
  const sz = haloR * 2;
  return (
    <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: sz, height: sz, borderRadius: haloR,
        backgroundColor: color, opacity: haloOpacity,
      }} />
      <View style={{
        width: dotR * 2, height: dotR * 2, borderRadius: dotR,
        backgroundColor: color,
        borderWidth: selected ? 2 : 1.5,
        borderColor: C.surface,
      }} />
    </View>
  );
}

// ── FilterPill ────────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: FilterStatus; dot: string; label: string }> = [
  { key: 'all',        dot: C.ink,       label: 'ALL'    },
  { key: 'visited',    dot: C.visited,   label: 'VISITED'},
  { key: 'bucketList', dot: C.bucket,    label: 'BUCKET' },
  { key: 'notVisited', dot: C.unvisited, label: 'TO GO'  },
];

function FilterPill({
  active, counts, onSelect,
}: {
  active: FilterStatus;
  counts: Record<FilterStatus, number>;
  onSelect: (f: FilterStatus) => void;
}) {
  return (
    <View style={styles.pill}>
      {FILTERS.map((f, i) => (
        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => onSelect(f.key)}
            activeOpacity={0.7}
            style={[styles.pillBtn, active === f.key && styles.pillBtnActive]}
          >
            <View style={[styles.pillDot, { backgroundColor: f.dot }]} />
            <Text style={[styles.pillCount, active === f.key && styles.pillCountActive]}>
              {counts[f.key]}
            </Text>
            <Text style={[styles.pillLabel, active === f.key && styles.pillLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
          {i < FILTERS.length - 1 && <View style={styles.pillDivider} />}
        </View>
      ))}
    </View>
  );
}

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: ParkStatus }) {
  const cfg = {
    visited:    { label: '✓ Visited',     bg: 'rgba(47,122,74,0.85)' },
    bucketList: { label: '⊙ Bucket list', bg: 'rgba(216,154,58,0.85)' },
    notVisited: { label: '○ Not visited', bg: 'rgba(168,162,154,0.80)' },
  }[status];
  return (
    <View style={[styles.statusChip, { backgroundColor: cfg.bg }]}>
      <Text style={styles.statusChipText}>{cfg.label}</Text>
    </View>
  );
}

// ── Section header (for full-profile sections) ────────────────────────────────

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < Math.round(value) ? 'star' : 'star-outline'} size={11} color={C.accent} />
      ))}
    </View>
  );
}

// ── ParkBottomSheet ───────────────────────────────────────────────────────────

function ParkBottomSheet({
  park,
  token,
  onClose,
  onStatusChange,
}: {
  park: ParkForMap;
  token: string;
  onClose: () => void;
  onStatusChange: (code: string, status: ParkStatus) => void;
}) {
  const router = useRouter();
  const sheetH   = useRef(new Animated.Value(0)).current;
  const baseH    = useRef(SHEET_PEEK);

  // Image carousel
  const [npsImages, setNpsImages] = useState<string[]>(
    park.image_url ? [park.image_url] : []
  );
  const [imgIdx, setImgIdx] = useState(0);

  // NPS summary data
  const [npsDesignation,   setNpsDesignation]   = useState<string | null>(null);
  const [npsActivities,    setNpsActivities]    = useState<string[]>([]);
  const [npsTopics,        setNpsTopics]        = useState<string[]>([]);
  const [npsEntranceFees,  setNpsEntranceFees]  = useState<Array<{ title: string; cost: string; description?: string }>>([]);
  const [npsFeesFree,      setNpsFeesFree]      = useState<boolean | null>(null);
  const [npsHours,         setNpsHours]         = useState<OperatingHours[]>([]);
  const [npsDirectionsInfo,setNpsDirectionsInfo]= useState<string | null>(null);
  const [npsDirectionsUrl, setNpsDirectionsUrl] = useState<string | null>(null);
  const [npsPhone,         setNpsPhone]         = useState<string | null>(null);
  const [npsEmail,         setNpsEmail]         = useState<string | null>(null);
  const [npsWebUrl,        setNpsWebUrl]        = useState<string | null>(null);
  const [npsWeatherInfo,   setNpsWeatherInfo]   = useState<string | null>(null);

  // Weather
  const [weather, setWeather] = useState<WeatherPeriod[] | null>(null);

  // Full visits (with rating + photos)
  const [fullVisits,       setFullVisits]       = useState<FullVisit[]>([]);
  const [expandedVisits,   setExpandedVisits]   = useState<Set<number>>(new Set());

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Animate in ───────────────────────────────────────────────────────────────

  useEffect(() => {
    baseH.current = SHEET_PEEK;
    sheetH.setValue(0);
    Animated.spring(sheetH, {
      toValue: SHEET_PEEK, useNativeDriver: false,
      damping: 30, mass: 0.9, stiffness: 200,
    }).start();
  }, [park.park_code]);

  // ── Load NPS data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (park.image_url) setNpsImages([park.image_url]);
    else setNpsImages([]);
    setImgIdx(0);
    setNpsDesignation(null);
    setNpsActivities([]);
    setNpsTopics([]);
    setNpsEntranceFees([]);
    setNpsFeesFree(null);
    setNpsHours([]);
    setNpsDirectionsInfo(null);
    setNpsDirectionsUrl(null);
    setNpsPhone(null);
    setNpsEmail(null);
    setNpsWebUrl(null);
    setNpsWeatherInfo(null);
    setExpandedVisits(new Set());

    fetch(`${BASE}/api/parks/${park.park_code}/images`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const urls: string[] = (data?.images ?? [])
          .map((img: { url: string }) => img.url)
          .filter(Boolean);
        if (urls.length > 0) setNpsImages(urls);
      })
      .catch(() => {});

    fetch(`${BASE}/api/parks/${park.park_code}/nps`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: {
        designation?: string;
        activities?: string[];
        topics?: string[];
        entranceFees?: Array<{ title: string; cost: string; description?: string }>;
        operatingHours?: OperatingHours[];
        directionsInfo?: string;
        directionsUrl?: string;
        phone?: string;
        email?: string;
        url?: string;
        weatherInfo?: string;
      } | null) => {
        if (!data) return;
        setNpsDesignation(data.designation ?? null);
        setNpsActivities((data.activities ?? []).slice(0, 12));
        setNpsTopics((data.topics ?? []).slice(0, 10));
        setNpsEntranceFees(data.entranceFees ?? []);
        setNpsFeesFree((data.entranceFees ?? []).length === 0);
        setNpsHours(data.operatingHours ?? []);
        setNpsDirectionsInfo(data.directionsInfo ?? null);
        setNpsDirectionsUrl(data.directionsUrl ?? null);
        setNpsPhone(data.phone ?? null);
        setNpsEmail(data.email ?? null);
        setNpsWebUrl(data.url ?? null);
        setNpsWeatherInfo(data.weatherInfo ?? null);
      })
      .catch(() => {});
  }, [park.park_code, token, park.image_url]);

  // ── Load weather + full visits ────────────────────────────────────────────────

  useEffect(() => {
    setWeather(null);
    setFullVisits([]);

    fetch(`${BASE}/api/parks/${park.park_code}/weather`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.periods) setWeather(data.periods);
      })
      .catch(() => {});

    fetch(`${BASE}/api/visits`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((visits: Array<FullVisit & { park_code: string; is_bucket_list: boolean }>) => {
        const mine = visits
          .filter(v => v.park_code === park.park_code && !v.is_bucket_list && v.visited_date)
          .sort((a, b) => new Date(b.visited_date).getTime() - new Date(a.visited_date).getTime());
        setFullVisits(mine);
      })
      .catch(() => {});
  }, [park.park_code, token]);

  // ── Sheet snap / dismiss ──────────────────────────────────────────────────────

  function snapTo(target: number) {
    Animated.spring(sheetH, {
      toValue: target, useNativeDriver: false,
      damping: 28, mass: 0.85, stiffness: 200,
    }).start();
    baseH.current = target;
  }

  function dismiss() {
    Animated.timing(sheetH, {
      toValue: 0, duration: 220, useNativeDriver: false,
    }).start(onClose);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        sheetH.stopAnimation(v => { baseH.current = v; });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(60, Math.min(SHEET_FULL, baseH.current - g.dy));
        sheetH.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) {
          if (baseH.current <= SHEET_PEEK + 10) snapTo(SHEET_FULL);
          return;
        }
        const projected = baseH.current - g.dy;
        const mid = (SHEET_PEEK + SHEET_FULL) / 2;
        if (g.vy > 0.9 || projected < SHEET_PEEK * 0.45) {
          dismiss();
        } else if (g.vy < -0.5 || projected > mid) {
          snapTo(SHEET_FULL);
        } else {
          snapTo(SHEET_PEEK);
        }
      },
    })
  ).current;

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleMarkVisited = async () => {
    setActionLoading('visit');
    try {
      await fetch(`${BASE}/api/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ park_code: park.park_code, visited_date: new Date().toISOString().split('T')[0] }),
      });
      onStatusChange(park.park_code, 'visited');
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleBucketList = async () => {
    setActionLoading('bucket');
    try {
      if (park.status === 'bucketList') {
        await fetch(`${BASE}/api/visits?park_code=${park.park_code}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
        onStatusChange(park.park_code, 'notVisited');
      } else {
        await fetch(`${BASE}/api/visits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ park_code: park.park_code, is_bucket_list: true }),
        });
        onStatusChange(park.park_code, 'bucketList');
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const heroUrl      = npsImages[imgIdx] ?? null;
  const stateLabel   = fullStateName(park.states.split(',')[0].trim());
  const forecastDays = (weather ?? []).filter(p => p.isDaytime).slice(0, 7);
  const forecastNights = (weather ?? []).filter(p => !p.isDaytime);
  const hasContact   = npsPhone || npsEmail || npsWebUrl;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Pressable style={styles.backdrop} onPress={dismiss} />

      <Animated.View style={[styles.sheet, { height: sheetH }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handleBar} />
        </View>

        {/* Hero image */}
        <Pressable
          style={[styles.hero, { backgroundColor: parkBgColor(park.park_code) }]}
          onPress={() => { if (baseH.current <= SHEET_PEEK + 10) snapTo(SHEET_FULL); }}
        >
          {heroUrl ? (
            <Image
              source={{ uri: heroUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}

          <LinearGradient
            colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.38)', 'transparent']}
            locations={[0, 0.4, 0.75]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {npsImages.length > 1 && (
            <>
              <View style={styles.imgCounter}>
                <Text style={styles.imgCounterText}>{imgIdx + 1} / {npsImages.length}</Text>
              </View>
              <TouchableOpacity
                style={[styles.imgNav, { left: 10 }]}
                onPress={() => setImgIdx(i => (i - 1 + npsImages.length) % npsImages.length)}
              >
                <Ionicons name="chevron-back" size={15} color="#FFFBF1" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imgNav, { right: 10 }]}
                onPress={() => setImgIdx(i => (i + 1) % npsImages.length)}
              >
                <Ionicons name="chevron-forward" size={15} color="#FFFBF1" />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.heroClose} onPress={dismiss} hitSlop={8}>
            <Ionicons name="close" size={14} color="#FFFBF1" />
          </TouchableOpacity>

          <View style={styles.heroContent}>
            <Text style={styles.heroState}>{stateLabel.toUpperCase()}</Text>
            <Text style={styles.heroName}>{park.name}</Text>
            <View style={{ marginTop: 8 }}>
              <StatusChip status={park.status} />
            </View>
          </View>
        </Pressable>

        {/* Scrollable body — full profile below hero */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.sheetBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Description ── */}
          {park.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionKicker}>ABOUT THIS PARK</Text>
              <Text style={styles.sectionBody}>{park.description}</Text>
            </View>
          ) : null}

          {/* ── Activities ── */}
          {npsActivities.length > 0 && (
            <SheetSection title="Activities">
              <View style={styles.chipWrap}>
                {npsActivities.map(a => (
                  <View key={a} style={styles.activityChip}>
                    <Text style={styles.activityChipText}>{a}</Text>
                  </View>
                ))}
              </View>
            </SheetSection>
          )}

          {/* ── Topics ── */}
          {npsTopics.length > 0 && (
            <SheetSection title="Topics">
              <View style={styles.chipWrap}>
                {npsTopics.map(t => (
                  <View key={t} style={[styles.activityChip, { backgroundColor: 'transparent' }]}>
                    <Text style={[styles.activityChipText, { color: C.inkMute }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </SheetSection>
          )}

          {/* ── Operating hours ── */}
          {npsHours.length > 0 && (
            <SheetSection title="Hours">
              {npsHours.map((h, hi) => (
                <View key={hi} style={{ marginBottom: hi < npsHours.length - 1 ? 14 : 0 }}>
                  {npsHours.length > 1 && (
                    <Text style={styles.hoursName}>{h.name}</Text>
                  )}
                  {DAYS.map(day => {
                    const val = h.standardHours?.[day.toLowerCase()] ?? '—';
                    return (
                      <View key={day} style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>{day}</Text>
                        <Text style={styles.hoursVal}>{val}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </SheetSection>
          )}

          {/* ── Entrance fees ── */}
          {npsFeesFree !== null && (
            <SheetSection title="Entrance">
              {npsFeesFree ? (
                <Text style={[styles.sectionBody, { fontWeight: '500' }]}>Free to visit</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {npsEntranceFees.map((fee, i) => (
                    <View key={i} style={styles.feeCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: fee.description ? 4 : 0 }}>
                        <Text style={styles.feeName}>{fee.title || 'Entrance'}</Text>
                        <Text style={styles.feeCost}>
                          {fee.cost === '0.00' || fee.cost === '0' ? 'Free' : `$${parseFloat(fee.cost).toFixed(0)}`}
                        </Text>
                      </View>
                      {fee.description ? (
                        <Text style={styles.feeDesc} numberOfLines={2}>{fee.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </SheetSection>
          )}

          {/* ── Directions ── */}
          {npsDirectionsInfo ? (
            <SheetSection title="Directions">
              <Text style={styles.sectionBody}>{npsDirectionsInfo}</Text>
              {npsDirectionsUrl ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(npsDirectionsUrl!)}
                  style={styles.linkBtn}
                >
                  <Ionicons name="navigate-outline" size={13} color={C.primary} />
                  <Text style={styles.linkBtnText}>Open directions</Text>
                </TouchableOpacity>
              ) : null}
            </SheetSection>
          ) : null}

          {/* ── Contact ── */}
          {hasContact ? (
            <SheetSection title="Contact">
              <View style={{ gap: 10 }}>
                {npsPhone ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(`tel:${npsPhone!.replace(/\D/g, '')}`)}
                  >
                    <Ionicons name="call-outline" size={14} color={C.inkMute} />
                    <Text style={styles.contactText}>{npsPhone}</Text>
                  </TouchableOpacity>
                ) : null}
                {npsEmail ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(`mailto:${npsEmail}`)}
                  >
                    <Ionicons name="mail-outline" size={14} color={C.inkMute} />
                    <Text style={styles.contactText}>{npsEmail}</Text>
                  </TouchableOpacity>
                ) : null}
                {npsWebUrl ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(npsWebUrl!)}
                  >
                    <Ionicons name="globe-outline" size={14} color={C.inkMute} />
                    <Text style={styles.contactText}>NPS Website</Text>
                    <Ionicons name="arrow-forward" size={10} color={C.inkMute} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </SheetSection>
          ) : null}

          {/* ── Weather ── */}
          {forecastDays.length > 0 ? (
            <SheetSection title="Weather Forecast">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 4 }}>
                  {forecastDays.map((p, i) => {
                    const night = forecastNights[i];
                    return (
                      <View key={i} style={styles.weatherCard}>
                        <Text style={styles.weatherDay}>{p.name.replace('This ', '')}</Text>
                        <Text style={styles.weatherEmoji}>{weatherEmoji(p.shortForecast)}</Text>
                        <Text style={styles.weatherTemp}>{p.temperature}°{p.temperatureUnit}</Text>
                        {night && <Text style={styles.weatherLow}>{night.temperature}° low</Text>}
                        <Text style={styles.weatherDesc} numberOfLines={2}>{p.shortForecast}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              {npsWeatherInfo ? (
                <Text style={[styles.sectionBody, { marginTop: 12 }]}>{npsWeatherInfo}</Text>
              ) : null}
            </SheetSection>
          ) : npsWeatherInfo ? (
            <SheetSection title="Weather">
              <Text style={styles.sectionBody}>{npsWeatherInfo}</Text>
            </SheetSection>
          ) : null}

          {/* ── Journal ── */}
          {fullVisits.length > 0 && (
            <SheetSection title={`Your Journal · ${fullVisits.length}`}>
              <View style={{ gap: 8 }}>
                {fullVisits.map(v => {
                  const isExpanded = expandedVisits.has(v.id);
                  return (
                    <View key={v.id} style={styles.visitCard}>
                      <TouchableOpacity
                        onPress={() => setExpandedVisits(prev => {
                          const s = new Set(prev);
                          s.has(v.id) ? s.delete(v.id) : s.add(v.id);
                          return s;
                        })}
                        style={styles.visitCardHeader}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={styles.visitDate}>{formatDateRange(v.visited_date, v.end_date)}</Text>
                            {v.rating ? <Stars value={v.rating} /> : null}
                          </View>
                          {v.title ? <Text style={styles.visitTitle} numberOfLines={1}>{v.title}</Text> : null}
                        </View>
                        <Ionicons
                          name="chevron-down"
                          size={13}
                          color={C.inkMute}
                          style={{ marginLeft: 8, transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.visitCardBody}>
                          {v.notes ? (
                            <Text style={styles.visitNotes}>{v.notes}</Text>
                          ) : (
                            <Text style={[styles.visitNotes, { fontStyle: 'italic', color: C.inkMute }]}>No notes</Text>
                          )}
                          {v.photos && v.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                {v.photos.map((uri, i) => (
                                  <Image
                                    key={i}
                                    source={{ uri }}
                                    style={styles.visitPhoto}
                                    contentFit="cover"
                                    cachePolicy="memory-disk"
                                  />
                                ))}
                              </View>
                            </ScrollView>
                          )}
                          <TouchableOpacity
                            onPress={() => router.push(`/profile/journal/${v.id}` as never)}
                            style={styles.visitEditBtn}
                          >
                            <Ionicons name="pencil-outline" size={11} color={C.primary} />
                            <Text style={styles.visitEditBtnText}>Edit entry</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </SheetSection>
          )}

          {/* Attribution */}
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>
              Park information sourced from the National Park Service (NPS). Always verify details before your visit.
            </Text>
          </View>
        </ScrollView>

        {/* Action row — pinned at bottom */}
        <View style={styles.actionRow}>
          {park.status === 'visited' ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  if (fullVisits[0]) router.push(`/profile/journal/${fullVisits[0].id}` as never);
                }}
                style={[styles.actionBtn, { backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline, flex: 1 }]}
              >
                <Ionicons name="pencil-outline" size={13} color={C.ink} />
                <Text style={[styles.actionBtnText, { color: C.ink }]}>Edit visit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleMarkVisited}
                disabled={!!actionLoading}
                style={[styles.actionBtn, { backgroundColor: C.primary, flex: 1 }]}
              >
                <Ionicons name="checkmark" size={14} color="#FFFBF1" />
                <Text style={[styles.actionBtnText, { color: '#FFFBF1' }]}>Log a visit</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleMarkVisited}
                disabled={!!actionLoading}
                style={[styles.actionBtn, { backgroundColor: C.visited, flex: 1 }]}
              >
                {actionLoading === 'visit'
                  ? <Text style={[styles.actionBtnText, { color: '#FFFBF1' }]}>…</Text>
                  : <>
                      <Ionicons name="checkmark" size={14} color="#FFFBF1" />
                      <Text style={[styles.actionBtnText, { color: '#FFFBF1' }]}>Mark visited</Text>
                    </>
                }
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBucketList}
                disabled={!!actionLoading}
                style={[
                  styles.actionBtn,
                  {
                    flex: 1,
                    backgroundColor: park.status === 'bucketList' ? C.bucket : C.surfaceAlt,
                    borderWidth: park.status === 'bucketList' ? 0 : 0.5,
                    borderColor: C.hairline,
                  },
                ]}
              >
                {actionLoading === 'bucket'
                  ? <Text style={styles.actionBtnText}>…</Text>
                  : <>
                      <Ionicons
                        name={park.status === 'bucketList' ? 'bookmark' : 'bookmark-outline'}
                        size={14}
                        color={park.status === 'bucketList' ? '#FFFBF1' : C.ink}
                      />
                      <Text style={[
                        styles.actionBtnText,
                        { color: park.status === 'bucketList' ? '#FFFBF1' : C.ink },
                      ]}>
                        {park.status === 'bucketList' ? 'On bucket list' : 'Bucket list'}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>
    </>
  );
}

// ── MapScreen ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const { parkCode: focusParkCode } = useLocalSearchParams<{ parkCode?: string }>();

  const [token, setToken]               = useState<string | null>(null);
  const [parks, setParks]               = useState<ParkForMap[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedPark, setSelectedPark] = useState<ParkForMap | null>(null);
  const [loading, setLoading]           = useState(true);
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef({ latitude: 39.0, longitude: -98.5, latitudeDelta: 35, longitudeDelta: 55 });

  const counts: Record<FilterStatus, number> = {
    all:        parks.length,
    visited:    parks.filter(p => p.status === 'visited').length,
    bucketList: parks.filter(p => p.status === 'bucketList').length,
    notVisited: parks.filter(p => p.status === 'notVisited').length,
  };

  const filteredParks =
    filterStatus === 'all'        ? parks :
    filterStatus === 'notVisited' ? parks.filter(p => p.status === 'notVisited' || p.status === 'bucketList') :
    parks.filter(p => p.status === filterStatus);

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    setToken(tok);
    setParks(prev => { if (prev.length === 0) setLoading(true); return prev; });
    try {
      const [parksData, visitsData] = await Promise.all([
        apiFetch<Array<{
          park_code: string; name: string; states: string;
          latitude: string | null; longitude: string | null;
          description: string | null; image_url: string | null;
        }>>('/api/parks', tok),
        apiFetch<Array<{
          id: number; park_code: string; is_bucket_list: boolean;
          visited_date: string | null; end_date: string | null;
          title: string | null; notes: string | null; photos: string[] | null;
          visibility: string | null;
        }>>('/api/visits', tok),
      ]);

      const visitedSet    = new Set<string>();
      const bucketSet     = new Set<string>();
      const visitsPerPark: Record<string, VisitEntry[]> = {};

      for (const v of visitsData) {
        if (v.is_bucket_list) {
          bucketSet.add(v.park_code);
        } else if (v.visited_date) {
          visitedSet.add(v.park_code);
          if (!visitsPerPark[v.park_code]) visitsPerPark[v.park_code] = [];
          visitsPerPark[v.park_code].push({
            id: v.id,
            visited_date: v.visited_date,
            end_date: v.end_date,
            title: v.title,
            notes: v.notes,
          });
        }
      }

      const transformed: ParkForMap[] = parksData
        .filter(p => p.latitude && p.longitude)
        .map(p => {
          let status: ParkStatus = 'notVisited';
          if (visitedSet.has(p.park_code))     status = 'visited';
          else if (bucketSet.has(p.park_code)) status = 'bucketList';
          return {
            park_code:   p.park_code,
            name:        p.name,
            states:      p.states,
            latitude:    parseFloat(p.latitude!),
            longitude:   parseFloat(p.longitude!),
            status,
            description: p.description,
            image_url:   p.image_url,
            visits:      visitsPerPark[p.park_code] ?? [],
          };
        });

      setParks(transformed);
    } catch (e) {
      console.error('Map data load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  useFocusEffect(useCallback(() => { loadDataRef.current(); }, []));

  const handleStatusChange = useCallback((code: string, status: ParkStatus) => {
    setParks(prev =>
      prev.map(p => p.park_code === code ? { ...p, status } : p)
    );
    setSelectedPark(prev =>
      prev?.park_code === code ? { ...prev, status } : prev
    );
  }, []);

  const handleSelectPark = useCallback((park: ParkForMap) => {
    setSelectedPark(park);
    const LAT_DELTA = 1.5;
    // Offset center southward so pin appears at vertical center of visible area (above sheet)
    const latOffset = (SHEET_PEEK * LAT_DELTA) / (2 * SCREEN_H);
    mapRef.current?.animateToRegion(
      {
        latitude:       park.latitude - latOffset,
        longitude:      park.longitude,
        latitudeDelta:  LAT_DELTA,
        longitudeDelta: 1.5,
      },
      500
    );
  }, []);

  useEffect(() => {
    if (!focusParkCode || parks.length === 0) return;
    const park = parks.find(p => p.park_code === focusParkCode);
    if (park) handleSelectPark(park);
  }, [focusParkCode, parks, handleSelectPark]);

  const zoomIn = useCallback(() => {
    const r = currentRegionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: Math.max(r.latitudeDelta / 2, 0.005), longitudeDelta: Math.max(r.longitudeDelta / 2, 0.005) },
      300
    );
  }, []);

  const zoomOut = useCallback(() => {
    const r = currentRegionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: Math.min(r.latitudeDelta * 2, 120), longitudeDelta: Math.min(r.longitudeDelta * 2, 120) },
      300
    );
  }, []);

  const goHome = useCallback(() => {
    mapRef.current?.animateToRegion(
      { latitude: 39.0, longitude: -98.5, latitudeDelta: 35, longitudeDelta: 55 },
      500
    );
  }, []);

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        initialRegion={{
          latitude:       39.0,
          longitude:      -98.5,
          latitudeDelta:  35,
          longitudeDelta: 55,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        onRegionChangeComplete={region => { currentRegionRef.current = region; }}
        onPress={() => setSelectedPark(null)}
      >
        {filteredParks.map(park => {
          const selected = selectedPark?.park_code === park.park_code;
          return (
            <Marker
              key={`${park.park_code}-${park.status}-${selected}`}
              coordinate={{ latitude: park.latitude, longitude: park.longitude }}
              onPress={e => { e.stopPropagation(); handleSelectPark(park); }}
              tracksViewChanges={selected}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <ParkMarker park={park} selected={selected} />
            </Marker>
          );
        })}
      </MapView>

      {!loading && (
        <View style={[styles.filterPillWrap, { top: insets.top + 12 }]}>
          <FilterPill
            active={filterStatus}
            counts={counts}
            onSelect={f => { setFilterStatus(f); setSelectedPark(null); }}
          />
        </View>
      )}

      {loading && (
        <View style={[styles.loadingWrap, { top: insets.top + 12 }]}>
          <View style={styles.pill}>
            <Text style={[styles.pillLabel, { marginLeft: 0 }]}>Loading parks…</Text>
          </View>
        </View>
      )}

      {selectedPark && token && (
        <ParkBottomSheet
          key={selectedPark.park_code}
          park={selectedPark}
          token={token}
          onClose={() => setSelectedPark(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Map controls */}
      <View style={[styles.mapControls, {
        bottom: selectedPark ? SHEET_PEEK + 14 : insets.bottom + 68,
      }]}>
        <TouchableOpacity style={styles.mapControlBtn} onPress={zoomIn} activeOpacity={0.75}>
          <Ionicons name="add" size={18} color="#4A4535" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={zoomOut} activeOpacity={0.75}>
          <Ionicons name="remove" size={18} color="#4A4535" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={goHome} activeOpacity={0.75}>
          <Ionicons name="home-outline" size={14} color="#4A4535" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#CECDBC',
  },

  // Filter pill
  filterPillWrap: {
    position: 'absolute',
    left: 14,
    zIndex: 20,
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    zIndex: 20,
    flexDirection: 'column',
    gap: 4,
  },
  mapControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(255,251,241,0.93)',
    borderWidth: 0.5,
    borderColor: 'rgba(27,26,22,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    position: 'absolute',
    left: 14,
    zIndex: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,251,241,0.92)',
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  pillBtnActive: {
    backgroundColor: 'rgba(31,61,46,0.10)',
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pillCount: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.ink,
    minWidth: 14,
    textAlign: 'center',
  },
  pillCountActive: {
    color: C.ink,
  },
  pillLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: C.inkSoft,
    letterSpacing: 0.5,
  },
  pillLabelActive: {
    color: C.ink,
  },
  pillDivider: {
    width: 1,
    height: 12,
    backgroundColor: C.hairline,
    marginHorizontal: 1,
  },

  // Status chip
  statusChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  statusChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFBF1',
    letterSpacing: 0.4,
  },

  // Bottom sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 29,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: 'rgba(255,251,241,0.97)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 0.5,
    borderColor: C.hairline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.hairline,
  },

  // Hero
  hero: {
    height: 190,
    flexShrink: 0,
    overflow: 'hidden',
  },
  imgCounter: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(20,17,12,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  imgCounterText: {
    color: '#FFFBF1',
    fontSize: 10,
    fontWeight: '600',
  },
  imgNav: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20,17,12,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20,17,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 48,
  },
  heroState: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,251,241,0.75)',
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFBF1',
    letterSpacing: -0.4,
    lineHeight: 26,
  },

  // Scrollable body
  sheetBody: {
    paddingBottom: 8,
  },


  // Brief description section
  section: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
  },
  sectionKicker: {
    fontSize: 9.5,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 12.5,
    color: C.inkSoft,
    lineHeight: 19,
  },

  // Full profile sections
  profileSection: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
  },
  profileSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.1,
    marginBottom: 10,
  },

  // Chips
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  activityChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: C.surfaceAlt,
  },
  activityChipText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: C.inkSoft,
  },

  // Hours
  hoursName: {
    fontSize: 11,
    fontWeight: '700',
    color: C.inkMute,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairlineSoft,
  },
  hoursDay: {
    fontSize: 12,
    fontWeight: '500',
    color: C.inkSoft,
  },
  hoursVal: {
    fontSize: 12,
    color: C.inkMute,
  },

  // Fees
  feeCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 11,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  feeName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.ink,
    flex: 1,
    marginRight: 8,
  },
  feeCost: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.primary,
  },
  feeDesc: {
    fontSize: 11,
    color: C.inkMute,
    lineHeight: 15,
  },

  // Links / contact
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  linkBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: C.primary,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 12.5,
    color: C.ink,
    flex: 1,
  },

  // Weather
  weatherCard: {
    backgroundColor: C.surface,
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 11,
    width: 88,
    alignItems: 'center',
  },
  weatherDay: {
    fontSize: 9,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.2,
    marginBottom: 5,
    textAlign: 'center',
  },
  weatherEmoji: {
    fontSize: 22,
    marginBottom: 3,
  },
  weatherTemp: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
  },
  weatherLow: {
    fontSize: 9,
    color: C.inkMute,
    marginTop: 1,
    marginBottom: 4,
  },
  weatherDesc: {
    fontSize: 9,
    color: C.inkMute,
    textAlign: 'center',
    lineHeight: 12,
    marginTop: 3,
  },

  // Journal / visit cards
  visitCard: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 10,
    overflow: 'hidden',
  },
  visitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    gap: 6,
  },
  visitCardBody: {
    padding: 11,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    backgroundColor: C.surfaceAlt,
  },
  visitDate: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.ink,
  },
  visitTitle: {
    fontSize: 11,
    color: C.inkSoft,
    marginTop: 1,
  },
  visitNotes: {
    fontSize: 12,
    color: C.inkSoft,
    lineHeight: 18,
  },
  visitPhoto: {
    width: 70,
    height: 56,
    borderRadius: 7,
  },
  visitEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  visitEditBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.primary,
  },

  // Attribution
  attribution: {
    marginHorizontal: 18,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    marginTop: 4,
  },
  attributionText: {
    fontSize: 10,
    color: C.inkMute,
    lineHeight: 14,
    textAlign: 'center',
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
