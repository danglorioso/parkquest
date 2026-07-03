import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  surface:    '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:        '#1B1A16',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  visited:    '#2F7A4A',
  bucket:     '#C48A20',
};

// ── Gradient palette (deterministic by park_code) ─────────────────────────────
// Matches web PostCard.tsx `parkGradient` exactly.

const GRADIENTS: [string, string, string][] = [
  ['#1F3D2E', '#2F7A4A', '#C56B3D'],
  ['#2D4F66', '#1F3D2E', '#D89A3A'],
  ['#7B3A1F', '#C56B3D', '#1F3D2E'],
  ['#3A2E5C', '#6E97A3', '#D89A3A'],
  ['#2F7A4A', '#1F3D2E', '#2D4F66'],
];

export function parkGradientColor(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx][0];
}

// ── State names ───────────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
  MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire',
  NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina',
  ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
  TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia',
  WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  DC:'D.C.', VI:'Virgin Islands', MP:'N. Mariana Is.', GU:'Guam', AS:'Amer. Samoa',
};

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
      <Ionicons name={icon} size={9} color="#FFFBF1" />
      <Text style={s.badgeText}>{label}</Text>
    </View>
  );
}

// ── Park card ─────────────────────────────────────────────────────────────────

export function ParkCard({ park, status = 'notVisited', showStatus = true, onPress }: ParkCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const bg = parkGradientColor(park.park_code);
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
  badgeText: { fontSize: 13, fontWeight: '700', color: '#FFFBF1', letterSpacing: 0.3 },
  info:  { padding: 10, gap: 3 },
  state: { fontSize: 11, fontWeight: '700', color: C.inkMute, letterSpacing: 1, textTransform: 'uppercase' },
  name:  { fontSize: 14, fontWeight: '800', color: C.ink, lineHeight: 17, letterSpacing: -0.2 },
  desc:  { fontSize: 13, color: C.inkMute, lineHeight: 16, marginTop: 2 },
});
