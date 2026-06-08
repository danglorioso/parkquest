import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { getVisits } from '@/lib/api';
import type { VisitEntry } from '@/lib/api';

const STAMP_COLORS = [
  { bg: '#1F3D2E', accent: '#2F7A4A' },
  { bg: '#2D4F66', accent: '#4A90A4' },
  { bg: '#7B3A1F', accent: '#C56B3D' },
  { bg: '#3A2E5C', accent: '#6E97A3' },
  { bg: '#2F5A3A', accent: '#4A8A5A' },
  { bg: '#4A2D3A', accent: '#9A6A7A' },
];

function stampColors(code: string) {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % STAMP_COLORS.length;
  return STAMP_COLORS[idx];
}

function Stamp({ visit }: { visit: VisitEntry }) {
  const { bg, accent } = stampColors(visit.park_code);
  const dateStr = visit.visited_date
    ? new Date(visit.visited_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }).toUpperCase()
    : 'UNKNOWN';
  const name = (visit.park_name ?? visit.park_code).toUpperCase();
  const state = visit.states?.split(',')[0].trim() ?? '';

  return (
    <View style={[styles.stamp, { backgroundColor: bg }]}>
      <View style={[styles.stampInner, { borderColor: accent }]}>
        <Text style={[styles.stampEmoji]}>🏔️</Text>
        <Text style={[styles.stampName, { color: accent }]} numberOfLines={2}>{name}</Text>
        {state ? <Text style={[styles.stampState, { color: `${accent}cc` }]}>{state}</Text> : null}
        <View style={[styles.stampDivider, { backgroundColor: `${accent}55` }]} />
        <Text style={[styles.stampDate, { color: `${accent}aa` }]}>{dateStr}</Text>
      </View>
    </View>
  );
}

export default function PassportScreen() {
  const { getToken } = useAuth();

  const { data: visits, isLoading } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const stamps = (visits ?? [])
    .filter((v: VisitEntry) => !v.is_bucket_list && v.visited_date)
    .sort((a: VisitEntry, b: VisitEntry) =>
      new Date(b.visited_date!).getTime() - new Date(a.visited_date!).getTime()
    );

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#1a1a1a]">
      <View className="px-4 py-5 border-b border-white/10">
        <Text className="text-white/50 text-xs font-semibold tracking-widest">NATIONAL PARKS</Text>
        <Text className="text-white text-2xl font-black mt-1">My Passport</Text>
        <Text className="text-white/40 text-sm mt-1">{stamps.length} stamp{stamps.length !== 1 ? 's' : ''} collected</Text>
      </View>

      {stamps.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">🛂</Text>
          <Text className="text-white font-bold text-lg text-center">No stamps yet</Text>
          <Text className="text-white/40 text-sm text-center mt-2">
            Log park visits to collect passport stamps.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {stamps.map((v: VisitEntry) => (
            <Stamp key={v.id} visit={v} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
    paddingBottom: 32,
  },
  stamp: {
    width: '47%',
    borderRadius: 12,
    padding: 10,
    aspectRatio: 1,
  },
  stampInner: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  stampEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  stampName: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 13,
  },
  stampState: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  stampDivider: {
    width: 30,
    height: 1,
    marginVertical: 5,
  },
  stampDate: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
});
