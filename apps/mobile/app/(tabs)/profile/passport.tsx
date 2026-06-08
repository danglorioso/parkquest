import {
  Dimensions, FlatList, Image, Platform, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2EBDB',
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkSoft:     '#3C3A33',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  primary:     '#1F3D2E',
  primaryDeep: '#152A20',
};

const PAPER   = '#FAF3E0';
const P_INK   = '#3A2E1C';
const P_MUTE  = 'rgba(58,46,28,0.55)';
const P_FAINT = 'rgba(58,46,28,0.22)';
const FOIL    = '#A87E2C';
const COVER_FOIL = '#C9A94A';

const STAMP_COLORS = ['#5A2418', '#1F3D2E', '#2D4F66', '#3A2E5C', '#7B3A1F'];
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const W    = Dimensions.get('window').width;

// Column math: 16px padding each side, 8px gap between 3 columns
const CELL_W  = Math.floor((W - 32 - 16) / 3);
const STAMP_D = Math.min(96, CELL_W - 8);  // diameter, max 96px

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Park {
  park_code: string;
  name: string;
  states: string;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

interface StampItem {
  park_code: string;
  name: string;
  states: string;
  visited: boolean;
  visited_date: string | null;
  colorIdx: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function explorerRank(n: number): string {
  if (n >= 63) return 'NATIONAL LEGEND';
  if (n >= 50) return 'PIONEER';
  if (n >= 30) return 'TRAILBLAZER';
  if (n >= 15) return 'RANGER';
  if (n >= 5)  return 'EXPLORER';
  if (n >= 1)  return 'INITIATE';
  return 'TRAILHEAD';
}

function stampColor(idx: number): string {
  return STAMP_COLORS[idx % STAMP_COLORS.length];
}

function passportNo(username: string): string {
  const n = ((username.length * 73291 + 41023) % 9999999).toString().padStart(7, '0');
  return `PQ${n}`;
}

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
  Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

function stateCode(states: string): string {
  const first = states.split(',')[0]?.trim() ?? states;
  if (first.length <= 3) return first.toUpperCase();
  return STATE_ABBR[first] ?? first.slice(0, 2).toUpperCase();
}

function stampDateStr(iso: string): string {
  const d = new Date(iso);
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${M[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Passport cover ────────────────────────────────────────────────────────────

function PassportCover({ onOpen }: { onOpen: () => void }) {
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.88} style={st.cover}>
      {/* Corner brackets — TL, TR, BL, BR */}
      {(['tl','tr','bl','br'] as const).map(pos => (
        <View key={pos} style={[st.corner, {
          top:    pos[0] === 't' ? 12 : undefined,
          bottom: pos[0] === 'b' ? 12 : undefined,
          left:   pos[1] === 'l' ? 12 : undefined,
          right:  pos[1] === 'r' ? 12 : undefined,
          transform: [{
            rotate: pos === 'tr' ? '90deg' : pos === 'bl' ? '-90deg' : pos === 'br' ? '180deg' : '0deg',
          }],
        }]}>
          <View style={{ width: 2, height: 16, backgroundColor: COVER_FOIL + 'CC', position: 'absolute', top: 0, left: 0 }} />
          <View style={{ width: 14, height: 2, backgroundColor: COVER_FOIL + 'CC', position: 'absolute', top: 0, left: 0 }} />
        </View>
      ))}

      <View style={{ alignItems: 'center' }}>
        <Text style={st.coverCountry}>UNITED STATES OF AMERICA</Text>
        <Text style={[st.coverCountry, { opacity: 0.65, marginTop: 2 }]}>NATIONAL PARK SERVICE</Text>

        {/* Seal */}
        <View style={st.seal}>
          <View style={st.sealOuter} />
          <View style={st.sealInner} />
          <View style={st.sealInner2} />
          <Text style={{ fontSize: 26, position: 'absolute' }}>🏔</Text>
        </View>

        <Text style={st.coverTitle}>PARKQUEST</Text>
        <Text style={st.coverSubtitle}>PASSPORT</Text>
        <Text style={st.coverTagline}>63 PARKS · 8 REGIONS · ONE QUEST</Text>
      </View>

      <Text style={[st.coverCountry, { marginTop: 24, opacity: 0.55 }]}>TAP TO OPEN ›</Text>
    </TouchableOpacity>
  );
}

// ── Passport data page ────────────────────────────────────────────────────────

function PassportDataPage({
  profile, avatarUrl, visitedCount, statesCount,
  bucketCount, badgeCount, totalBadges, pNo,
}: {
  profile:      ProfileInfo | null;
  avatarUrl:    string | null;
  visitedCount: number;
  statesCount:  number;
  bucketCount:  number;
  badgeCount:   number;
  totalBadges:  number;
  pNo:          string;
}) {
  const name = profile?.display_name ?? profile?.username ?? 'Explorer';
  const rank = explorerRank(visitedCount);

  return (
    <View style={st.dataPage}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 0.5, borderBottomColor: P_FAINT, paddingBottom: 10, marginBottom: 14 }}>
        <View style={st.dataSeal}>
          <Text style={{ fontSize: 14 }}>⛰</Text>
        </View>
        <View>
          <Text style={st.dataOrgTitle}>PARKQUEST</Text>
          <Text style={st.dataOrgSub}>NATIONAL PARK PASSPORT</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={st.dataPassportNo}>NO · {pNo}</Text>
        </View>
      </View>

      {/* Photo + bearer info */}
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
        <View style={st.dataPhoto}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFFBF1' }}>
                {name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={st.dataBearer}>BEARER</Text>
          <Text style={st.dataName} numberOfLines={2}>{name}</Text>
          {profile?.username ? <Text style={st.dataUsername}>@{profile.username}</Text> : null}
          {profile?.bio ? <Text style={st.dataBio} numberOfLines={3}>&ldquo;{profile.bio}&rdquo;</Text> : null}
        </View>
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: P_FAINT, borderBottomWidth: 0.5, borderBottomColor: P_FAINT, paddingVertical: 14, marginTop: 26, marginBottom: 12 }}>
        {[
          { label: 'VISITED', value: visitedCount, suf: '/63' },
          { label: 'STATES',  value: statesCount,  suf: '/50' },
          { label: 'BUCKET',  value: bucketCount,  suf: null  },
          { label: 'BADGES',  value: badgeCount,   suf: `/${totalBadges}` },
        ].map((s, i) => (
          <View key={s.label} style={[st.dataStat, i > 0 && { borderLeftWidth: 0.5, borderLeftColor: P_MUTE }]}>
            <Text style={st.dataStatLabel}>{s.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1, marginTop: 3 }}>
              <Text style={st.dataStatVal}>{s.value}</Text>
              {s.suf ? <Text style={st.dataStatSuf}>{s.suf}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      {/* Meta grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        {[
          { label: 'EXPLORER CLASS', value: rank },
          { label: 'VALID THRU',     value: 'LIFETIME' },
          { label: 'ISSUED',         value: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase() },
          { label: 'TYPE · CODE',    value: 'E · USA/NPS' },
        ].map(s => (
          <View key={s.label} style={{ width: '46%' }}>
            <Text style={st.dataMetaLabel}>{s.label}</Text>
            <Text style={st.dataMetaVal}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Signature + status */}
      <View style={{ borderTopWidth: 0.5, borderTopColor: P_FAINT, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Text style={st.dataMetaLabel}>BEARER SIGNATURE</Text>
          <Text style={st.dataSignature}>{name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={st.dataMetaLabel}>STATUS</Text>
          <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, backgroundColor: visitedCount > 0 ? 'rgba(31,92,46,0.12)' : 'transparent' }}>
            <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: visitedCount > 0 ? '#1F5C2E' : P_MUTE }}>
              {visitedCount > 0 ? '● ACTIVE' : '○ INACTIVE'}
            </Text>
          </View>
        </View>
      </View>

      {/* MRZ */}
      <Text style={st.mrz} numberOfLines={2}>
        {'P<USA'}{(name.split(' ')[1] ?? 'EXPLORER').toUpperCase()}
        {'<<'}{(name.split(' ')[0] ?? '').toUpperCase()}
        {'<<'}{pNo}{'USA'}
        {visitedCount.toString().padStart(2, '0')}{'63'}
        {badgeCount.toString().padStart(2, '0')}{'<<<<'}
      </Text>
    </View>
  );
}

// ── Stamp cell (visited) ──────────────────────────────────────────────────────

function StampCell({ item, onPress }: { item: StampItem; onPress: () => void }) {
  const c    = stampColor(item.colorIdx);
  const sc   = stateCode(item.states);
  const date = item.visited_date ? stampDateStr(item.visited_date) : '';
  const raw  = item.name.toUpperCase();
  const short = raw.length > 14 ? raw.slice(0, 12) + '…' : raw;
  const rotate = `${((item.colorIdx * 37) % 16) - 8}deg`;
  const R = STAMP_D / 2;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{ width: CELL_W, alignItems: 'center', paddingVertical: 12 }}
    >
      {/* Stamp ring + content — rotated */}
      <View style={{ transform: [{ rotate }] }}>
        <View style={{
          width:  STAMP_D, height: STAMP_D, borderRadius: R,
          borderWidth: 2, borderColor: c + 'D9',        // outer ring 85% opacity
          backgroundColor: c + '10',                     // subtle fill
          alignItems: 'center', justifyContent: 'center',
          overflow: 'visible',
        }}>
          {/* Inner dashed ring */}
          <View style={{
            position: 'absolute',
            width: STAMP_D - 12, height: STAMP_D - 12,
            borderRadius: (STAMP_D - 12) / 2,
            borderWidth: 1, borderColor: c + 'B3',
            borderStyle: 'dashed',
          }} />

          {/* Content stack */}
          <View style={{ alignItems: 'center', gap: 1, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 8.5, fontWeight: '700', color: c, letterSpacing: 1.4 }}>
              ★ {sc} ★
            </Text>
            {/* Mountain silhouette — approximation using borders */}
            <MountainSilhouette color={c} size={Math.floor(STAMP_D * 0.3)} />
            <Text
              numberOfLines={2}
              style={{ fontSize: 7.5, fontWeight: '800', color: c, textAlign: 'center', lineHeight: 9.5, letterSpacing: 0.4 }}
            >
              {short}
            </Text>
            {date ? (
              <Text style={{ fontSize: 6.5, fontWeight: '600', color: c, letterSpacing: 0.6, marginTop: 1 }}>
                {date}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Park name label (not rotated) */}
      <Text
        numberOfLines={2}
        style={{ fontSize: 9, fontWeight: '600', color: C.inkSoft, textAlign: 'center', marginTop: 6, lineHeight: 12, maxWidth: CELL_W - 8 }}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );
}

// ── Mountain silhouette (no SVG — pure View) ──────────────────────────────────

function MountainSilhouette({ color, size }: { color: string; size: number }) {
  const h = size;
  const w = size * 1.4;
  // Two triangles composited: left peak and right (taller) peak
  return (
    <View style={{ width: w, height: h, position: 'relative', overflow: 'hidden' }}>
      {/* Left lower peak */}
      <View style={{
        position: 'absolute', bottom: 0,
        left: 0, width: 0, height: 0,
        borderLeftWidth: Math.floor(w * 0.38), borderRightWidth: Math.floor(w * 0.28),
        borderBottomWidth: Math.floor(h * 0.72),
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: color + 'CC',
      }} />
      {/* Right taller peak */}
      <View style={{
        position: 'absolute', bottom: 0,
        right: 0, width: 0, height: 0,
        borderLeftWidth: Math.floor(w * 0.32), borderRightWidth: Math.floor(w * 0.34),
        borderBottomWidth: h,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: color + 'D9',
      }} />
      {/* Snow cap dot */}
      <View style={{
        position: 'absolute', top: 0, right: Math.floor(w * 0.22),
        width: 3, height: 3, borderRadius: 1.5,
        backgroundColor: color, opacity: 0.85,
      }} />
    </View>
  );
}

// ── Stamp placeholder (unvisited) ─────────────────────────────────────────────

function StampPlaceholder({ item }: { item: StampItem }) {
  const R = STAMP_D / 2;
  return (
    <View style={{ width: CELL_W, alignItems: 'center', paddingVertical: 12, opacity: 0.28 }}>
      <View style={{
        width: STAMP_D, height: STAMP_D, borderRadius: R,
        borderWidth: 1.5, borderColor: C.inkMute, borderStyle: 'dashed',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="add" size={20} color={C.inkMute} />
      </View>
      <Text
        numberOfLines={2}
        style={{ fontSize: 9, fontWeight: '500', color: C.inkMute, textAlign: 'center', marginTop: 6, lineHeight: 12, maxWidth: CELL_W - 8 }}
      >
        {item.name}
      </Text>
    </View>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonStamp() {
  const R = STAMP_D / 2;
  return (
    <View style={{ width: CELL_W, alignItems: 'center', paddingVertical: 12 }}>
      <View style={{ width: STAMP_D, height: STAMP_D, borderRadius: R, backgroundColor: C.surfaceAlt }} />
      <View style={{ width: CELL_W - 20, height: 9, borderRadius: 4, backgroundColor: C.surfaceAlt, marginTop: 8 }} />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PassportScreen() {
  const { getToken }  = useAuth();
  const { user }      = useUser();
  const router        = useRouter();

  const [profile,     setProfile]     = useState<ProfileInfo | null>(null);
  const [visits,      setVisits]      = useState<Visit[]>([]);
  const [allParks,    setAllParks]    = useState<Park[]>([]);
  const [badgeCount,  setBadgeCount]  = useState(0);
  const [totalBadges, setTotalBadges] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [open,        setOpen]        = useState(false);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    setLoading(true);
    setError(false);
    try {
      const [profRes, visitsRes, parksRes, badgesRes] = await Promise.allSettled([
        fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/visits`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/parks`,   { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/badges`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : { badges: [] }),
      ]);
      if ([profRes, visitsRes, parksRes, badgesRes].every(r => r.status === 'rejected')) {
        setError(true);
      }
      if (profRes.status   === 'fulfilled' && profRes.value)   setProfile(profRes.value);
      if (visitsRes.status === 'fulfilled') setVisits(visitsRes.value ?? []);
      if (parksRes.status  === 'fulfilled') setAllParks(parksRes.value ?? []);
      if (badgesRes.status === 'fulfilled') {
        const all = badgesRes.value?.badges ?? badgesRes.value ?? [];
        setBadgeCount(all.filter((b: { earned: boolean }) => b.earned).length);
        setTotalBadges(all.length);
      }
    } catch (e) {
      console.error('Passport load:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Build stamp items: visited first (most recent), then unvisited (alphabetical)
  const stampItems = useMemo((): StampItem[] => {
    const visitedMap = new Map<string, string>();
    visits.forEach(v => {
      if (!v.is_bucket_list && v.visited_date) visitedMap.set(v.park_code, v.visited_date);
    });

    const visited: StampItem[] = [];
    const unvisited: StampItem[] = [];

    allParks.forEach(p => {
      const vDate = visitedMap.get(p.park_code) ?? null;
      const item: Omit<StampItem, 'colorIdx'> = {
        park_code:    p.park_code,
        name:         p.name,
        states:       p.states,
        visited:      vDate !== null,
        visited_date: vDate,
      };
      if (vDate) visited.push({ ...item, colorIdx: 0 });
      else       unvisited.push({ ...item, colorIdx: 0 });
    });

    visited.sort((a, b) => (b.visited_date ?? '').localeCompare(a.visited_date ?? ''));
    unvisited.sort((a, b) => a.name.localeCompare(b.name));

    return [...visited, ...unvisited].map((item, idx) => ({ ...item, colorIdx: idx }));
  }, [allParks, visits]);

  const visitedCount = useMemo(() => stampItems.filter(s => s.visited).length, [stampItems]);
  const bucketCount  = useMemo(() => visits.filter(v => v.is_bucket_list).length, [visits]);
  const statesCount  = useMemo(() => {
    const s = new Set<string>();
    stampItems.filter(si => si.visited).forEach(si => si.states.split(',').forEach(st => s.add(st.trim())));
    return s.size;
  }, [stampItems]);

  const avatarUrl = profile?.avatar_url || user?.imageUrl || null;
  const pNo       = passportNo(profile?.username ?? user?.username ?? 'explorer');

  // Skeleton items for loading state
  const skeletonItems = useMemo(
    () => Array.from({ length: 21 }, (_, i) => ({ id: `sk${i}` })),
    [],
  );

  const ListHeader = (
    <View>
      {/* Page header */}
      <View style={st.pageHeader}>
        <Text style={st.kicker}>OFFICIAL ISSUE · NATIONAL PARK PASSPORT</Text>
        <Text style={st.pageTitle}>Your Passport</Text>
        <Text style={st.pageSub}>
          {loading ? 'Loading…' : `${visitedCount} of 63 parks stamped.`}
        </Text>
      </View>

      {/* Cover / data page toggle */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        {!open ? (
          <PassportCover onOpen={() => setOpen(true)} />
        ) : (
          <PassportDataPage
            profile={profile}
            avatarUrl={avatarUrl}
            visitedCount={visitedCount}
            statesCount={statesCount}
            bucketCount={bucketCount}
            badgeCount={badgeCount}
            totalBadges={totalBadges}
            pNo={pNo}
          />
        )}
        <TouchableOpacity
          style={st.toggleBtn}
          onPress={() => setOpen(o => !o)}
        >
          {open ? (
            <>
              <Ionicons name="chevron-back" size={12} color={C.primary} />
              <Text style={st.toggleBtnText}>CLOSE PASSPORT</Text>
            </>
          ) : (
            <>
              <Text style={st.toggleBtnText}>OPEN PASSPORT</Text>
              <Ionicons name="chevron-forward" size={12} color={C.primary} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* All stamps header */}
      <View style={[st.stampsHeader, { marginHorizontal: 16 }]}>
        <View>
          <Text style={st.kicker}>
            {loading ? 'LOADING…' : `${visitedCount} STAMPS · MOST RECENT FIRST`}
          </Text>
          <Text style={st.stampsSectionTitle}>Every stamp in your book</Text>
        </View>
        <View style={st.progressPill}>
          <Text style={st.progressText}>{visitedCount}<Text style={{ opacity: 0.6 }}>/63</Text></Text>
        </View>
      </View>
    </View>
  );

  if (error && allParks.length === 0) {
    return (
      <SafeAreaView style={st.screen} edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load</Text>
          <TouchableOpacity
            onPress={() => load()}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.screen} edges={['bottom']}>
      {loading ? (
        <FlatList
          data={skeletonItems}
          keyExtractor={item => item.id}
          numColumns={3}
          ListHeaderComponent={ListHeader}
          columnWrapperStyle={st.colWrapper}
          renderItem={() => <SkeletonStamp />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          scrollEnabled={false}
        />
      ) : (
        <FlatList
          data={stampItems}
          keyExtractor={item => item.park_code}
          numColumns={3}
          ListHeaderComponent={ListHeader}
          columnWrapperStyle={st.colWrapper}
          renderItem={({ item }) => (
            item.visited
              ? <StampCell   item={item} onPress={() => router.push(`/parks/${item.park_code}` as never)} />
              : <StampPlaceholder item={item} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          getItemLayout={(_, index) => ({
            length: STAMP_D + 36,       // stamp + name text height
            offset: (STAMP_D + 36) * Math.floor(index / 3),
            index,
          })}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  colWrapper: {
    paddingHorizontal: 16,
    gap: 8,
  },

  pageHeader: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20,
  },
  kicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6, marginBottom: 5,
  },
  pageTitle: {
    fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.6,
  },
  pageSub: {
    fontSize: 14, color: C.inkMute, marginTop: 6,
  },

  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14, paddingVertical: 10,
  },
  toggleBtnText: {
    fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 1.5,
  },

  stampsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: PAPER, borderTopLeftRadius: 14, borderTopRightRadius: 14,
    borderWidth: 0.5, borderColor: C.hairline, marginTop: 8,
  },
  stampsSectionTitle: {
    fontSize: 20, fontWeight: '800', color: P_INK, letterSpacing: -0.3, marginTop: 2,
  },
  progressPill: {
    backgroundColor: C.surfaceAlt, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  progressText: {
    fontSize: 14, fontWeight: '800', color: C.ink, letterSpacing: -0.3,
  },

  // Cover card
  cover: {
    backgroundColor: C.primaryDeep,
    borderRadius: 14, padding: 28,
    alignItems: 'center',
    borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.3)',
    shadowColor: C.primaryDeep,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16,
    elevation: 8,
  },
  corner: {
    position: 'absolute', width: 16, height: 16, zIndex: 1,
  },
  seal: {
    width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center',
    marginTop: 16, marginBottom: 16, position: 'relative',
  },
  sealOuter: {
    position: 'absolute', width: 68, height: 68, borderRadius: 34,
    borderWidth: 1.5, borderColor: COVER_FOIL + 'AA',
  },
  sealInner: {
    position: 'absolute', width: 56, height: 56, borderRadius: 28,
    borderWidth: 0.5, borderColor: COVER_FOIL + '77', borderStyle: 'dashed',
  },
  sealInner2: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    borderWidth: 0.5, borderColor: COVER_FOIL + '44',
  },
  coverCountry: {
    fontSize: 9, fontWeight: '600', color: COVER_FOIL, letterSpacing: 2.5, textAlign: 'center',
  },
  coverTitle: {
    fontSize: 24, fontWeight: '900', color: COVER_FOIL, letterSpacing: 5,
    textShadowColor: '#8A5E18', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
  },
  coverSubtitle: {
    fontSize: 13, fontWeight: '700', color: COVER_FOIL, letterSpacing: 4, marginTop: 3, opacity: 0.85,
  },
  coverTagline: {
    fontSize: 9, fontWeight: '500', color: COVER_FOIL, letterSpacing: 2.5, opacity: 0.55, marginTop: 14,
  },

  // Data page
  dataPage: {
    backgroundColor: PAPER,
    borderRadius: 18, borderWidth: 0.5, borderColor: C.hairline,
    padding: 16,
    shadowColor: 'rgba(58,42,18,0.1)', shadowOffset: { width: 0, height: 8 }, shadowRadius: 22, shadowOpacity: 1,
    elevation: 4,
  },
  dataSeal: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: FOIL,
    alignItems: 'center', justifyContent: 'center',
  },
  dataOrgTitle: {
    fontSize: 11, fontWeight: '900', letterSpacing: 2, color: FOIL,
  },
  dataOrgSub: {
    fontSize: 7.5, fontWeight: '500', letterSpacing: 1.2, color: FOIL, opacity: 0.75,
  },
  dataPassportNo: {
    fontSize: 9, fontWeight: '600', color: FOIL, letterSpacing: 1.2,
  },
  dataPhoto: {
    width: 108, height: 130, borderWidth: 0.5, borderColor: P_MUTE,
    backgroundColor: C.surfaceAlt, overflow: 'hidden', flexShrink: 0,
  },
  dataBearer: {
    fontSize: 8.5, fontWeight: '600', color: P_MUTE, letterSpacing: 1.6, textTransform: 'uppercase',
  },
  dataName: {
    fontSize: 26, fontWeight: '900', color: P_INK, letterSpacing: -0.6, lineHeight: 28, marginTop: 4,
  },
  dataUsername: {
    fontSize: 11, fontWeight: '600', color: P_INK, letterSpacing: 0.4, marginTop: 4,
  },
  dataBio: {
    fontSize: 13, color: P_INK, lineHeight: 19, fontStyle: 'italic', opacity: 0.85, marginTop: 10,
  },
  dataStat: {
    flex: 1, paddingHorizontal: 8,
  },
  dataStatLabel: {
    fontSize: 8, fontWeight: '600', color: P_MUTE, letterSpacing: 1.5, textTransform: 'uppercase',
  },
  dataStatVal: {
    fontSize: 24, fontWeight: '900', color: P_INK, letterSpacing: -1,
  },
  dataStatSuf: {
    fontSize: 9, fontWeight: '600', color: P_MUTE,
  },
  dataMetaLabel: {
    fontSize: 7.5, fontWeight: '600', color: P_MUTE, letterSpacing: 1.5, textTransform: 'uppercase',
  },
  dataMetaVal: {
    fontSize: 11.5, fontWeight: '700', color: P_INK, marginTop: 2, letterSpacing: 0.3,
  },
  dataSignature: {
    fontStyle: 'italic', fontSize: 17, color: P_INK, marginTop: 3, letterSpacing: 0.5,
  },
  mrz: {
    marginTop: 10, fontSize: 9, letterSpacing: 1.2, color: P_MUTE,
    lineHeight: 14, borderTopWidth: 0.5, borderTopColor: P_FAINT, paddingTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
