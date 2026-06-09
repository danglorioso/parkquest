import { useCallback, useRef, useState } from 'react';
import {
  Animated, Dimensions, PanResponder, Platform,
  Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
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
  // Exact marker colors from USAMapGL.tsx
  visited:     '#2F7A4A',
  bucket:      '#D89A3A',
  unvisited:   '#A8A29A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const SHEET_HALF = SCREEN_H * 0.48;
const SHEET_FULL = SCREEN_H * 0.87;

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

// ── ParkMarker ────────────────────────────────────────────────────────────────

function ParkMarker({ park, selected }: { park: ParkForMap; selected: boolean }) {
  const { color, dotR, haloR, haloOpacity } = markerConfig(park.status, selected);
  const sz = haloR * 2;
  return (
    <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
      {/* Halo */}
      <View style={{
        position: 'absolute',
        width: sz, height: sz, borderRadius: haloR,
        backgroundColor: color, opacity: haloOpacity,
      }} />
      {/* Dot */}
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
  const baseH    = useRef(SHEET_HALF);
  const [npsImages, setNpsImages] = useState<string[]>(
    park.image_url ? [park.image_url] : []
  );
  const [imgIdx, setImgIdx] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [npsActivities,   setNpsActivities]   = useState<string[]>([]);
  const [npsEntranceFees, setNpsEntranceFees] = useState<Array<{ title: string; cost: string }>>([]);
  const [npsFeesFree,     setNpsFeesFree]     = useState<boolean | null>(null);
  const [expandedVisits,  setExpandedVisits]  = useState<Set<number>>(new Set());

  // Animate in
  useEffect(() => {
    baseH.current = SHEET_HALF;
    sheetH.setValue(0);
    Animated.spring(sheetH, {
      toValue: SHEET_HALF, useNativeDriver: false,
      damping: 30, mass: 0.9, stiffness: 200,
    }).start();
  }, [park.park_code]);

  // Lazy-load NPS images + data
  useEffect(() => {
    if (park.image_url) setNpsImages([park.image_url]);
    else setNpsImages([]);
    setImgIdx(0);
    setNpsActivities([]);
    setNpsEntranceFees([]);
    setNpsFeesFree(null);
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
      .then((data: { activities?: string[]; entranceFees?: Array<{ title: string; cost: string }> } | null) => {
        if (!data) return;
        setNpsActivities((data.activities ?? []).slice(0, 8));
        setNpsEntranceFees(data.entranceFees ?? []);
        setNpsFeesFree((data.entranceFees ?? []).length === 0);
      })
      .catch(() => {});
  }, [park.park_code, token, park.image_url]);

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
        const projected = baseH.current - g.dy;
        const mid = (SHEET_HALF + SHEET_FULL) / 2;
        if (g.vy > 0.9 || projected < SHEET_HALF * 0.45) {
          dismiss();
        } else if (g.vy < -0.5 || projected > mid) {
          snapTo(SHEET_FULL);
        } else {
          snapTo(SHEET_HALF);
        }
      },
    })
  ).current;

  const heroUrl = npsImages[imgIdx] ?? null;
  const sortedVisits = park.visits
    ? [...park.visits].sort(
        (a, b) => new Date(b.visited_date).getTime() - new Date(a.visited_date).getTime()
      )
    : [];

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
    if (park.status === 'bucketList') {
      setActionLoading('bucket');
      try {
        await fetch(`${BASE}/api/visits?park_code=${park.park_code}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        onStatusChange(park.park_code, 'notVisited');
      } catch { /* ignore */ }
      setActionLoading(null);
    } else {
      setActionLoading('bucket');
      try {
        await fetch(`${BASE}/api/visits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ park_code: park.park_code, is_bucket_list: true }),
        });
        onStatusChange(park.park_code, 'bucketList');
      } catch { /* ignore */ }
      setActionLoading(null);
    }
  };

  const stateLabel = fullStateName(park.states.split(',')[0].trim());

  return (
    <>
      {/* Backdrop — tap to dismiss */}
      <Pressable style={styles.backdrop} onPress={dismiss} />

      <Animated.View style={[styles.sheet, { height: sheetH }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handleBar} />
        </View>

        {/* Hero image */}
        <View style={[styles.hero, { backgroundColor: parkBgColor(park.park_code) }]}>
          {heroUrl ? (
            <Image
              source={{ uri: heroUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}

          {/* Image counter + prev/next */}
          {npsImages.length > 1 && (
            <>
              <View style={styles.imgCounter}>
                <Text style={styles.imgCounterText}>{imgIdx + 1} / {npsImages.length}</Text>
              </View>
              {imgIdx > 0 && (
                <TouchableOpacity
                  style={[styles.imgNav, { left: 10 }]}
                  onPress={() => setImgIdx(i => i - 1)}
                >
                  <Ionicons name="chevron-back" size={15} color="#FFFBF1" />
                </TouchableOpacity>
              )}
              {imgIdx < npsImages.length - 1 && (
                <TouchableOpacity
                  style={[styles.imgNav, { right: 10 }]}
                  onPress={() => setImgIdx(i => i + 1)}
                >
                  <Ionicons name="chevron-forward" size={15} color="#FFFBF1" />
                </TouchableOpacity>
              )}
              <View style={styles.imgDots}>
                {npsImages.map((_, k) => (
                  <View
                    key={k}
                    style={[
                      styles.imgDot,
                      { backgroundColor: k === imgIdx ? '#FFFBF1' : 'rgba(255,251,241,0.40)' },
                    ]}
                  />
                ))}
              </View>
            </>
          )}

          {/* Close button */}
          <TouchableOpacity style={styles.heroClose} onPress={dismiss} hitSlop={8}>
            <Ionicons name="close" size={14} color="#FFFBF1" />
          </TouchableOpacity>

          {/* Status chip */}
          <View style={styles.heroStatus}>
            <StatusChip status={park.status} />
          </View>
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.sheetBody}
          showsVerticalScrollIndicator={false}
        >
          {/* Name + state + full-profile link */}
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => router.push(`/parks/${park.park_code}` as never)}>
                <Text style={styles.parkName}>{park.name}</Text>
              </TouchableOpacity>
              <Text style={styles.parkState}>{stateLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/parks/${park.park_code}` as never)}
              style={styles.profileLink}
            >
              <Text style={styles.profileLinkText}>Full profile</Text>
              <Ionicons name="arrow-forward" size={10} color={C.primary} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          {park.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionKicker}>ABOUT THIS PARK</Text>
              <Text style={styles.sectionBody}>{park.description}</Text>
            </View>
          ) : null}

          {/* Activities */}
          {npsActivities.length > 0 && (
            <View style={styles.section}>
              <View style={styles.kickerRow}>
                <Ionicons name="walk-outline" size={9} color={C.inkMute} />
                <Text style={styles.sectionKicker}>ACTIVITIES</Text>
              </View>
              <View style={styles.chipWrap}>
                {npsActivities.map(a => (
                  <View key={a} style={styles.activityChip}>
                    <Text style={styles.activityChipText}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Entrance fees */}
          {npsFeesFree !== null && (
            <View style={styles.section}>
              <View style={styles.kickerRow}>
                <Ionicons name="cash-outline" size={9} color={C.inkMute} />
                <Text style={styles.sectionKicker}>ENTRANCE</Text>
              </View>
              {npsFeesFree ? (
                <Text style={[styles.sectionBody, { fontWeight: '500' }]}>Free to visit</Text>
              ) : (
                npsEntranceFees.slice(0, 2).map((fee, i) => (
                  <View key={i} style={styles.feeRow}>
                    <Text style={styles.feeTitle}>{fee.title}</Text>
                    <Text style={styles.feeCost}>${parseFloat(fee.cost).toFixed(0)}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Visits */}
          {park.status === 'visited' && sortedVisits.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionKicker}>VISITS · {sortedVisits.length}</Text>
              <View style={{ gap: 5 }}>
                {sortedVisits.slice(0, 3).map(v => {
                  const isExpanded = expandedVisits.has(v.id);
                  return (
                    <View key={v.id} style={styles.visitRow}>
                      <TouchableOpacity
                        onPress={() => setExpandedVisits(prev => {
                          const s = new Set(prev);
                          s.has(v.id) ? s.delete(v.id) : s.add(v.id);
                          return s;
                        })}
                        style={styles.visitRowHeader}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.visitDate}>{formatDateRange(v.visited_date, v.end_date)}</Text>
                          {v.title ? (
                            <Text style={styles.visitTitle} numberOfLines={1}>{v.title}</Text>
                          ) : null}
                        </View>
                        <Ionicons
                          name="chevron-down"
                          size={13}
                          color={C.inkMute}
                          style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                        />
                      </TouchableOpacity>
                      {isExpanded && (
                        <View style={styles.visitExpanded}>
                          {v.notes ? (
                            <Text style={styles.visitNotes}>{v.notes}</Text>
                          ) : (
                            <Text style={[styles.visitNotes, { fontStyle: 'italic', color: C.inkMute }]}>
                              No notes
                            </Text>
                          )}
                          {sortedVisits[0]?.id === v.id && park.photos && park.photos.length > 0 && (
                            <View style={styles.visitPhotos}>
                              {park.photos.map(url => (
                                <Image
                                  key={url}
                                  source={{ uri: url }}
                                  style={styles.visitPhoto}
                                  contentFit="cover"
                                  cachePolicy="memory-disk"
                                />
                              ))}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Action row */}
        <View style={styles.actionRow}>
          {park.status === 'visited' ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  if (sortedVisits[0]) router.push(`/profile/journal/${sortedVisits[0].id}` as never);
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
              <TouchableOpacity
                onPress={() => router.push(`/parks/${park.park_code}` as never)}
                style={[styles.actionBtn, { backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline }]}
              >
                <Ionicons name="arrow-forward" size={14} color={C.ink} />
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
              <TouchableOpacity
                onPress={() => router.push(`/parks/${park.park_code}` as never)}
                style={[styles.actionBtn, { backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline }]}
              >
                <Ionicons name="arrow-forward" size={14} color={C.ink} />
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

  const [token, setToken]               = useState<string | null>(null);
  const [parks, setParks]               = useState<ParkForMap[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedPark, setSelectedPark] = useState<ParkForMap | null>(null);
  const [loading, setLoading]           = useState(true);
  const mapRef = useRef<MapView>(null);

  // Counts for filter pill
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
          if (visitedSet.has(p.park_code))    status = 'visited';
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
    mapRef.current?.animateToRegion(
      {
        latitude:       park.latitude,
        longitude:      park.longitude,
        latitudeDelta:  1.5,
        longitudeDelta: 1.5,
      },
      500
    );
  }, []);

  return (
    <View style={styles.screen}>
      {/* Full-bleed map */}
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

      {/* Filter pill — top-left, below notch/status bar */}
      {!loading && (
        <View style={[styles.filterPillWrap, { top: insets.top + 12 }]}>
          <FilterPill
            active={filterStatus}
            counts={counts}
            onSelect={f => { setFilterStatus(f); setSelectedPark(null); }}
          />
        </View>
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={[styles.loadingWrap, { top: insets.top + 12 }]}>
          <View style={styles.pill}>
            <Text style={[styles.pillLabel, { marginLeft: 0 }]}>Loading parks…</Text>
          </View>
        </View>
      )}

      {/* Park bottom sheet */}
      {selectedPark && token && (
        <ParkBottomSheet
          key={selectedPark.park_code}
          park={selectedPark}
          token={token}
          onClose={() => setSelectedPark(null)}
          onStatusChange={handleStatusChange}
        />
      )}
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
    height: 140,
    flexShrink: 0,
    overflow: 'hidden',
  },
  imgCounter: {
    position: 'absolute',
    top: 10,
    right: 10,
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
    backgroundColor: 'rgba(20,17,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgDots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  imgDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  heroClose: {
    position: 'absolute',
    top: 10,
    right: 44,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20,17,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatus: {
    position: 'absolute',
    bottom: 10,
    left: 14,
  },

  // Body
  sheetBody: {
    paddingBottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  parkName: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  parkState: {
    fontSize: 10,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.8,
    marginTop: 10,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingTop: 3,
  },
  profileLinkText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: 0.4,
  },
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
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
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
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  feeTitle: {
    fontSize: 12,
    color: C.inkSoft,
    lineHeight: 16,
    flex: 1,
    marginRight: 8,
  },
  feeCost: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
    flexShrink: 0,
  },
  visitRow: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 9,
    overflow: 'hidden',
  },
  visitRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    paddingHorizontal: 11,
    gap: 8,
  },
  visitExpanded: {
    padding: 10,
    paddingHorizontal: 11,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    backgroundColor: C.surfaceAlt,
  },
  visitPhotos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 10,
  },
  visitPhoto: {
    width: 56,
    height: 56,
    borderRadius: 7,
  },
  visitDate: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink,
    lineHeight: 16,
  },
  visitTitle: {
    fontSize: 11,
    color: C.inkSoft,
    marginTop: 2,
  },
  visitNotes: {
    fontSize: 12.5,
    color: C.inkSoft,
    lineHeight: 19,
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
