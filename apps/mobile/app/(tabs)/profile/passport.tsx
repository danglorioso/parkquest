import {
  ActivityIndicator, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  primaryDeep:'#152A20',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Paper passport colors
const PAPER  = '#FAF3E0';
const P_INK  = '#3A2E1C';
const P_MUTE = 'rgba(58,46,28,0.55)';
const P_FAINT= 'rgba(58,46,28,0.22)';
const FOIL   = '#A87E2C';
const COVER_FOIL = '#C9A94A';

// Stamp color palette
const STAMP_COLORS = ['#5A2418', '#1F3D2E', '#2D4F66', '#3A2E5C', '#7B3A1F'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

interface Park {
  park_code: string;
  name: string;
  states: string;
}

interface VisitedPark {
  park_code: string;
  name: string;
  states: string;
  visited_date: string;
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

function stateCode(states: string): string {
  const first = states.split(',')[0]?.trim() ?? states;
  if (first.length <= 3) return first.toUpperCase();
  return first.slice(0, 2).toUpperCase();
}

function dateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Passport cover card ───────────────────────────────────────────────────────

function PassportCover({ onOpen }: { onOpen: () => void }) {
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.88} style={styles.cover}>
      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map(pos => (
        <View key={pos} style={[styles.corner, {
          top:    pos.includes('t') ? 12 : undefined,
          bottom: pos.includes('b') ? 12 : undefined,
          left:   pos.includes('l') ? 12 : undefined,
          right:  pos.includes('r') ? 12 : undefined,
          transform: [
            { rotate: pos === 'tr' ? '90deg' : pos === 'bl' ? '-90deg' : pos === 'br' ? '180deg' : '0deg' }
          ],
        }]}>
          <View style={[styles.cornerLine, { height: 16, width: 2, backgroundColor: COVER_FOIL + 'CC' }]} />
          <View style={[styles.cornerLine, { height: 2, width: 14, backgroundColor: COVER_FOIL + 'CC', position: 'absolute', top: 0, left: 0 }]} />
        </View>
      ))}

      <View style={{ alignItems: 'center' }}>
        <Text style={styles.coverCountry}>UNITED STATES OF AMERICA</Text>
        <Text style={[styles.coverCountry, { opacity: 0.65, marginTop: 2 }]}>NATIONAL PARK SERVICE</Text>
        {/* Seal decoration */}
        <View style={styles.seal}>
          <View style={styles.sealOuter} />
          <View style={styles.sealInner} />
          <Text style={{ fontSize: 28, position: 'absolute' }}>🏔</Text>
        </View>
        <Text style={styles.coverTitle}>PARKQUEST</Text>
        <Text style={styles.coverSubtitle}>PASSPORT</Text>
        <Text style={styles.coverTagline}>63 PARKS · 8 REGIONS · ONE QUEST</Text>
      </View>

      <Text style={[styles.coverCountry, { marginTop: 24, opacity: 0.55 }]}>TAP TO OPEN ›</Text>
    </TouchableOpacity>
  );
}

// ── Passport data page ────────────────────────────────────────────────────────

function PassportDataPage({
  profile, avatarUrl, visitedCount, statesCount,
  bucketCount, badgeCount, totalBadges, pNo,
}: {
  profile: ProfileInfo | null;
  avatarUrl: string | null;
  visitedCount: number;
  statesCount: number;
  bucketCount: number;
  badgeCount: number;
  totalBadges: number;
  pNo: string;
}) {
  const name = profile?.display_name ?? profile?.username ?? 'Explorer';
  const rank = explorerRank(visitedCount);

  return (
    <View style={styles.dataPage}>
      {/* Header */}
      <View style={[styles.dataSection, { borderBottomWidth: 0.5, borderBottomColor: P_FAINT, marginBottom: 14, paddingBottom: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.dataSeal}>
            <Text style={{ fontSize: 14 }}>⛰</Text>
          </View>
          <View>
            <Text style={styles.dataOrgTitle}>PARKQUEST</Text>
            <Text style={styles.dataOrgSub}>NATIONAL PARK PASSPORT</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.dataPassportNo}>NO · {pNo}</Text>
          </View>
        </View>
      </View>

      {/* Photo + bearer */}
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
        <View style={styles.dataPhoto}>
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
          <Text style={styles.dataBearer}>BEARER</Text>
          <Text style={styles.dataName} numberOfLines={2}>{name}</Text>
          {profile?.username ? (
            <Text style={styles.dataUsername}>@{profile.username}</Text>
          ) : null}
          {profile?.bio ? (
            <Text style={styles.dataBio} numberOfLines={3}>&ldquo;{profile.bio}&rdquo;</Text>
          ) : null}
        </View>
      </View>

      {/* Stats grid */}
      <View style={[styles.dataStatsRow, { borderTopWidth: 0.5, borderTopColor: P_FAINT, borderBottomWidth: 0.5, borderBottomColor: P_FAINT }]}>
        {[
          { label: 'VISITED', value: visitedCount, suf: '/63' },
          { label: 'STATES',  value: statesCount,  suf: '/50' },
          { label: 'BUCKET',  value: bucketCount,  suf: null },
          { label: 'BADGES',  value: badgeCount,   suf: `/${totalBadges}` },
        ].map((s, i) => (
          <View key={s.label} style={[styles.dataStat, i > 0 && { borderLeftWidth: 0.5, borderLeftColor: P_MUTE }]}>
            <Text style={styles.dataStatLabel}>{s.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1, marginTop: 3 }}>
              <Text style={styles.dataStatVal}>{s.value}</Text>
              {s.suf ? <Text style={styles.dataStatSuf}>{s.suf}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      {/* Meta grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {[
          { label: 'EXPLORER CLASS', value: rank },
          { label: 'VALID THRU',     value: 'LIFETIME' },
          { label: 'ISSUED',         value: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase() },
          { label: 'TYPE · CODE',    value: 'E · USA/NPS' },
        ].map(s => (
          <View key={s.label} style={{ width: '45%' }}>
            <Text style={styles.dataMetaLabel}>{s.label}</Text>
            <Text style={styles.dataMetaVal}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Signature */}
      <View style={[styles.dataSection, { borderTopWidth: 0.5, borderTopColor: P_FAINT, marginTop: 12, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <View>
          <Text style={styles.dataMetaLabel}>BEARER SIGNATURE</Text>
          <Text style={styles.dataSignature}>{name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: visitedCount > 0 ? 'rgba(31,92,46,0.12)' : 'transparent' }]}>
          <Text style={[styles.statusText, { color: visitedCount > 0 ? '#1F5C2E' : P_MUTE }]}>
            {visitedCount > 0 ? '● ACTIVE' : '○ INACTIVE'}
          </Text>
        </View>
      </View>

      {/* Machine-readable line */}
      <Text style={styles.mrz} numberOfLines={2}>
        {'P<USA'}
        {(name.split(' ')[1] ?? 'EXPLORER').toUpperCase()}
        {'<<'}
        {(name.split(' ')[0] ?? '').toUpperCase()}
        {'<<'}{pNo}{'USA'}
        {visitedCount.toString().padStart(2, '0')}
        {'63'}
        {badgeCount.toString().padStart(2, '0')}
        {'<<<<'}
      </Text>
    </View>
  );
}

// ── Stamp cell ────────────────────────────────────────────────────────────────

function StampCell({ park, idx, onPress }: { park: VisitedPark; idx: number; onPress: () => void }) {
  const c = stampColor(idx);
  const code = stateCode(park.states);
  const date = dateStr(park.visited_date);
  const name = park.name.toUpperCase();
  const shortName = name.length > 16 ? name.slice(0, 14) + '…' : name;
  const rotate = `${((idx * 37) % 14) - 7}deg`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ padding: 8 }}>
      <View style={{ transform: [{ rotate }] }}>
        <View style={[styles.stamp, { borderColor: c }]}>
          <View style={[styles.stampInner, { borderColor: c + '88' }]}>
            <Text style={[styles.stampCode, { color: c }]}>{code}</Text>
            <Text style={{ fontSize: 20 }}>⛰</Text>
            <Text style={[styles.stampName, { color: c }]} numberOfLines={2}>{shortName}</Text>
            <Text style={[styles.stampDate, { color: c }]}>{date}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PassportScreen() {
  const { getToken }  = useAuth();
  const { user }      = useUser();
  const router        = useRouter();

  const [profile,       setProfile]       = useState<ProfileInfo | null>(null);
  const [visitedParks,  setVisitedParks]  = useState<VisitedPark[]>([]);
  const [bucketCount,   setBucketCount]   = useState(0);
  const [badgeCount,    setBadgeCount]    = useState(0);
  const [totalBadges,   setTotalBadges]   = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [open,          setOpen]          = useState(false);

  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) return;
      try {
        const [profRes, visitsRes, parksRes, badgesRes] = await Promise.allSettled([
          fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : null),
          fetch(`${BASE}/api/visits`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
          fetch(`${BASE}/api/parks`,   { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
          fetch(`${BASE}/api/badges`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : { badges: [] }),
        ]);

        if (profRes.status === 'fulfilled')   setProfile(profRes.value);
        if (badgesRes.status === 'fulfilled') {
          const all = badgesRes.value.badges ?? [];
          setBadgeCount(all.filter((b: any) => b.earned).length);
          setTotalBadges(all.length);
        }

        if (visitsRes.status === 'fulfilled' && parksRes.status === 'fulfilled') {
          const vs = visitsRes.value as Visit[];
          const ps = parksRes.value as Park[];
          const parkMap = new Map(ps.map(p => [p.park_code, p]));
          const visitedSet = new Map<string, string>();
          vs.forEach(v => {
            if (!v.is_bucket_list && v.visited_date) visitedSet.set(v.park_code, v.visited_date);
          });
          setBucketCount(vs.filter(v => v.is_bucket_list).length);
          const vp: VisitedPark[] = Array.from(visitedSet.entries())
            .map(([code, date]) => {
              const p = parkMap.get(code);
              if (!p) return null;
              return { park_code: code, name: p.name, states: p.states, visited_date: date };
            })
            .filter(Boolean) as VisitedPark[];
          vp.sort((a, b) => new Date(b.visited_date).getTime() - new Date(a.visited_date).getTime());
          setVisitedParks(vp);
        }
      } catch (e) {
        console.error('Passport load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const statesCount = useMemo(() => {
    const s = new Set<string>();
    visitedParks.forEach(p => p.states.split(',').forEach(st => s.add(st.trim())));
    return s.size;
  }, [visitedParks]);

  const avatarUrl = profile?.avatar_url || user?.imageUrl || null;
  const pNo = passportNo(profile?.username ?? user?.username ?? 'explorer');

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }} edges={['bottom']}>
        <ActivityIndicator size="large" color={C.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.kicker}>OFFICIAL ISSUE · NATIONAL PARK PASSPORT</Text>
          <Text style={styles.pageTitle}>Your Passport</Text>
          <Text style={styles.pageSub}>A stamp for every park you've visited.</Text>
        </View>

        {/* Cover or data page */}
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          {!open ? (
            <PassportCover onOpen={() => setOpen(true)} />
          ) : (
            <PassportDataPage
              profile={profile}
              avatarUrl={avatarUrl}
              visitedCount={visitedParks.length}
              statesCount={statesCount}
              bucketCount={bucketCount}
              badgeCount={badgeCount}
              totalBadges={totalBadges}
              pNo={pNo}
            />
          )}
          {!open && (
            <TouchableOpacity
              style={styles.openBtn}
              onPress={() => setOpen(true)}
            >
              <Text style={styles.openBtnText}>OPEN PASSPORT</Text>
              <Ionicons name="chevron-forward" size={14} color={C.primary} />
            </TouchableOpacity>
          )}
          {open && (
            <TouchableOpacity
              style={[styles.openBtn, { justifyContent: 'center', gap: 6 }]}
              onPress={() => setOpen(false)}
            >
              <Ionicons name="chevron-back" size={14} color={C.primary} />
              <Text style={styles.openBtnText}>CLOSE PASSPORT</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stamps section */}
        {visitedParks.length > 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.kicker}>{visitedParks.length} STAMPS · MOST RECENT FIRST</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 3 }}>
                Every stamp in your book
              </Text>
            </View>
            {/* Parchment stamps grid */}
            <View style={styles.stampsGrid}>
              {visitedParks.map((p, i) => (
                <StampCell
                  key={p.park_code} park={p} idx={i}
                  onPress={() => router.push(`/parks/${p.park_code}` as never)}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>📖</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 6 }}>No stamps yet</Text>
            <Text style={{ fontSize: 13, color: C.inkMute, textAlign: 'center', lineHeight: 18 }}>
              Log your first visit to earn a passport stamp.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  pageHeader: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20,
  },
  kicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.2, marginBottom: 3,
  },
  pageTitle: {
    fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -0.5,
  },
  pageSub: {
    fontSize: 13, color: C.inkMute, marginTop: 2,
  },

  // Cover
  cover: {
    backgroundColor: C.primaryDeep,
    borderRadius: 14, padding: 28,
    alignItems: 'center',
    borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.3)',
    shadowColor: C.primaryDeep,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
    position: 'relative', overflow: 'hidden',
  },
  corner: {
    position: 'absolute', width: 16, height: 16, zIndex: 1,
  },
  cornerLine: {},
  seal: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    marginTop: 16, marginBottom: 16, position: 'relative',
  },
  sealOuter: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32,
    borderWidth: 1.5, borderColor: COVER_FOIL + 'AA',
  },
  sealInner: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    borderWidth: 0.5, borderColor: COVER_FOIL + '66', borderStyle: 'dashed',
  },
  coverCountry: {
    fontSize: 8, fontWeight: '600', color: COVER_FOIL, letterSpacing: 2.5,
    textAlign: 'center',
  },
  coverTitle: {
    fontSize: 24, fontWeight: '900', color: COVER_FOIL, letterSpacing: 5,
    textShadowColor: '#8A5E18', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
  },
  coverSubtitle: {
    fontSize: 12, fontWeight: '700', color: COVER_FOIL, letterSpacing: 4, marginTop: 3, opacity: 0.85,
  },
  coverTagline: {
    fontSize: 7.5, fontWeight: '500', color: COVER_FOIL, letterSpacing: 2, opacity: 0.55, marginTop: 14,
  },

  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 14, paddingVertical: 10,
  },
  openBtnText: {
    fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 1.5,
  },

  // Data page (parchment)
  dataPage: {
    backgroundColor: PAPER,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    padding: 16,
    shadowColor: 'rgba(58,42,18,0.1)', shadowOffset: { width: 0, height: 8 }, shadowRadius: 22, shadowOpacity: 1,
    elevation: 4,
  },
  dataSection: {},
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
    width: 90, height: 110, borderWidth: 0.5, borderColor: P_MUTE,
    backgroundColor: C.surfaceAlt, overflow: 'hidden', flexShrink: 0,
  },
  dataBearer: {
    fontSize: 8, fontWeight: '600', color: P_MUTE, letterSpacing: 1.4, textTransform: 'uppercase',
  },
  dataName: {
    fontSize: 20, fontWeight: '900', color: P_INK, letterSpacing: -0.5, lineHeight: 22, marginTop: 4,
  },
  dataUsername: {
    fontSize: 11, fontWeight: '600', color: P_INK, letterSpacing: 0.4, marginTop: 4,
  },
  dataBio: {
    fontSize: 11.5, color: P_INK, lineHeight: 16, fontStyle: 'italic', opacity: 0.8, marginTop: 6,
  },
  dataStatsRow: {
    flexDirection: 'row', paddingVertical: 14, marginVertical: 14,
  },
  dataStat: {
    flex: 1, paddingHorizontal: 8,
  },
  dataStatLabel: {
    fontSize: 7.5, fontWeight: '600', color: P_MUTE, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  dataStatVal: {
    fontSize: 20, fontWeight: '900', color: P_INK, letterSpacing: -0.5,
  },
  dataStatSuf: {
    fontSize: 8.5, fontWeight: '600', color: P_MUTE,
  },
  dataMetaLabel: {
    fontSize: 7.5, fontWeight: '600', color: P_MUTE, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  dataMetaVal: {
    fontSize: 11, fontWeight: '700', color: P_INK, marginTop: 2, letterSpacing: 0.2,
  },
  dataSignature: {
    fontStyle: 'italic', fontSize: 17, color: P_INK, marginTop: 3, letterSpacing: 0.5,
  },
  statusBadge: {
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusText: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.2,
  },
  mrz: {
    marginTop: 10, fontSize: 8.5, fontWeight: '400', color: P_MUTE,
    letterSpacing: 0.8, lineHeight: 14, borderTopWidth: 0.5, borderTopColor: P_FAINT, paddingTop: 8,
    fontFamily: 'Courier',
  },

  // Stamps grid
  stampsGrid: {
    backgroundColor: PAPER,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    padding: 8,
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
  },

  // Stamp cell
  stamp: {
    width: 82, height: 82, borderRadius: 41, borderWidth: 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  stampInner: {
    width: 74, height: 74, borderRadius: 37, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 1, padding: 4,
  },
  stampCode: {
    fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
  },
  stampName: {
    fontSize: 7.5, fontWeight: '700', textAlign: 'center', lineHeight: 9, letterSpacing: 0.3,
  },
  stampDate: {
    fontSize: 7, fontWeight: '600', letterSpacing: 0.5,
  },
});
