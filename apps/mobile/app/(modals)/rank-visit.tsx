import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, type ColorValue,
} from 'react-native';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { STATIC as C, useColors } from '@/lib/palette';
import { parkColor } from '@/lib/parkColors';
import { deriveRankScore, sortByRankKey } from '@parkquest/types';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

interface RankableVisit {
  id: number;
  park_code: string;
  park_name: string | null;
  park_image_url: string | null;
  cover_photo: string | null;
  rank_key: string | null;
}

async function apiFetch<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Beli-style: log first, rank second. Pushed right after a new visit saves —
// asks a coarse tier question, then binary-searches the exact slot against the
// user's already-ranked visits ("this vs that, which did you like more?") so
// placing #40 costs a handful of taps, not forty.
export default function RankVisitScreen() {
  const { visitId, parkCode, parkName } = useLocalSearchParams<{
    visitId: string; parkCode: string; parkName?: string;
  }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const T = useColors();

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<RankableVisit[]>([]);
  const [phase, setPhase] = useState<'tier' | 'compare' | 'saving' | 'done'>('tier');
  const [range, setRange] = useState<{ lo: number; hi: number } | null>(null);
  const [finalRank, setFinalRank] = useState<{ position: number; total: number; score: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thisVisitId = Number(visitId);
  const displayName = parkName || 'this park';

  useEffect(() => {
    (async () => {
      const tok = await getTokenRef.current();
      if (!tok) { setLoading(false); return; }
      try {
        const all = await apiFetch<RankableVisit[]>('/api/visits', tok);
        const ranked = sortByRankKey(all.filter((v) => v.id !== thisVisitId));
        setCandidates(ranked);
      } catch {
        setError("Couldn't load your other visits.");
      } finally {
        setLoading(false);
      }
    })();
  }, [thisVisitId]);

  const mid = range ? Math.floor((range.lo + range.hi) / 2) : -1;
  const midCandidate = mid >= 0 && mid < candidates.length ? candidates[mid] : null;

  async function commitRank(afterId: number | null, beforeId: number | null) {
    setPhase('saving');
    try {
      const tok = await getTokenRef.current();
      if (!tok) throw new Error('No auth token');
      await apiFetch(`/api/visits/${thisVisitId}/rank`, tok, {
        method: 'POST',
        body: JSON.stringify({ after_id: afterId, before_id: beforeId }),
      });
      const total = candidates.length + 1;
      const position = afterId === null ? 1 : candidates.findIndex((c) => c.id === afterId) + 2;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFinalRank({ position, total, score: deriveRankScore(position - 1, total) });
      setPhase('done');
    } catch {
      setError("Couldn't save your ranking — try again from Your Rankings.");
      setPhase('done');
    }
  }

  function pickTier(tier: 'loved' | 'fine' | 'meh') {
    const n = candidates.length;
    const lo = tier === 'loved' ? 0 : tier === 'fine' ? Math.floor(n / 3) : Math.floor((2 * n) / 3);
    const hi = tier === 'loved' ? Math.ceil(n / 3) : tier === 'fine' ? Math.ceil((2 * n) / 3) : n;
    if (lo >= hi) {
      const afterId = lo > 0 ? candidates[lo - 1]?.id ?? null : null;
      const beforeId = lo < n ? candidates[lo]?.id ?? null : null;
      commitRank(afterId, beforeId);
      return;
    }
    setRange({ lo, hi });
    setPhase('compare');
    Haptics.selectionAsync();
  }

  function pickCompare(newWasBetter: boolean) {
    if (!range) return;
    Haptics.selectionAsync();
    const nextLo = newWasBetter ? range.lo : mid + 1;
    const nextHi = newWasBetter ? mid : range.hi;
    if (nextLo >= nextHi) {
      const afterId = nextLo > 0 ? candidates[nextLo - 1]?.id ?? null : null;
      const beforeId = nextLo < candidates.length ? candidates[nextLo]?.id ?? null : null;
      commitRank(afterId, beforeId);
      return;
    }
    setRange({ lo: nextLo, hi: nextHi });
  }

  function close() {
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={st.screen}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.inkMute} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.screen} edges={['bottom']}>
      <View style={st.topRow}>
        <View style={{ width: 24 }} />
        <Text style={st.kicker}>RANK YOUR VISIT</Text>
        <TouchableOpacity onPress={close} hitSlop={10}>
          <Text style={[st.skip, { color: T.primary }]}>{phase === 'done' ? 'Done' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, padding: 20 }}>
        {phase === 'tier' && candidates.length > 0 && (
          <View style={{ gap: 20 }}>
            <Text style={st.title}>How was {displayName}?</Text>
            <View style={{ gap: 10 }}>
              <TierButton label="Loved it" onPress={() => pickTier('loved')} color={T.primary} />
              <TierButton label="It was fine" onPress={() => pickTier('fine')} color={C.inkMute} />
              <TierButton label="Not really for me" onPress={() => pickTier('meh')} color={C.inkMute} />
            </View>
          </View>
        )}

        {phase === 'tier' && candidates.length === 0 && (
          <View style={{ gap: 20 }}>
            <Text style={st.title}>First one on the list</Text>
            <Text style={st.subtitle}>
              {displayName} is your first ranked visit — once you log more, you'll rank each one against the rest.
            </Text>
            <TierButton label="Got it" onPress={() => commitRank(null, null)} color={T.primary} />
          </View>
        )}

        {phase === 'compare' && midCandidate && (
          <View style={{ gap: 18 }}>
            <Text style={st.title}>Which did you like more?</Text>
            <View style={{ gap: 12 }}>
              <CompareCard
                label={displayName}
                parkCode={parkCode}
                image={null}
                onPress={() => pickCompare(true)}
              />
              <Text style={st.vs}>vs</Text>
              <CompareCard
                label={midCandidate.park_name ?? midCandidate.park_code}
                parkCode={midCandidate.park_code}
                image={midCandidate.cover_photo ?? midCandidate.park_image_url}
                onPress={() => pickCompare(false)}
              />
            </View>
          </View>
        )}

        {phase === 'saving' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.inkMute} />
          </View>
        )}

        {phase === 'done' && (
          <View style={{ gap: 12, alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="trophy" size={36} color={T.primary} />
            {error ? (
              <Text style={st.subtitle}>{error}</Text>
            ) : finalRank ? (
              <>
                <Text style={st.title}>
                  Ranked #{finalRank.position} of {finalRank.total}
                </Text>
                <Text style={st.subtitle}>Score: {finalRank.score}</Text>
              </>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function TierButton({ label, onPress, color }: { label: string; onPress: () => void; color: ColorValue }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[st.tierBtn, { borderColor: color }]}>
      <Text style={[st.tierBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CompareCard({ label, parkCode, image, onPress }: {
  label: string; parkCode: string; image: string | null; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[st.compareCard, { backgroundColor: parkColor(parkCode) }]}>
      {image && (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" />
      )}
      <View style={st.compareCardOverlay}>
        <Text style={st.compareCardText} numberOfLines={2}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: C.inkMute },
  skip: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  subtitle: { fontSize: 15, color: C.inkSoft, lineHeight: 21 },
  vs: { fontSize: 13, fontWeight: '700', color: C.inkMute, textAlign: 'center' },
  tierBtn: {
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  tierBtnText: { fontSize: 16, fontWeight: '700' },
  compareCard: {
    height: 140, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end',
  },
  compareCardOverlay: {
    padding: 14, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  compareCardText: { fontSize: 17, fontWeight: '800', color: '#FFFBF1' },
});
