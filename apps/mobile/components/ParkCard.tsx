import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C } from '@/lib/palette';
import { STATE_NAMES } from '@/lib/stateNames';
import { parkColor } from '@/lib/parkColors';

// Matches web parks/page.tsx `ParkCard` + `CardSkeleton` exactly.
// Park interface is intentionally minimal so it composes with any API shape.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParkCardPark {
  park_code:   string;
  name:        string;
  states:      string;
  description?: string | null;
  image_url?:  string | null;
}

export type ParkStatus = 'visited' | 'bucketList' | 'notVisited';

export interface ParkCardProps {
  park:        ParkCardPark;
  status?:     ParkStatus;
  showStatus?: boolean;
  onPress?:    () => void;
}

function stateName(abbr: string): string {
  return STATE_NAMES[abbr] ?? abbr;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ParkStatus }) {
  if (status === 'notVisited') return null;
  const bg = status === 'visited' ? C.visited : C.bucket;
  const icon: keyof typeof Ionicons.glyphMap = status === 'visited' ? 'checkmark' : 'bookmark';
  const label = status === 'visited' ? 'Visited' : 'Bucket list';
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={9} color={C.onPrimary} />
      <Text style={s.badgeText}>{label}</Text>
    </View>
  );
}

// ── Park card ─────────────────────────────────────────────────────────────────

export function ParkCard({ park, status = 'notVisited', showStatus = true, onPress }: ParkCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const bg = parkColor(park.park_code);
  const abbr = park.states.split(',')[0]?.trim() ?? park.states;
  const state = stateName(abbr);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={s.card}>
      {/* Cover */}
      <View style={[s.cover, { backgroundColor: bg }]}>
        {park.image_url && !imgFailed && (
          <Image
            source={{ uri: park.image_url }}
            style={s.coverImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setImgFailed(true)}
          />
        )}
        <View style={s.coverOverlay} />
        {showStatus && <StatusBadge status={status} />}
      </View>
      {/* Info */}
      <View style={s.info}>
        <Text style={s.state} numberOfLines={1}>{state}</Text>
        <Text style={s.name}  numberOfLines={2}>{park.name}</Text>
        {park.description ? (
          <Text style={s.desc} numberOfLines={2}>{park.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SKEL_COLORS: [string, string][] = [
  ['#1F3D2E','#2F7A4A'], ['#2D4F66','#3A5F7A'], ['#7B3A1F','#9A4F28'],
  ['#3A2E5C','#5A4A8A'], ['#2F7A4A','#3D9E60'],
];

export function ParkCardSkeleton({ index = 0 }: { index?: number }) {
  const [g1] = SKEL_COLORS[index % SKEL_COLORS.length];
  return (
    <View style={[s.card, { opacity: 0.7 }]}>
      <View style={[s.cover, { backgroundColor: g1 }]} />
      <View style={[s.info, { gap: 6 }]}>
        <View style={{ width: 48, height: 8,  borderRadius: 4, backgroundColor: C.surfaceAlt }} />
        <View style={{ width: '80%', height: 13, borderRadius: 5, backgroundColor: C.surfaceAlt }} />
        <View style={{ width: '100%', height: 10, borderRadius: 4, backgroundColor: C.surfaceAlt }} />
        <View style={{ width: '60%', height: 10, borderRadius: 4, backgroundColor: C.surfaceAlt }} />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden',
  },
  cover: { height: 120, position: 'relative' },
  coverImg: { ...StyleSheet.absoluteFillObject },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0)',
    // soft top vignette so badge stays readable
    backgroundImage: undefined,
  } as any,
  badge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4,
  },
  badgeText: { fontSize: 13, fontWeight: '700', color: C.onPrimary, letterSpacing: 0.3 },
  info:  { padding: 10, gap: 3 },
  state: { fontSize: 11, fontWeight: '700', color: C.inkMute, letterSpacing: 1, textTransform: 'uppercase' },
  name:  { fontSize: 14, fontWeight: '800', color: C.ink, lineHeight: 17, letterSpacing: -0.2 },
  desc:  { fontSize: 13, color: C.inkMute, lineHeight: 16, marginTop: 2 },
});
