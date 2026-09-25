import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { STATIC as C } from '@/lib/palette';
import { HikeStatsCard } from '@/components/HikeStatsCard';

// Shared "Strava-style stat strip" visual language for a logged visit —
// used by PostCard (feed posts) and the journal screens (list card + detail
// page), so a visit reads the same everywhere it appears. Field names keep
// PostCard's original `visit_*` prefix since that's the FeedPost shape this
// was extracted from; callers with differently-named source data (journal
// entries) map into this shape at the call site.
export interface VisitStatsInput {
  visit_date?: string | null;
  visit_rank_score?: number | null;
  visit_crowd?: number | null;
  visit_difficulty?: number | null;
  visit_weather?: string[] | null;
  visit_activities?: string[] | null;
  visit_companion_count?: number | null;
  visit_companion_names?: Array<{ user_id: string; username: string; display_name: string | null; avatar_url: string | null }> | null;
  visit_would_return?: string | null;
  visit_notes?: string | null;
  visit_distance_meters?: number | null;
  visit_duration_seconds?: number | null;
  visit_elevation_gain_meters?: number | null;
  visit_route_polyline?: string | null;
  visit_external_source?: string | null;
}

// Plain words for the details line — read as a sentence fragment, so
// "Partly cloudy · Hiking, Photography · With Sam · Would go back".
export const WEATHER_LABELS: Record<string, string> = {
  clear: 'Clear skies', partly: 'Partly cloudy', cloudy: 'Overcast',
  rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Fog', wind: 'Windy',
};
export const WOULD_RETURN_LABELS: Record<string, string> = {
  yes: 'Would go back', maybe: 'Might go back', no: "Wouldn't go back",
};
export const CROWD_LABELS = ['Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
export const DIFF_LABELS  = ['Easy', 'Light', 'Moderate', 'Hard', 'Strenuous'];

// "Jun 12" this year, "Jun 12, 2024" otherwise — the year only when it
// carries information.
export function fmtVisitDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function Stat({ value, label, align }: {
  value: string; label: string; align: 'flex-start' | 'center' | 'flex-end';
}) {
  return (
    <View style={[styles.stat, { alignItems: align }]}>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function VisitStatsStrip({ visit }: { visit: VisitStatsInput }) {
  const date = visit.visit_date ? fmtVisitDate(visit.visit_date) : null;
  const r = visit.visit_rank_score;
  const rankScore = r != null ? (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)) : null;
  const crowd = visit.visit_crowd
    ? (CROWD_LABELS[Math.round(visit.visit_crowd) - 1] ?? String(visit.visit_crowd)) : null;
  const difficulty = visit.visit_difficulty
    ? (DIFF_LABELS[Math.round(visit.visit_difficulty) - 1] ?? String(visit.visit_difficulty)) : null;
  // Fixed priority order — when · how good · how busy · how hard. Only the
  // ones actually present render, as a plain list (no empty filler slots
  // for missing stats) — space-between then naturally flushes whichever
  // ends up first to the card's left edge and whichever ends up last to
  // its right edge, however many stats that turns out to be, down to just
  // one (which lands fully flex-start, not centered, since it's both the
  // first and only item).
  const items: { value: string; label: string }[] = [
    ...(date ? [{ value: date, label: 'Visited' }] : []),
    ...(rankScore ? [{ value: rankScore, label: 'Score' }] : []),
    ...(crowd ? [{ value: crowd, label: 'Crowd' }] : []),
    ...(difficulty ? [{ value: difficulty, label: 'Difficulty' }] : []),
  ];
  if (items.length === 0) return null;

  return (
    <View style={styles.statsStrip}>
      {items.map((it, i) => (
        <Stat
          key={it.label}
          value={it.value}
          label={it.label}
          align={
            items.length === 1 || i === 0 ? 'flex-start'
            // Difficulty centers over its own label even as the last
            // column — "Strenuous" is noticeably wider than "Difficulty",
            // and right-aligning both let the label float disconnected
            // from the value above it.
            : (i === items.length - 1 && it.label !== 'Difficulty') ? 'flex-end'
            : 'center'
          }
        />
      ))}
    </View>
  );
}

export function hasVisitDetails(visit: VisitStatsInput) {
  return !!visit.visit_weather?.length
    || !!visit.visit_activities?.length
    || (visit.visit_companion_count ?? 0) > 0
    || !!visit.visit_companion_names?.length
    || !!visit.visit_would_return;
}

export function VisitDetails({ visit, numberOfLines }: { visit: VisitStatsInput; numberOfLines?: number }) {
  const router = useRouter();
  const parts: React.ReactNode[] = [];

  if (visit.visit_weather?.length) {
    parts.push(visit.visit_weather.map(w => WEATHER_LABELS[w] ?? w).join(', '));
  }
  if (visit.visit_activities?.length) {
    parts.push(visit.visit_activities.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', '));
  }
  const names = visit.visit_companion_names;
  const companionCount = visit.visit_companion_count ?? 0;
  if (names && names.length > 0) {
    // "With Sam", "With Sam and Alex", "With Sam, Alex and 2 others"
    const shown = names.slice(0, 2);
    const extra = names.length - shown.length;
    parts.push(
      <Text>
        {'With '}
        {shown.map((c, i) => (
          <Text key={c.user_id}>
            {i > 0 ? (extra > 0 ? ', ' : ' and ') : ''}
            <Text
              style={styles.detailsLink}
              onPress={() => router.push(`/user/${c.user_id}` as never)}
              suppressHighlighting
            >
              {c.display_name ?? `@${c.username}`}
            </Text>
          </Text>
        ))}
        {extra > 0 ? ` and ${extra} other${extra > 1 ? 's' : ''}` : ''}
      </Text>,
    );
  } else if (companionCount > 0) {
    parts.push(`With ${companionCount} ${companionCount === 1 ? 'other' : 'others'}`);
  }
  if (visit.visit_would_return) {
    parts.push(WOULD_RETURN_LABELS[visit.visit_would_return] ?? visit.visit_would_return);
  }

  if (parts.length === 0) return null;
  return (
    <Text style={styles.details} numberOfLines={numberOfLines}>
      {parts.map((p, i) => (
        <Text key={i}>{i > 0 ? '  ·  ' : ''}{p}</Text>
      ))}
    </Text>
  );
}

export function VisitFacts({ visit }: { visit: VisitStatsInput }) {
  const hasHike = !!visit.visit_external_source && visit.visit_distance_meters != null;
  if (!hasVisitDetails(visit) && !visit.visit_notes && !hasHike) return null;

  return (
    <View style={styles.facts}>
      <VisitDetails visit={visit} />
      {visit.visit_notes ? <Text style={styles.notes}>{visit.visit_notes}</Text> : null}
      {hasHike && (
        <HikeStatsCard
          distanceMeters={visit.visit_distance_meters ?? null}
          durationSeconds={visit.visit_duration_seconds ?? null}
          elevationGainMeters={visit.visit_elevation_gain_meters ?? null}
          routePolyline={visit.visit_route_polyline ?? null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { gap: 10 },
  statsStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    // Explicit — space-between has nothing to distribute if this row ever
    // shrink-wraps instead of stretching (e.g. nested a couple levels deep
    // inside a ScrollView's content container, as in the log-visit preview,
    // versus a FlatList cell in the real feed) — stats then bunch flush
    // left with no gap instead of spreading edge to edge.
    width: '100%',
  },
  stat: { gap: 1 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 },
  statValue: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: C.ink },
  statLabel: { fontSize: 12, fontWeight: '500', color: C.inkMute },
  details: { fontSize: 13.5, color: C.inkSoft, lineHeight: 20 },
  detailsLink: { fontWeight: '600', color: C.ink },
  notes: { fontSize: 14, color: C.ink, lineHeight: 21 },
});
