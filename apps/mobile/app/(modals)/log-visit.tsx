import {
  ActivityIndicator, Alert, Animated, DeviceEventEmitter, Dimensions, FlatList, Image, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, useColorScheme, useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { fitUnderUploadCap } from '@/lib/uploadImage';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence, runOnJS, type SharedValue,
  FadeInDown, FadeIn,
} from 'react-native-reanimated';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { fullStateName } from '@/lib/stateNames';
import { STATIC as C, dyn, useColors, useReassertThemeOnUnmount } from '@/lib/palette';
import { GlassIconBg } from '@/components/GlassIconBg';
import { ImageLightbox } from '@/components/ImageLightbox';
import { showToast } from '@/lib/toast';
import { loadRawDrafts, upsertRawDraft, deleteRawDraft, type SavedDraft as SharedSavedDraft } from '@/lib/drafts';
import { PostCard, type FeedPost } from '@/components/PostCard';
import { parkColor } from '@/lib/parkColors';
import { relTime } from '@/lib/dates';
import { getDefaultVisibility } from '@/lib/settings';
import { fmtDuration, fmtElevationFt, fmtMiles } from '@/lib/hikeStats';
import { parseGpx } from '@/lib/gpx';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Draft {
  parkCode: string;
  startDate: Date | null;
  endDate:   Date | null;
  title:     string;
  rating:    number;
  crowd:     number;
  difficulty:number;
  weather:   string[];
  wouldReturn:'yes' | 'maybe' | 'no' | null;
  highlight: string;
  notes:     string;
  activities:string[];
  companions:string[];
  companionObjs: CompanionUser[];
  photos:    string[];
  visibility:'Private' | 'Friends' | 'Public';
  caption:   string;
  // Attached hike, if any — set via the "Where & when" step's GPX upload.
  hikeSource:           'gpx' | null;
  distanceMeters:       number | null;
  durationSeconds:      number | null;
  elevationGainMeters:  number | null;
  routePolyline:        string | null;
}

interface ParkInfo { park_code: string; name: string; states: string; image_url: string | null; }
interface CompanionUser { clerk_user_id: string; username: string; display_name: string | null; avatar_url: string | null; }

interface VisitDetail {
  id: number;
  park_code: string;
  visited_date: string | null;
  end_date: string | null;
  rating: number | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  would_return: 'yes' | 'maybe' | 'no' | null;
  highlight: string | null;
  title: string | null;
  notes: string | null;
  photos: string[] | null;
  cover_photo: string | null;
  visibility: string | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  elevation_gain_meters: number | null;
  route_polyline: string | null;
  external_source: string | null;
  external_activity_id: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEATHER_OPTS = [
  { id: 'clear',  label: 'Clear',   emoji: '☀️'  },
  { id: 'partly', label: 'Partly',  emoji: '⛅'  },
  { id: 'cloudy', label: 'Cloudy',  emoji: '☁️'  },
  { id: 'rain',   label: 'Rain',    emoji: '🌧'  },
  { id: 'storm',  label: 'Storms',  emoji: '⛈'  },
  { id: 'snow',   label: 'Snow',    emoji: '❄️'  },
  { id: 'fog',    label: 'Fog',     emoji: '🌫'  },
  { id: 'wind',   label: 'Windy',   emoji: '💨'  },
];
const CROWD_LABELS  = ['Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
const DIFF_LABELS   = ['Easy', 'Light', 'Moderate', 'Hard', 'Strenuous'];
const ALL_ACTIVITIES= ['hiking','camping','backpacking','climbing','kayaking','rafting','fishing','diving','wildlife','photography','sightseeing','stargazing','tours','cycling','mountaineering'];
const RETURN_OPTS   = [
  { id: 'yes',   label: 'Definitely',   color: C.visited, icon: 'heart-outline' as const,  iconFilled: 'heart' as const },
  { id: 'maybe', label: 'Maybe',        color: C.bucket,  icon: 'repeat-outline' as const, iconFilled: 'repeat' as const },
  { id: 'no',    label: 'Probably not', color: C.inkMute, icon: 'cloud-outline' as const,  iconFilled: 'cloud' as const },
];
const STEPS = [
  'Where & when', 'Rating', 'Crowd', 'Difficulty', 'Weather', 'Would you return?', 'Photos', 'Journal', 'Share',
];
const STAR_SIZE = 56;

// Reactive emoji for the hero-slide steps — index 0 is the "unset" state for
// Rating (0..5 stars), Crowd/Difficulty index directly by (value - 1).
const RATING_EMOJI = ['🤔', '😞', '😕', '🙂', '😃', '🤩'];
const CROWD_EMOJI  = ['🦗', '🧍', '🚶', '👥', '🏟️'];
const DIFF_EMOJI   = ['🌱', '🚶', '⛰️', '🥵', '💀'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlank(): Draft {
  return {
    parkCode: '', startDate: null, endDate: null, title: '',
    rating: 0, crowd: 0, difficulty: 0, weather: [], wouldReturn: null,
    highlight: '', notes: '', activities: [], companions: [], companionObjs: [],
    photos: [], visibility: 'Friends', caption: '',
    hikeSource: null, distanceMeters: null, durationSeconds: null,
    elevationGainMeters: null, routePolyline: null,
  };
}

// ── Draft persistence ─────────────────────────────────────────────────────────

type SavedDraft = SharedSavedDraft<Draft>;

function draftHasContent(d: Draft): boolean {
  return !!(d.parkCode || d.title || d.notes || d.highlight ||
    d.activities.length || d.photos.length || d.rating || d.startDate);
}

async function loadDrafts(): Promise<SavedDraft[]> {
  const parsed = await loadRawDrafts<Draft>();
  // Rehydrate date objects
  return parsed.map(sd => ({
    ...sd,
    draft: {
      ...sd.draft,
      startDate: sd.draft.startDate ? new Date(sd.draft.startDate as unknown as string) : null,
      endDate:   sd.draft.endDate   ? new Date(sd.draft.endDate   as unknown as string) : null,
    },
  }));
}

async function upsertDraft(
  d: Draft, parkName: string | undefined, id: string,
  editVisitId?: number, editPostId?: number | null,
): Promise<void> {
  await upsertRawDraft<Draft>({ id, savedAt: new Date().toISOString(), parkName, editVisitId, editPostId, draft: d });
}

async function deleteDraft(id: string): Promise<void> {
  await deleteRawDraft(id);
}

function draftAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dayCount(start: Date | null, end: Date | null): number {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function apiFetch<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Best-effort cleanup of orphaned uploads (abandoned drafts, removed photos).
// Fire-and-forget: a failed cleanup just leaves an orphaned file, not a broken visit.
function deletePhotos(urls: string[], token: string | null) {
  if (!token || urls.length === 0) return;
  apiFetch('/api/upload/delete', token, {
    method: 'POST',
    body: JSON.stringify({ urls }),
  }).catch(e => console.warn('Photo cleanup failed:', e));
}

// ── StarRating ────────────────────────────────────────────────────────────────

const HALF_LABELS: Record<number, string> = {
  0:'', 0.5:'Not great', 1:'Rough', 1.5:'Below avg',
  2:'Meh', 2.5:'Decent', 3:'Good', 3.5:'Really good',
  4:'Great', 4.5:'Amazing', 5:'Unreal',
};

const STAR_GAP = 10;
const STAR_TOTAL = STAR_SIZE + STAR_GAP;

function valueFromX(x: number): number {
  const clamped = Math.max(0, x);
  const starIdx = Math.floor(clamped / STAR_TOTAL);
  if (starIdx >= 5) return 5;
  const posInStar = clamped - starIdx * STAR_TOTAL;
  return posInStar < STAR_SIZE / 2 ? starIdx + 0.5 : starIdx + 1;
}

function StarRating({ value, onChange, onDragChange }: {
  value: number; onChange: (v: number) => void;
  // Lets the parent sheet know a touch is actively dragging this control, so it can
  // suspend its own swipe-to-dismiss gesture for the duration (see ScaleRow for the
  // same pattern — a stray vertical component in the drag was closing the sheet).
  onDragChange?: (dragging: boolean) => void;
}) {
  const C = useColors();
  const containerX = useRef(0);
  const isDragging = useRef(false);
  // Ticks a light haptic each time the dragged-to value crosses into a new
  // half-star, instead of firing on every pixel of pan movement.
  const lastHaptic = useRef(value);
  const change = (v: number) => {
    if (v !== lastHaptic.current) { Haptics.selectionAsync(); lastHaptic.current = v; }
    onChange(v);
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      Keyboard.dismiss();
      isDragging.current = true;
      onDragChange?.(true);
      const x = e.nativeEvent.pageX - containerX.current;
      change(valueFromX(x));
    },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.pageX - containerX.current;
      change(valueFromX(x));
    },
    onPanResponderRelease: () => { isDragging.current = false; onDragChange?.(false); },
    onPanResponderTerminate: () => { isDragging.current = false; onDragChange?.(false); },
  })).current;

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Padded hit area — drags starting a bit outside the stars still rate.
          Touch x maps off the inner row's pageX, so the padding is pure slack.
          Generous on purpose: once PanResponder grants here, it keeps the
          gesture for the rest of the drag regardless of later vertical
          drift, so a wide starting margin is what actually stops a
          slightly-off-horizontal swipe from instead being grabbed by the
          sheet's own swipe-to-dismiss gesture. */}
      <View style={{ paddingVertical: 28, paddingHorizontal: 20 }} {...panResponder.panHandlers}>
        <View
          ref={r => {
            if (r) r.measure((_x, _y, _w, _h, px) => { containerX.current = px; });
          }}
          style={{ flexDirection: 'row', gap: STAR_GAP }}
          pointerEvents="none"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={{ width: STAR_SIZE, height: STAR_SIZE }}>
              <Ionicons
                name={value >= i + 1 ? 'star' : value >= i + 0.5 ? 'star-half' : 'star-outline'}
                size={STAR_SIZE}
                color={value >= i + 0.5 ? C.accent : dyn('rgba(27,26,22,0.28)', 'rgba(240,234,217,0.32)')}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── ScaleRow (slider) ───────────────────────────────────────────────────────────

const SLIDER_THUMB = 28;
const SLIDER_TRACK_H = 12;
// overshootClamping: settle onto the dot directly instead of swinging past it
// and springing back on every snap.
const SLIDER_SPRING = { damping: 22, stiffness: 260, overshootClamping: true };

function ScaleRow({ value, onChange, labels, onDragChange }: {
  value: number; onChange: (v: number) => void; labels: string[];
  // See StarRating — reports active-drag state so the parent sheet can disable its
  // swipe-to-dismiss gesture while a touch is dragging this slider. Without this, a
  // drag that isn't perfectly horizontal registers as vertical pan-down and the
  // enclosing modal sheet starts closing instead of just moving the thumb.
  onDragChange?: (dragging: boolean) => void;
}) {
  const C = useColors();
  const containerX = useRef(0);
  const trackWidth = useRef(0);
  const [, forceRender] = useState(0);
  const steps = labels.length;

  const pctFor = (v: number) => (v > 0 ? ((v - 1) / (steps - 1)) * 100 : 0);

  // The thumb's travel is inset half a thumb-width from each track end so its
  // center lands exactly on the tick dots (which share the same inset) and it
  // never hangs past the track — pct 0..100 maps over [THUMB/2, W - THUMB/2].
  const relFromX = (x: number) => {
    const usable = trackWidth.current - SLIDER_THUMB;
    if (usable <= 0) return 0;
    return Math.max(0, Math.min(1, (x - SLIDER_THUMB / 2) / usable));
  };

  const valueFromX = (x: number) => {
    if (trackWidth.current <= 0) return value;
    return Math.round(relFromX(x) * (steps - 1)) + 1;
  };

  // Ticks a light haptic each time the dragged-to value crosses into a new
  // step, instead of firing on every pixel of pan movement.
  const lastHaptic = useRef(value);
  const change = (v: number) => {
    if (v !== lastHaptic.current) { Haptics.selectionAsync(); lastHaptic.current = v; }
    onChange(v);
  };

  // The thumb's visual position tracks the finger continuously (no rounding)
  // while dragging, then springs to the nearest dot on release — rather than
  // jumping straight between step positions on every move event.
  const isDragging = useRef(false);
  const rawPct = useSharedValue(pctFor(value));
  const trackW = useSharedValue(0);
  useEffect(() => {
    if (!isDragging.current) rawPct.value = withSpring(pctFor(value), SLIDER_SPRING);
  }, [value]);

  const rawPctFromX = (x: number) => {
    if (trackWidth.current <= 0) return rawPct.value;
    return relFromX(x) * 100;
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      Keyboard.dismiss();
      isDragging.current = true;
      onDragChange?.(true);
      // A plain tap glides straight to the snapped dot — jumping the thumb to
      // the finger first (often past the dot) read as an overshoot-and-return.
      // Finger tracking takes over on the first real move event below.
      const v = valueFromX(e.nativeEvent.pageX - containerX.current);
      rawPct.value = withSpring(pctFor(v), SLIDER_SPRING);
      change(v);
    },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.pageX - containerX.current;
      rawPct.value = rawPctFromX(x);
      change(valueFromX(x));
    },
    onPanResponderRelease: () => {
      isDragging.current = false;
      onDragChange?.(false);
      rawPct.value = withSpring(pctFor(lastHaptic.current), SLIDER_SPRING);
    },
    onPanResponderTerminate: () => {
      isDragging.current = false;
      onDragChange?.(false);
      rawPct.value = withSpring(pctFor(lastHaptic.current), SLIDER_SPRING);
    },
  })).current;

  // Pixel-based positions (not %) so thumb center and fill edge land exactly on
  // the inset tick positions regardless of track width.
  const fillStyle = useAnimatedStyle(() => ({
    width: trackW.value > 0 ? SLIDER_THUMB / 2 + (rawPct.value / 100) * (trackW.value - SLIDER_THUMB) : 0,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: trackW.value > 0 ? (rawPct.value / 100) * (trackW.value - SLIDER_THUMB) : 0,
  }));

  return (
    // Handlers live on this padded wrapper, not the track itself — drags that
    // start slightly above/below/beside the track still drive the slider (and
    // still suppress vertical scroll), since touch x maps off the inner
    // track's own measured pageX. Generous padding on purpose — see StarRating's
    // comment on the same pattern: it's the starting margin, not exact
    // touch-to-thumb precision, that keeps a wobbly drag from being grabbed by
    // the sheet's own swipe-to-dismiss gesture instead.
    <View style={{ paddingHorizontal: 16, paddingVertical: 28 }} {...panResponder.panHandlers}>
      <View
        ref={r => { if (r) r.measure((_x, _y, _w, _h, px) => { containerX.current = px; }); }}
        onLayout={e => {
          trackWidth.current = e.nativeEvent.layout.width;
          trackW.value = e.nativeEvent.layout.width;
          forceRender(n => n + 1);
        }}
        style={{ height: SLIDER_THUMB + 8, justifyContent: 'center' }}
        pointerEvents="none"
      >
        {/* track */}
        <View style={{
          height: SLIDER_TRACK_H, borderRadius: SLIDER_TRACK_H / 2,
          backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
        }}>
          <Reanimated.View style={[{ height: '100%', backgroundColor: C.primary, borderRadius: SLIDER_TRACK_H / 2 }, fillStyle]} />
        </View>

        {/* step ticks — same half-thumb inset as the thumb's travel, so the
            track always runs past the first/last dots and the thumb centers
            on each dot */}
        <View pointerEvents="none" style={{
          position: 'absolute', left: SLIDER_THUMB / 2, right: SLIDER_THUMB / 2,
          flexDirection: 'row', justifyContent: 'space-between',
        }}>
          {labels.map((l, i) => (
            <View key={l} style={{
              width: 6, height: 6, borderRadius: 3, marginLeft: -3,
              backgroundColor: value >= i + 1 ? C.onPrimary : C.hairline,
            }} />
          ))}
        </View>

        {/* thumb — colors live on the inner plain View because DynamicColorIOS
            values crash Reanimated when placed on an animated style */}
        <Reanimated.View pointerEvents="none" style={[{
          position: 'absolute',
          width: SLIDER_THUMB, height: SLIDER_THUMB, justifyContent: 'center',
        }, thumbStyle]}>
          <View style={{
            width: SLIDER_THUMB, height: SLIDER_THUMB, borderRadius: SLIDER_THUMB / 2,
            backgroundColor: C.surface, borderWidth: 2, borderColor: value > 0 ? C.primary : C.hairline,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 }, elevation: 2,
          }} />
        </Reanimated.View>
      </View>
    </View>
  );
}

// ── WeatherGrid ───────────────────────────────────────────────────────────────

function WeatherGrid({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const C = useColors();
  const toggle = (id: string) => {
    Keyboard.dismiss();
    Haptics.selectionAsync();
    onChange(value.includes(id) ? value.filter(w => w !== id) : [...value, id]);
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
      {WEATHER_OPTS.map(w => {
        const on = value.includes(w.id);
        return (
          <PressableScale
            key={w.id} onPress={() => toggle(w.id)}
            containerStyle={{ width: '47%' }}
            style={[styles.weatherChip, { backgroundColor: on ? C.primary : C.surfaceAlt, borderColor: on ? C.primary : C.hairline }]}
          >
            <Text style={{ fontSize: 34, lineHeight: 40 }}>{w.emoji}</Text>
            <Text style={[styles.weatherLabel, { color: on ? C.onPrimary : C.inkSoft }]}>{w.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── ActivityChips ─────────────────────────────────────────────────────────────

function ActivityChips({ value, onChange, npsActivityNames = [] }: {
  value: string[];
  onChange: (v: string[]) => void;
  npsActivityNames?: string[];
}) {
  const C = useColors();
  const [customQ, setCustomQ] = useState('');

  const toggle = (a: string) => {
    Keyboard.dismiss();
    onChange(value.includes(a) ? value.filter(x => x !== a) : value.length < 8 ? [...value, a] : value);
  };

  const removeCustom = (a: string) => onChange(value.filter(x => x !== a));

  const addActivity = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || value.length >= 8) return;
    const std = ALL_ACTIVITIES.find(a => a.toLowerCase() === trimmed.toLowerCase());
    const key = std ?? trimmed;
    if (!value.some(v => v.toLowerCase() === key.toLowerCase())) onChange([...value, key]);
    setCustomQ('');
  };

  // Suggestions from NPS activity names as you type (like web)
  const suggestions = customQ.trim().length > 0
    ? npsActivityNames
        .filter(n =>
          n.toLowerCase().includes(customQ.trim().toLowerCase()) &&
          !value.some(v => v.toLowerCase() === n.toLowerCase())
        )
        .slice(0, 6)
    : [];

  const qLower = customQ.trim().toLowerCase();
  const exactMatch = suggestions.some(s => s.toLowerCase() === qLower);
  const alreadyAdded = value.some(v => v.toLowerCase() === qLower);
  const showAddNew = customQ.trim().length > 1 && !exactMatch && !alreadyAdded;

  const customActivities = value.filter(a => !ALL_ACTIVITIES.includes(a));

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {ALL_ACTIVITIES.map(a => {
          const on = value.includes(a);
          return (
            <TouchableOpacity
              key={a} onPress={() => toggle(a)} activeOpacity={0.7}
              style={[styles.activityChip, { backgroundColor: on ? C.primary : C.surfaceAlt, borderColor: on ? C.primary : C.hairline }]}
            >
              {on && <Ionicons name="checkmark" size={11} color="#FFFBF1" />}
              <Text style={[styles.activityChipText, { color: on ? C.onPrimary : C.inkSoft }]}>{a}</Text>
            </TouchableOpacity>
          );
        })}
        {customActivities.map(a => (
          <View key={a} style={[styles.activityChip, { backgroundColor: C.primary, borderColor: C.primary }]}>
            <Text style={[styles.activityChipText, { color: C.onPrimary }]}>{a}</Text>
            <TouchableOpacity onPress={() => removeCustom(a)} hitSlop={6}>
              <Ionicons name="close" size={11} color="rgba(255,251,241,0.8)" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {value.length < 8 && (
        <View style={{ marginTop: 10 }}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={14} color={C.inkMute} />
            <TextInput
              value={customQ} onChangeText={setCustomQ}
              placeholder="Add another activity…" placeholderTextColor={C.inkMute}
              style={styles.searchInput}
              autoCorrect={false} autoCapitalize="none"
              onSubmitEditing={() => {
                if (suggestions.length > 0) addActivity(suggestions[0]);
                else if (customQ.trim()) addActivity(customQ);
              }}
              returnKeyType="done"
            />
            {customQ.length > 0 && (
              <TouchableOpacity onPress={() => setCustomQ('')} hitSlop={6}>
                <Ionicons name="close-circle" size={15} color={C.inkMute} />
              </TouchableOpacity>
            )}
          </View>

          {(suggestions.length > 0 || showAddNew) && (
            <View style={styles.activitySuggestBox}>
              {suggestions.map((name, i) => (
                <TouchableOpacity
                  key={name}
                  onPress={() => addActivity(name)}
                  activeOpacity={0.7}
                  style={[
                    styles.activitySuggestRow,
                    (i < suggestions.length - 1 || showAddNew) && { borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft },
                  ]}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
                  <Text style={{ fontSize: 13, color: C.ink, fontWeight: '500' }} numberOfLines={1}>{name}</Text>
                </TouchableOpacity>
              ))}
              {showAddNew && (
                <TouchableOpacity
                  onPress={() => addActivity(customQ)}
                  activeOpacity={0.7}
                  style={styles.activitySuggestRow}
                >
                  <Ionicons name="add-circle-outline" size={14} color={C.accent} />
                  <Text style={{ fontSize: 13, color: C.accent, fontWeight: '600' }} numberOfLines={1}>
                    Add “{customQ.trim()}”
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── ReturnRow ─────────────────────────────────────────────────────────────────

function ReturnRow({ value, onChange }: { value: Draft['wouldReturn']; onChange: (v: Draft['wouldReturn']) => void }) {
  const C = useColors();
  return (
    <View style={{ gap: 10 }}>
      {RETURN_OPTS.map(o => {
        const on = value === o.id;
        return (
          <PressableScale
            key={o.id}
            onPress={() => { Keyboard.dismiss(); Haptics.selectionAsync(); onChange(on ? null : o.id as Draft['wouldReturn']); }}
            style={[styles.returnBtn, { backgroundColor: on ? o.color : C.surface, borderColor: on ? o.color : C.hairline }]}
          >
            <View style={[styles.returnBadge, { backgroundColor: on ? 'rgba(255,255,255,0.25)' : C.surfaceAlt }]}>
              <Ionicons name={on ? o.iconFilled : o.icon} size={20} color={on ? C.onPrimary : C.inkMute} />
            </View>
            <Text style={[styles.returnBtnText, { color: on ? C.onPrimary : C.inkSoft }]}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── VisibilityPicker ──────────────────────────────────────────────────────────

const VIS_OPTS: Array<{ v: Draft['visibility']; icon: string; desc: string }> = [
  { v: 'Private', icon: 'lock-closed',  desc: 'Just for you' },
  { v: 'Friends', icon: 'people',       desc: 'Visible to friends' },
  { v: 'Public',  icon: 'globe',        desc: 'Visible to everyone' },
];

function VisibilityPicker({ value, onChange }: { value: Draft['visibility']; onChange: (v: Draft['visibility']) => void }) {
  const C = useColors();
  return (
    <View style={{ gap: 8 }}>
      {VIS_OPTS.map(o => {
        const on = value === o.v;
        return (
          <TouchableOpacity
            key={o.v} onPress={() => { Keyboard.dismiss(); onChange(o.v); }} activeOpacity={0.7}
            style={[styles.visRow, { borderColor: on ? C.primary : 'transparent', backgroundColor: on ? C.surface : C.surfaceAlt }]}
          >
            <View style={[styles.visIcon, { backgroundColor: on ? C.primary : C.surface, borderColor: on ? C.primary : C.hairline }]}>
              <Ionicons name={o.icon as any} size={17} color={on ? C.onPrimary : C.inkSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: C.ink }}>{o.v}</Text>
              <Text style={{ fontSize: 13, color: C.inkMute, marginTop: 1 }}>{o.desc}</Text>
            </View>
            <View style={[styles.visRadio, { borderColor: on ? C.primary : C.hairline, backgroundColor: on ? C.primary : 'transparent' }]}>
              {on && <Ionicons name="checkmark" size={11} color="#FFFBF1" />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── CompanionSearch ───────────────────────────────────────────────────────────

function CompanionSearch({ companions, companionObjs, onChange, token }: {
  companions: string[];
  companionObjs: CompanionUser[];
  onChange: (ids: string[], objs: CompanionUser[]) => void;
  token: string | null;
}) {
  const C = useColors();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CompanionUser[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const toggle = (u: CompanionUser) => {
    if (companions.includes(u.clerk_user_id)) {
      onChange(companions.filter(id => id !== u.clerk_user_id), companionObjs.filter(o => o.clerk_user_id !== u.clerk_user_id));
    } else {
      const newObjs = companionObjs.find(o => o.clerk_user_id === u.clerk_user_id) ? companionObjs : [...companionObjs, u];
      onChange([...companions, u.clerk_user_id], newObjs);
    }
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    // Stay in "searching" through the debounce + fetch so the empty state
    // doesn't flash while typing
    setSearching(true);
    const mySeq = ++seq.current;
    timer.current = setTimeout(() => {
      fetch(`${BASE}/api/users?search=${encodeURIComponent(q)}&limit=10`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.json() : [])
        .then((data: CompanionUser[]) => {
          if (mySeq !== seq.current) return;
          setResults(data);
          setSearching(false);
        })
        .catch(() => { if (mySeq === seq.current) setSearching(false); });
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, token]);

  const tagged = companionObjs.filter(u => companions.includes(u.clerk_user_id));

  return (
    <View>
      {tagged.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {tagged.map(u => {
            const name = (u.display_name ?? u.username).split(' ')[0];
            return (
              <View key={u.clerk_user_id} style={[styles.companionChip, { backgroundColor: C.primary }]}>
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={{ width: 22, height: 22, borderRadius: 11 }} />
                  : <View style={styles.companionInitial}><Text style={{ color: C.onPrimary, fontSize: 13, fontWeight: '700' }}>{name[0]}</Text></View>
                }
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.onPrimary }}>{name}</Text>
                <TouchableOpacity onPress={() => toggle(u)} hitSlop={6}>
                  <Ionicons name="close" size={13} color="rgba(255,251,241,0.8)" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={14} color={C.inkMute} />
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search for other users…"
          placeholderTextColor={C.inkMute} style={styles.searchInput}
          autoCorrect={false} autoCapitalize="none"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => { setQ(''); setResults([]); }}>
            <Ionicons name="close-circle" size={16} color={C.inkMute} />
          </TouchableOpacity>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          {results.map((u, idx) => {
            const on = companions.includes(u.clerk_user_id);
            const name = u.display_name ?? u.username;
            return (
              <TouchableOpacity
                key={u.clerk_user_id} onPress={() => { toggle(u); setQ(''); setResults([]); }} activeOpacity={0.7}
                style={[styles.resultRow, { backgroundColor: on ? 'rgba(31,61,46,0.06)' : 'transparent',
                  borderBottomWidth: idx < results.length - 1 ? 0.5 : 0, borderBottomColor: C.hairlineSoft }]}
              >
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                  : <View style={[styles.companionInitial, { width: 32, height: 32, borderRadius: 16 }]}><Text style={{ color: C.onPrimary, fontWeight: '700' }}>{name[0]}</Text></View>
                }
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 13.5, color: C.ink }}>{name}</Text>
                  <Text style={{ fontSize: 13, color: C.inkMute }}>@{u.username}</Text>
                </View>
                {on && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {q.trim().length > 0 && results.length === 0 && !searching && (
        <Text style={{ fontSize: 13, color: C.inkMute, paddingHorizontal: 4, paddingTop: 6 }}>No users found</Text>
      )}
    </View>
  );
}

// ── Photo crop modal ────────────────────────────────────────────────────────

// Photos is its own full step now, laid out as a grid so it uses the width and
// vertical room a single scrolling strip left empty — thumb size is computed per
// device width in PhotoStrip so `cols` fixed columns always fill the row exactly.
const PHOTO_GRID_COLS = 3;
const PHOTO_GAP = 10;
const CROP_MAX_ZOOM = 4;
// Long-edge cap applied at crop time — the happy medium between a crisp full-screen
// lightbox view and not shipping multi-megabyte originals. fitUnderUploadCap (in
// uploadImage.ts) is the last-resort safety net if this still isn't enough.
const CROP_TARGET_MAX_DIMENSION = 2048;
const CROP_QUALITY = 0.82;

// 'original' isn't a fixed number — it tracks each photo's own aspect ratio, which
// is what makes it behave like "no crop" (frame matches the image exactly, so the
// default pan/zoom state already shows the full frame with nothing to trim).
type RatioId = 'original' | 'square' | '4:5' | '16:9';
const RATIO_OPTIONS: { id: RatioId; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'square',   label: 'Square',   ratio: 1 },
  { id: '4:5',      label: '4:5',      ratio: 4 / 5 },
  { id: '16:9',     label: '16:9',     ratio: 16 / 9 },
];

function PhotoCropModal({ uri, index, total, onCancel, onDone }: {
  uri: string | null; index: number; total: number;
  onCancel: () => void; onDone: (croppedUri: string) => void;
}) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [ratioId, setRatioId] = useState<RatioId>('original');
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);
  const gesture = useRef({ startScale: 1, startTx: 0, startTy: 0, startDist: 0 }).current;
  // PanResponder.create only runs once (see the useRef below), so its callbacks close
  // over whatever `scale`/`tx`/`ty`/`imgSize`/frame values existed on that first render
  // — a live ref is the only way for them to see current values on every touch event.
  const live = useRef({ scale: 1, tx: 0, ty: 0, imgSize: null as { w: number; h: number } | null, baseScale: 1, frameW: 0, frameH: 0 }).current;

  useEffect(() => {
    if (!uri) return;
    setRatioId('original');
    setScale(1); setTx(0); setTy(0);
    Image.getSize(uri, (w, h) => setImgSize({ w, h }), () => setImgSize({ w: 1, h: 1 }));
  }, [uri]);

  // Ratio switches re-fit the frame around the same photo — reset pan/zoom rather
  // than trying to carry a crop region across a reshaped frame.
  const changeRatio = (id: RatioId) => {
    setRatioId(id);
    setScale(1); setTx(0); setTy(0);
  };

  const imgRatio = imgSize ? imgSize.w / imgSize.h : 1;
  const effectiveRatio = RATIO_OPTIONS.find(r => r.id === ratioId)?.ratio ?? imgRatio;

  // Fit the frame inside the available space (below the header, above the ratio
  // chips + hint) while honoring the selected aspect ratio.
  const maxFrameW = winW - 48;
  const maxFrameH = winH * 0.52;
  let frameW = maxFrameW;
  let frameH = frameW / effectiveRatio;
  if (frameH > maxFrameH) { frameH = maxFrameH; frameW = frameH * effectiveRatio; }

  const baseScale = imgSize ? Math.max(frameW / imgSize.w, frameH / imgSize.h) : 1;
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  // Keep the live ref in sync every render so the PanResponder callbacks (created
  // once, below) always see this render's values instead of the first render's.
  live.scale = scale; live.tx = tx; live.ty = ty;
  live.imgSize = imgSize; live.baseScale = baseScale; live.frameW = frameW; live.frameH = frameH;

  const clampPanLive = (nx: number, ny: number, s: number) => {
    const size = live.imgSize;
    if (!size) return { x: 0, y: 0 };
    const dw = size.w * live.baseScale * s;
    const dh = size.h * live.baseScale * s;
    const maxX = Math.max(0, (dw - live.frameW) / 2);
    const maxY = Math.max(0, (dh - live.frameH) / 2);
    return { x: clamp(nx, -maxX, maxX), y: clamp(ny, -maxY, maxY) };
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      gesture.startScale = live.scale;
      gesture.startTx = live.tx;
      gesture.startTy = live.ty;
      const touches = e.nativeEvent.touches;
      if (touches.length === 2) {
        const [a, b] = touches;
        gesture.startDist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
      }
    },
    onPanResponderMove: (e, gestureState) => {
      const touches = e.nativeEvent.touches;
      if (touches.length === 2 && gesture.startDist > 0) {
        const [a, b] = touches;
        const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
        const nextScale = clamp(gesture.startScale * (dist / gesture.startDist), 1, CROP_MAX_ZOOM);
        const p = clampPanLive(gesture.startTx, gesture.startTy, nextScale);
        live.scale = nextScale; live.tx = p.x; live.ty = p.y;
        setScale(nextScale); setTx(p.x); setTy(p.y);
      } else if (touches.length === 1) {
        const p = clampPanLive(gesture.startTx + gestureState.dx, gesture.startTy + gestureState.dy, live.scale);
        live.tx = p.x; live.ty = p.y;
        setTx(p.x); setTy(p.y);
      }
    },
  })).current;

  const handleDone = async () => {
    if (!uri || !imgSize) return;
    setBusy(true);
    try {
      const totalScale = baseScale * scale;
      const dw = imgSize.w * totalScale;
      const dh = imgSize.h * totalScale;
      const left = (dw - frameW) / 2 - tx;
      const top = (dh - frameH) / 2 - ty;
      const cropW = clamp(frameW / totalScale, 0, imgSize.w);
      const cropH = clamp(frameH / totalScale, 0, imgSize.h);
      const cropX = clamp(left / totalScale, 0, Math.max(0, imgSize.w - cropW));
      const cropY = clamp(top / totalScale, 0, Math.max(0, imgSize.h - cropH));

      // Untouched "Original" at no zoom is the full photo — skip the crop action
      // entirely rather than re-encoding a no-op region.
      const isFullFrame = ratioId === 'original' && scale === 1
        && cropW >= imgSize.w - 1 && cropH >= imgSize.h - 1;

      const actions: ImageManipulator.Action[] = isFullFrame ? [] : [{ crop: {
        originX: cropX, originY: cropY, width: cropW, height: cropH,
      } }];

      // Cap the long edge post-crop — this is the primary size control now
      // (fitUnderUploadCap only kicks in as a fallback if this still isn't enough).
      const outW = isFullFrame ? imgSize.w : cropW;
      const outH = isFullFrame ? imgSize.h : cropH;
      const longEdge = Math.max(outW, outH);
      if (longEdge > CROP_TARGET_MAX_DIMENSION) {
        const resizeScale = CROP_TARGET_MAX_DIMENSION / longEdge;
        actions.push({ resize: {
          width: Math.round(outW * resizeScale), height: Math.round(outH * resizeScale),
        } });
      }

      if (actions.length === 0) { onDone(uri); return; }
      const result = await ImageManipulator.manipulateAsync(
        uri, actions, { compress: CROP_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      onDone(result.uri);
    } catch (e) {
      console.warn('Crop failed, using original photo:', e);
      onDone(uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!uri} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.cropBg}>
        <View style={[styles.cropHeader, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={onCancel} hitSlop={8} style={styles.cropIconBtn}>
            <Ionicons name="close" size={20} color="#FFFBF1" />
          </TouchableOpacity>
          <Text style={styles.cropHeaderTitle}>{total > 1 ? `PHOTO ${index + 1} OF ${total}` : 'CROP PHOTO'}</Text>
          <TouchableOpacity onPress={handleDone} disabled={busy} hitSlop={8} style={[styles.cropIconBtn, { backgroundColor: C.primary }]}>
            {busy ? <ActivityIndicator size="small" color={C.onPrimary} /> : <Ionicons name="checkmark" size={20} color={C.onPrimary} />}
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[styles.cropFrame, { width: frameW, height: frameH }]} {...panResponder.panHandlers}>
            {uri && imgSize && (
              <Image
                source={{ uri }}
                style={{
                  position: 'absolute',
                  width: imgSize.w * baseScale,
                  height: imgSize.h * baseScale,
                  left: (frameW - imgSize.w * baseScale) / 2,
                  top: (frameH - imgSize.h * baseScale) / 2,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale }],
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.cropFooter}>
          <View style={styles.ratioRow}>
            {RATIO_OPTIONS.map(opt => {
              const on = ratioId === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id} onPress={() => changeRatio(opt.id)} activeOpacity={0.8}
                  style={[styles.ratioChip, on && { backgroundColor: C.primary, borderColor: C.primary }]}
                >
                  <Text style={[styles.ratioChipText, on && { color: C.onPrimary, fontWeight: '800' }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.cropHint}>Pinch to zoom &middot; drag to reposition</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── Draggable photo thumb ───────────────────────────────────────────────────

function DraggablePhotoThumb({
  index, url, isCover, count, cols, cellSize, activeIndex, overIndex, onDragStart, onDragEnd, onPress, onRemove,
}: {
  index: number; url: string; isCover: boolean; count: number; cols: number; cellSize: number;
  activeIndex: SharedValue<number>; overIndex: SharedValue<number>;
  onDragStart: () => void;
  onDragEnd: (from: number, to: number) => void;
  onPress: () => void; onRemove: () => void;
}) {
  const C = useColors();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const step = cellSize + PHOTO_GAP;

  // Gesture.Pan() is rebuilt fresh every render (not memoized), so it already closes
  // over the current `index`/`cols`/`step` props directly — no ref indirection needed.
  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      translateX.value = 0;
      translateY.value = 0;
      activeIndex.value = index;
      overIndex.value = index;
      runOnJS(onDragStart)();
    })
    .onUpdate(e => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      const col = index % cols;
      const row = Math.floor(index / cols);
      const rawCol = Math.max(0, Math.min(cols - 1, col + Math.round(e.translationX / step)));
      const rawRow = Math.max(0, row + Math.round(e.translationY / step));
      const raw = rawRow * cols + rawCol;
      const clamped = Math.max(0, Math.min(count - 1, raw));
      if (clamped !== overIndex.value) overIndex.value = clamped;
    })
    .onEnd(() => {
      translateX.value = withSpring(0, { damping: 20, stiffness: 260 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 260 });
      const from = index;
      const to = overIndex.value;
      activeIndex.value = -1;
      overIndex.value = -1;
      runOnJS(onDragEnd)(from, to);
    });

  const animStyle = useAnimatedStyle(() => {
    const active = activeIndex.value === index;
    if (active) {
      return {
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: 1.06 }],
        zIndex: 10, shadowOpacity: 0.22,
      };
    }
    let shift = 0;
    if (activeIndex.value !== -1) {
      const a = activeIndex.value, t = overIndex.value;
      if (a < index && index <= t) shift = -1;
      else if (a > index && index >= t) shift = 1;
    }
    // Shifted items land in the grid slot the next/previous index occupies —
    // usually one column over, but a row-wrap slides them a full row instead.
    const targetIndex = index + shift;
    const mineCol = index % cols, mineRow = Math.floor(index / cols);
    const targetCol = targetIndex % cols, targetRow = Math.floor(targetIndex / cols);
    return {
      transform: [
        { translateX: withTiming((targetCol - mineCol) * step, { duration: 160 }) },
        { translateY: withTiming((targetRow - mineRow) * step, { duration: 160 }) },
        { scale: 1 },
      ],
      zIndex: 0, shadowOpacity: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View style={[styles.photoThumb, { width: cellSize, height: cellSize }, animStyle]}>
        <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoRemoveBtn} onPress={onRemove} hitSlop={6}>
          <Ionicons name="close" size={13} color="#FFFBF1" />
        </TouchableOpacity>
        {isCover && (
          <View style={styles.coverBadge}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.onPrimary, letterSpacing: 0.5 }}>COVER</Text>
          </View>
        )}
        <View style={styles.photoIndex}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.onPrimary }}>{index + 1}</Text>
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
}

// ── Photo strip ──────────────────────────────────────────────────────────────

function PhotoStrip({ getToken, photos, onAdd, onRemove, onReorder, onDragActiveChange }: {
  getToken: () => Promise<string | null>; photos: string[];
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onReorder: (next: string[]) => void;
  // The grid's own drag-to-reorder gesture fights the wizard's outer vertical
  // scroll (and the sheet's swipe-to-dismiss) once dragging moves between rows —
  // this freezes both for the duration, same as the slider steps already do.
  onDragActiveChange: (active: boolean) => void;
}) {
  const C = useColors();
  const { width: winW } = useWindowDimensions();
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const uploading = uploadProgress.total > 0;
  const [cropQueue, setCropQueue] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [cropDone, setCropDone] = useState<{ uri: string; mimeType?: string; fileName?: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const activeIndex = useSharedValue(-1);
  const overIndex = useSharedValue(-1);
  // Matches the step content's horizontal padding (20 on each side) so the grid's
  // `cols` cells fill the row edge-to-edge.
  const cellSize = (winW - 40 - (PHOTO_GRID_COLS - 1) * PHOTO_GAP) / PHOTO_GRID_COLS;

  const pickAndUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: Math.max(1, 10 - photos.length),
    });
    if (result.canceled || !result.assets?.length) return;
    setCropDone([]);
    setCropQueue(result.assets);
  };

  const uploadAll = async (items: { uri: string; mimeType?: string; fileName?: string }[]) => {
    setUploadProgress({ done: 0, total: items.length });
    // Fetch a fresh token right before uploading — this can happen many minutes into
    // the modal session, well past a Clerk session token's short lifetime.
    const tok = await getToken();
    if (!tok) {
      showToast("Couldn't upload photos — please try again", 'error');
      setUploadProgress({ done: 0, total: 0 });
      return;
    }
    const urls: string[] = [];
    for (const item of items) {
      try {
        // Crop step already sized this down to CROP_TARGET_MAX_DIMENSION; this is
        // just the request-body-cap safety net. Server normalizes to JPEG + strips
        // EXIF regardless — see /api/upload.
        const { blob, mimeType } = await fitUnderUploadCap(item.uri, item.mimeType);
        const { publicUrl } = await apiFetch<{ publicUrl: string }>('/api/upload', tok, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: blob,
        });
        urls.push(publicUrl);
      } catch (e) {
        console.warn('Photo upload failed:', e);
      } finally {
        setUploadProgress(p => ({ done: p.done + 1, total: p.total }));
      }
    }
    if (urls.length) onAdd(urls);
    setUploadProgress({ done: 0, total: 0 });
  };

  const advanceCrop = (finalUri: string, mimeType?: string) => {
    const asset = cropQueue[0];
    const nextDone = [...cropDone, { uri: finalUri, mimeType: mimeType ?? 'image/jpeg', fileName: asset.fileName ?? 'photo.jpg' }];
    const rest = cropQueue.slice(1);
    if (rest.length === 0) {
      setCropQueue([]);
      setCropDone([]);
      uploadAll(nextDone);
    } else {
      setCropDone(nextDone);
      setCropQueue(rest);
    }
  };

  const cancelCrops = () => { setCropQueue([]); setCropDone([]); };

  const handleReorder = (from: number, to: number) => {
    onDragActiveChange(false);
    if (from === to) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  return (
    <View>
      <PhotoCropModal
        uri={cropQueue[0]?.uri ?? null}
        index={cropDone.length}
        total={cropDone.length + cropQueue.length}
        onCancel={cancelCrops}
        onDone={advanceCrop}
      />
      {lightboxIndex !== null && (
        <ImageLightbox
          images={photos.map(url => ({ url }))}
          initialIndex={lightboxIndex}
          loop={false}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: PHOTO_GAP }}>
        {photos.map((url, idx) => (
          <DraggablePhotoThumb
            key={url}
            index={idx} url={url} isCover={idx === 0} count={photos.length}
            cols={PHOTO_GRID_COLS} cellSize={cellSize}
            activeIndex={activeIndex} overIndex={overIndex}
            onDragStart={() => onDragActiveChange(true)}
            onDragEnd={handleReorder}
            onPress={() => setLightboxIndex(idx)}
            onRemove={() => onRemove(url)}
          />
        ))}
        {photos.length < 10 && (
          <TouchableOpacity
            onPress={pickAndUpload} disabled={uploading} activeOpacity={0.7}
            style={[styles.photoAdd, { width: cellSize, height: cellSize }]}
          >
            <Ionicons name={uploading ? 'hourglass' : 'add'} size={28} color={C.primary} />
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.primary, marginTop: 5, textAlign: 'center' }}>
              {uploading ? 'Uploading…' : 'Add photos'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {uploading ? (
        <View style={styles.uploadProgressWrap}>
          <View style={styles.uploadProgressTrack}>
            <View style={[styles.uploadProgressFill, { width: `${(uploadProgress.done / uploadProgress.total) * 100}%`, backgroundColor: C.primary }]} />
          </View>
          <Text style={styles.uploadProgressText}>Uploading {uploadProgress.done} of {uploadProgress.total}…</Text>
        </View>
      ) : photos.length > 1 && (
        <Text style={styles.photoReorderHint}>Press and hold a photo to reorder</Text>
      )}
    </View>
  );
}

// ── ParkPickerSheet ───────────────────────────────────────────────────────────

function ParkPickerSheet({ visible, parks, selected, onClose, onPick }: {
  visible: boolean; parks: ParkInfo[]; selected: string;
  onClose: () => void; onPick: (code: string) => void;
}) {
  const C = useColors();
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = (q.trim()
    ? parks.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.states.toLowerCase().includes(q.toLowerCase()))
    : parks
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.pickerContainer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 17, color: C.inkMute }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>Which park?</Text>
          <View style={{ width: 64 }} />
        </View>

        {/* Search */}
        <View style={styles.pickerSearch}>
          <Ionicons name="search" size={15} color={C.inkMute} />
          <TextInput
            value={q} onChangeText={setQ} placeholder="Search 63 parks…"
            placeholderTextColor={C.inkMute} style={{ flex: 1, fontSize: 15, color: C.ink }}
            autoFocus autoCorrect={false}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')}>
              <Ionicons name="close-circle" size={17} color={C.inkMute} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={p => p.park_code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
          renderItem={({ item: p }) => {
            const on = selected === p.park_code;
            const state2 = p.states.split(',')[0].trim().slice(0, 2).toUpperCase();
            return (
              <TouchableOpacity onPress={() => { onPick(p.park_code); onClose(); }} activeOpacity={0.7}
                style={[styles.parkRow, { backgroundColor: on ? C.surfaceAlt : 'transparent' }]}>
                <View style={[styles.parkBadge, { backgroundColor: C.primary }]}>
                  <Text style={{ color: C.onPrimary, fontWeight: '800', fontSize: 13 }}>{state2}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>{p.name}</Text>
                  <Text style={{ fontSize: 13, color: C.inkMute }}>{fullStateName(p.states.split(',')[0].trim())}</Text>
                </View>
                {on && <Ionicons name="checkmark" size={17} color={C.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// ── Date sheet (custom inline calendar in a bottom sheet) ─────────────────────

function stripTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function DateSheet({ visible, title, value, minimumDate, maximumDate, onPick, onClose }: {
  visible: boolean;
  title: string;
  value: Date;
  minimumDate?: Date;
  maximumDate: Date;
  onPick: (d: Date) => void;
  onClose: () => void;
}) {
  const C = useColors();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  // Slide only the sheet; the backdrop fades separately.
  const slide = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  // Wheel-paging months/years still fires onChange (same day-of-month, new
  // month), so applying onPick straight from onChange closed the sheet before
  // a day was actually chosen. Track the picker's live value here instead and
  // only hand it to the parent (and close) on an explicit Done/backdrop tap.
  const [pending, setPending] = useState(value);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      setPending(value);
      slide.setValue(400);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(slide, {
          toValue: 0, useNativeDriver: true,
          damping: 26, mass: 0.8, stiffness: 220,
        }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slide, backdropOpacity]);

  // Mirror of the entrance: slide the sheet down + fade the backdrop, THEN
  // tell the parent to unmount — a bare onClose() would pop it off mid-frame.
  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(slide, { toValue: 400, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [slide, backdropOpacity, onClose]);

  // Applies whatever the picker is currently showing, then closes — used by
  // both Done and the outside-tap, so a day picked via the wheel isn't lost
  // just because the sheet was dismissed by tapping the backdrop.
  const confirm = useCallback(() => {
    onPick(pending);
    dismiss();
  }, [pending, onPick, dismiss]);

  // Plain in-screen overlay, deliberately NOT an RN <Modal>: modal windows
  // render the sheet's bottom strip semi-transparent (some compositor quirk
  // verified in the Xcode view debugger — the layer itself, not any child),
  // which read as a permanent gray band. In-window rendering is clean.
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 300 }]}>
      <Animated.View style={[styles.dateBackdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFillObject} onPress={confirm} />
      <Animated.View
        style={[styles.dateSheet, {
          backgroundColor: isDark ? '#201D17' : '#FFFBF1',
          // Corner radius WITHOUT borderWidth — that combination (border +
          // top-only radii) is what made RN render the sheet's bottom region
          // semi-transparent, i.e. the infamous gray band. Radius alone is a
          // plain CALayer cornerRadius and draws clean.
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          paddingBottom: Math.max(insets.bottom, 16) + 16,
          transform: [{ translateY: slide }],
        }]}
      >
        <View style={styles.dateSheetHeader}>
          <View style={{ width: 48 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{title}</Text>
          <TouchableOpacity onPress={confirm} style={{ width: 48, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.primary }}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 12, paddingTop: 4, alignItems: 'center' }}>
          {/* Explicit fixed width, not alignSelf:'stretch' — full-width stretch let
              UIDatePicker's own Auto Layout decide the grid's internal position,
              which isn't always centered in a frame wider than its intrinsic size.
              A fixed width (clamped above the 280pt minimum UIKit warns about below)
              plus alignItems:'center' on the wrapper pins it dead center every time. */}
          <DateTimePicker
            value={pending}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            accentColor={C.primary}
            themeVariant={isDark ? 'dark' : 'light'}
            style={{ width: Math.max(320, Math.min(winW - 24, 380)) }}
            onChange={(_, d) => {
              // Just track the live value here — paging the month/year wheel
              // re-fires onChange with the same day-of-month too, and closing
              // on every fire (the old behavior) could dismiss the sheet
              // while the user was still spinning to a different month/year,
              // never landing on the day they meant to tap.
              if (!d) return;
              Haptics.selectionAsync();
              setPending(d);
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function RequirementTag({ kind }: { kind: 'required' | 'optional' }) {
  const C = useColors();
  return (
    <Text style={{
      fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase',
      color: kind === 'required' ? `${C.primary}99` : C.inkMute,
    }}>
      {'  '}{kind}
    </Text>
  );
}

function Section({ kicker, title, hint, tag, children, mb = 24 }: {
  kicker?: string; title?: string; hint?: string; tag?: 'required' | 'optional'; children: React.ReactNode; mb?: number;
}) {
  return (
    <View style={{ marginBottom: mb }}>
      {(kicker || title || hint) && (
        <View style={{ marginBottom: 10 }}>
          {(kicker || title) && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              {kicker && <Text style={styles.kicker}>{kicker}</Text>}
              {title  && <Text style={[styles.sectionTitle, kicker ? { marginTop: 0 } : null]}>{title}{tag && <RequirementTag kind={tag} />}</Text>}
            </View>
          )}
          {hint && <Text style={{ fontSize: 13, color: C.inkMute, marginTop: 3, lineHeight: 17 }}>{hint}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

// ── HeroSlide ─────────────────────────────────────────────────────────────────

// Big emoji that pops with a spring whenever it changes — used to react live
// to slider/star drags and chip taps on the hero-slide steps below.
function ReactiveEmoji({ emoji, size = 60 }: { emoji: string; size?: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.08, { damping: 12, stiffness: 280 }),
      withSpring(1, { damping: 14, stiffness: 240 }),
    );
  }, [emoji]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Reanimated.View style={aStyle}>
      <Text style={{ fontSize: size, lineHeight: size * 1.15 }}>{emoji}</Text>
    </Reanimated.View>
  );
}

// Full-slide "one big question" layout used by the Rating/Crowd/Difficulty/
// Weather/WouldReturn steps — a big reactive emoji, a big headline question,
// a live value readout, then the control. Unlike `Section`, this owns the
// value label itself so StarRating/ScaleRow/WeatherGrid/ReturnRow stay pure
// controls with no embedded text.
function HeroSlide({ emoji, title, subtitle, children }: {
  emoji: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  const C = useColors();
  const { height: winH } = useWindowDimensions();
  return (
    <View style={{ flex: 1, minHeight: Math.min(440, winH * 0.55) }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Reanimated.View entering={FadeInDown.delay(40).duration(320)} style={{ marginBottom: 14 }}>
          <ReactiveEmoji emoji={emoji} />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.delay(120).duration(340)} style={{ alignItems: 'center', marginBottom: 28 }}>
          <Text numberOfLines={2} style={{ fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.4, textAlign: 'center' }}>
            {title}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.primary, marginTop: 8, minHeight: 20 }}>
            {subtitle}
          </Text>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.delay(200).duration(380)} style={{ width: '100%' }}>
          {children}
        </Reanimated.View>
      </View>

      {/* Every HeroSlide step (Rating/Crowd/Difficulty/Weather/WouldReturn) is
          skippable — canContinue only gates step 0 — but nothing on-screen
          said so, which read as required. Laid out in normal flow below the
          centered content (not absolute) so a tall grid like Weather's can't
          grow into it — see StepPhotos for the same label on its own step. */}
      <Text style={{ alignSelf: 'flex-end', fontSize: 11, color: C.inkMute, paddingTop: 8 }}>
        Optional
      </Text>
    </View>
  );
}

// ── Step screens ──────────────────────────────────────────────────────────────

// TouchableOpacity that also squishes slightly on press, for a more tactile feel
// on the primary tap targets of the wizard steps. Uses the classic Animated API
// (not Reanimated) because the caller styles carry DynamicColorIOS colors,
// which Reanimated rejects ("Invalid color value") in animated styles.
// `containerStyle` lands on the outer touchable — use it for flex-row sizing
// (e.g. percentage widths in a wrapping grid), which must live on the flex child.
function PressableScale({ onPress, disabled, style, containerStyle, children }: {
  onPress?: () => void; disabled?: boolean; style?: any; containerStyle?: any; children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (v: number) =>
    Animated.spring(scale, { toValue: v, speed: 40, bounciness: 5, useNativeDriver: true }).start();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={containerStyle}
      onPressIn={() => springTo(0.97)}
      onPressOut={() => springTo(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

function StepWhere({
  draft, set, parks, onPickPark, onOpenPicker,
}: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  parks: ParkInfo[]; onPickPark: () => void;
  // Opens the date sheet — owned by the screen root, not this step, so the
  // overlay escapes the step ScrollView (see the DateSheet render up there).
  onOpenPicker: (which: 'start' | 'end') => void;
}) {
  const C = useColors();
  const park = parks.find(p => p.park_code === draft.parkCode);

  const days = dayCount(draft.startDate, draft.endDate);

  // Trip title / dates spring open once a park is picked, instead of just
  // snapping between two fixed opacities.
  const unlockedSV = useSharedValue(park ? 1 : 0);
  useEffect(() => {
    unlockedSV.value = withSpring(park ? 1 : 0, { damping: 18, stiffness: 180 });
  }, [!!park]);
  // Opacity-only unlock — no translate, these fields are already on screen
  // (dimmed) before the park is picked, so floating them in reads as a reload.
  const unlockedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + unlockedSV.value * 0.65,
  }));

  return (
    <View>
      <Reanimated.View entering={FadeInDown.duration(360)} style={{ marginBottom: 24 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Where & when</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(80).duration(360)}>
        <Section title="Park" tag="required" mb={28}>
          {/* Park picker */}
          <PressableScale onPress={onPickPark} style={[
            styles.parkBanner,
            // Selected state drops the container border — the primary-colored
            // background bleeds through a container border at the rounded
            // corners (visibly in dark mode), so a uniform hairline ring is
            // overlaid on top of the image instead (below).
            { backgroundColor: park ? C.primaryDeep : C.surfaceAlt, borderWidth: park ? 0 : 1.5, borderStyle: park ? 'solid' : 'dashed' },
          ]}>
            {/* Faint cover photo behind the banner content, like web — kept as a
                direct (non-absolute-wrapped) sibling so absoluteFill bleeds edge
                to edge past the banner's own padding, same as the text row below. */}
            {park && park.image_url ? (
              <Image
                source={{ uri: park.image_url }}
                style={StyleSheet.absoluteFill as any}
                resizeMode="cover"
              />
            ) : null}
            {park && (
              <LinearGradient
                colors={['rgba(0,0,0,0.58)', 'rgba(0,0,0,0.16)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
            )}
            {park && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
                borderRadius: 16, borderWidth: 1, borderColor: C.hairline,
              }]} />
            )}
            <Reanimated.View key={park?.park_code ?? 'empty'} entering={FadeIn.duration(220)}>
              {park ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ fontSize: 19, fontWeight: '800', color: C.onPrimary, letterSpacing: -0.3 }}>{park.name}</Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,251,241,0.8)', marginTop: 1 }}>{fullStateName(park.states.split(',')[0].trim())}</Text>
                  </View>
                  {/* Pill is always light cream, so its ink stays dark in both themes */}
                  <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,251,241,0.92)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 }}>
                    <Ionicons name="pencil" size={11} color="#1B1A16" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B1A16' }}>Change</Text>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="search" size={20} color="#FFFBF1" />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink, letterSpacing: -0.2 }}>Select a park</Text>
                    <Text style={{ fontSize: 13, color: C.inkMute, marginTop: 2 }}>Search all 63 national parks</Text>
                  </View>
                </View>
              )}
            </Reanimated.View>
          </PressableScale>
        </Section>
      </Reanimated.View>

      {/* Rest locked until park selected — the entrance fade and the lock/unlock
          opacity are two separate Reanimated-driven animations, so each needs its
          own wrapper: applying both `entering` and an animated `opacity` style to
          the same node makes them fight over the same property. */}
      <Reanimated.View entering={FadeInDown.delay(160).duration(360)}>
      <Reanimated.View
        style={unlockedStyle}
        pointerEvents={park ? 'auto' : 'none'}
      >
        <Section title="Dates" tag="required" mb={28}>
          <View style={[styles.card, { paddingVertical: 4 }]}>
            <PressableScale
              onPress={() => onOpenPicker('start')}
              style={[styles.dateRow, { borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft }]}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar" size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Start *</Text>
                <Text style={[styles.dateValue, { color: draft.startDate ? C.ink : C.inkMute }]}>
                  {draft.startDate ? fmtDate(draft.startDate) : 'Select'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
            </PressableScale>

            <PressableScale
              onPress={() => onOpenPicker('end')}
              disabled={!draft.startDate}
              style={[styles.dateRow, { opacity: draft.startDate ? 1 : 0.4 }]}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar-outline" size={16} color={C.inkMute} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>End</Text>
                <Text style={[styles.dateValue, { color: draft.endDate ? C.ink : C.inkMute }]}>
                  {draft.endDate ? fmtDate(draft.endDate) : 'Optional'}
                </Text>
              </View>
              {draft.endDate
                ? <TouchableOpacity onPress={() => set('endDate', null)} hitSlop={8}><Ionicons name="close-circle" size={16} color={C.inkMute} /></TouchableOpacity>
                : <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
              }
            </PressableScale>
          </View>
          {days > 1 && (
            <Text style={{ fontSize: 13, color: C.accent, fontWeight: '700', marginTop: 6 }}>{days} day trip</Text>
          )}
        </Section>

        <Section title="Trip title" mb={0}>
          <TextInput
            value={draft.title} onChangeText={v => set('title', v.slice(0, 80))}
            placeholder="Give this trip a name" placeholderTextColor={C.inkMute}
            style={styles.textField}
          />
        </Section>
      </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

// "The visit" used to be one screen with five controls stacked on top of each
// other. Split into one question per screen so nothing competes for attention —
// each still gets the same fade-in-down entrance the other steps use.
function StepRating({ draft, set, onSliderDragChange }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onSliderDragChange?: (dragging: boolean) => void;
}) {
  const r = draft.rating;
  return (
    <HeroSlide
      emoji={RATING_EMOJI[Math.min(5, Math.max(0, Math.ceil(r)))]}
      title="How was it?"
      subtitle={r > 0 ? `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)} / 5 · ${HALF_LABELS[r]}` : 'Tap or swipe to rate'}
    >
      <StarRating value={r} onChange={v => set('rating', v)} onDragChange={onSliderDragChange} />
    </HeroSlide>
  );
}

function StepCrowd({ draft, set, onSliderDragChange }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onSliderDragChange?: (dragging: boolean) => void;
}) {
  const v = draft.crowd;
  return (
    <HeroSlide
      emoji={v > 0 ? CROWD_EMOJI[v - 1] : '🏞️'}
      title="How crowded was it?"
      subtitle={v > 0 ? CROWD_LABELS[v - 1] : 'Drag or tap to set'}
    >
      <ScaleRow value={v} onChange={x => set('crowd', x)} labels={CROWD_LABELS} onDragChange={onSliderDragChange} />
    </HeroSlide>
  );
}

function StepDifficulty({ draft, set, onSliderDragChange, onClearHike, onPickGpx, gpxLoading }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onSliderDragChange?: (dragging: boolean) => void;
  onClearHike: () => void;
  onPickGpx: () => void;
  gpxLoading: boolean;
}) {
  const C = useColors();
  const v = draft.difficulty;
  return (
    <HeroSlide
      emoji={v > 0 ? DIFF_EMOJI[v - 1] : '🥾'}
      title="How tough was the trail?"
      subtitle={v > 0 ? DIFF_LABELS[v - 1] : 'Drag or tap to set'}
    >
      <ScaleRow value={v} onChange={x => set('difficulty', x)} labels={DIFF_LABELS} onDragChange={onSliderDragChange} />

      {/* Trail GPX import lives here rather than on Where & when — it pairs
          naturally with rating the trail's difficulty. See lib/gpx.ts. */}
      <View style={{ marginTop: 24 }}>
        {draft.hikeSource ? (
          <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }]}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="map" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>GPX route attached</Text>
              <Text style={{ fontSize: 12.5, color: C.inkMute }}>
                {draft.distanceMeters != null ? fmtMiles(draft.distanceMeters) : ''}
                {draft.durationSeconds != null ? ` · ${fmtDuration(draft.durationSeconds)}` : ''}
                {draft.elevationGainMeters != null ? ` · ${fmtElevationFt(draft.elevationGainMeters)} gain` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClearHike} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onPickGpx}
            disabled={gpxLoading}
            style={[styles.card, { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, opacity: gpxLoading ? 0.5 : 1 }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              {gpxLoading
                ? <ActivityIndicator size="small" color={C.inkMute} />
                : <Ionicons name="document-outline" size={18} color={C.inkMute} />
              }
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>Upload a GPX file</Text>
          </TouchableOpacity>
        )}
      </View>
    </HeroSlide>
  );
}

function StepWeather({ draft, set }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  const sel = draft.weather;
  // Hero emoji mirrors the most recent pick (last item in the selection array).
  const lastPicked = WEATHER_OPTS.find(w => w.id === sel[sel.length - 1]);
  return (
    <HeroSlide
      emoji={lastPicked?.emoji ?? '🌦️'}
      title="What was the weather like?"
      subtitle={sel.length > 0 ? `${sel.length} selected` : 'Pick all that apply'}
    >
      <WeatherGrid value={sel} onChange={v => set('weather', v)} />
    </HeroSlide>
  );
}

function StepWouldReturn({ draft, set }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  const picked = RETURN_OPTS.find(o => o.id === draft.wouldReturn);
  return (
    // Hero emoji stays static here — the options carry their own icons, so a
    // reactive swap up top would just duplicate the selection feedback.
    <HeroSlide
      emoji="🧭"
      title="Would you go back?"
      subtitle={picked?.label ?? 'Pick one'}
    >
      <ReturnRow value={draft.wouldReturn} onChange={v => set('wouldReturn', v)} />
    </HeroSlide>
  );
}

// Photos gets its own full step now — the strip is the whole page's focus
// instead of one section competing with four text/chip fields underneath it.
function StepPhotos({ draft, set, getToken, originalPhotos, onDragActiveChange }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  getToken: () => Promise<string | null>;
  originalPhotos: Set<string>;
  onDragActiveChange: (active: boolean) => void;
}) {
  const C = useColors();
  return (
    <View>
      <Reanimated.View entering={FadeInDown.duration(360)} style={{ marginBottom: 10 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Add your photos</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(60).duration(360)} style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 14, color: C.inkMute, lineHeight: 19 }}>
          {draft.photos.length > 0
            ? `${draft.photos.length} of 10 — drag to reorder, first is the cover`
            : 'Pick your best shots to show off the trip'}
        </Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(120).duration(380)}>
        <PhotoStrip
          getToken={getToken} photos={draft.photos} onDragActiveChange={onDragActiveChange}
          onAdd={urls => set('photos', [...draft.photos, ...urls].slice(0, 10))}
          onRemove={url => {
            const next = draft.photos.filter(p => p !== url);
            set('photos', next);
            // Only nuke it immediately if it was uploaded this session — photos already
            // attached to the saved visit stay live until the edit is actually submitted.
            if (!originalPhotos.has(url)) getToken().then(tok => deletePhotos([url], tok));
          }}
          onReorder={next => set('photos', next)}
        />
      </Reanimated.View>
    </View>
  );
}

function StepJournal({ draft, set, token, npsActivityNames }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; token: string;
  npsActivityNames: string[];
}) {
  const C = useColors();
  return (
    <View>
      <Reanimated.View entering={FadeInDown.duration(360)} style={{ marginBottom: 24 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Journal</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(80).duration(360)}>
        <Section title="Highlight">
          <TextInput
            value={draft.highlight} onChangeText={v => set('highlight', v.slice(0, 90))}
            placeholder="The one moment you'll remember..." placeholderTextColor={C.inkMute}
            style={[styles.textField, { marginBottom: 0 }]}
          />
          <Text style={styles.charCountOutside}>{draft.highlight.length}/90</Text>
        </Section>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(160).duration(360)}>
        <Section title="Who came along?">
          <CompanionSearch
            companions={draft.companions} companionObjs={draft.companionObjs}
            onChange={(ids, objs) => { set('companions', ids); set('companionObjs', objs); }}
            token={token}
          />
        </Section>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(240).duration(360)}>
        <Section title="Notes">
          <TextInput
            value={draft.notes} onChangeText={v => set('notes', v.slice(0, 2000))}
            placeholder="What did you see, hear, feel?" placeholderTextColor={C.inkMute}
            multiline style={[styles.textField, styles.textArea]}
          />
          <Text style={styles.charCountOutside}>{draft.notes.length}/2000</Text>
        </Section>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(320).duration(360)}>
        <Section title="Activities">
          <ActivityChips value={draft.activities} onChange={v => set('activities', v)} npsActivityNames={npsActivityNames} />
        </Section>
      </Reanimated.View>
    </View>
  );
}

// The share-step preview IS the real feed card: a synthetic FeedPost built
// from the draft, rendered by the actual PostCard inside an inert wrapper.
// No hand-mirrored layout to drift out of date — whatever PostCard renders in
// the feed is exactly what this shows.
function VisitPreview({ draft, park, userName, username, avatarUrl }: {
  draft: Draft; park: ParkInfo | undefined; userName: string; username?: string | null; avatarUrl?: string | null;
}) {
  const previewPost: FeedPost = useMemo(() => ({
    id: -1,
    caption: draft.caption || null,
    photos: draft.photos.length > 0 ? draft.photos : null,
    park_code: draft.parkCode || null,
    badge_id: null,
    visit_id: -1,
    created_at: new Date().toISOString(),
    clerk_user_id: 'preview',
    park_name: park?.name ?? null,
    park_image_url: park?.image_url ?? null,
    username: username ?? null,
    display_name: userName,
    avatar_url: avatarUrl ?? null,
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    is_friend_post: false,
    visibility: draft.visibility.toLowerCase(),
    visit_date: draft.startDate ? draft.startDate.toISOString() : null,
    visit_rating: draft.rating > 0 ? draft.rating : null,
    visit_activities: draft.activities.length > 0 ? draft.activities : null,
    visit_weather: draft.weather.length > 0 ? draft.weather : null,
    visit_crowd: draft.crowd > 0 ? draft.crowd : null,
    visit_difficulty: draft.difficulty > 0 ? draft.difficulty : null,
    visit_companion_count: draft.companionObjs.length > 0 ? draft.companionObjs.length : null,
    visit_companion_names: draft.companionObjs.length > 0
      ? draft.companionObjs.map(c => ({ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url }))
      : null,
    visit_highlight: draft.highlight || null,
    visit_title: draft.title || null,
    visit_ordinal: null,
  }), [draft, park, userName, username, avatarUrl]);

  return (
    <View pointerEvents="none">
      <PostCard post={previewPost} myUserId="preview" openOnPress={false} />
    </View>
  );
}


function StepShare({ draft, set, park, userName, username, avatarUrl }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  park: ParkInfo | undefined; userName: string; username?: string | null; avatarUrl?: string | null;
}) {
  const C = useColors();
  return (
    <View>
      <Reanimated.View entering={FadeInDown.duration(360)}>
        <Section title="Add a caption">
          <TextInput
            value={draft.caption} onChangeText={v => set('caption', v.slice(0, 500))}
            placeholder="Share what made this trip special…" placeholderTextColor={C.inkMute}
            multiline style={[styles.textField, styles.textArea]}
          />
          <Text style={styles.charCountOutside}>{draft.caption.length}/500</Text>
        </Section>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(80).duration(360)}>
        <Section title="Who can see this?">
          <VisibilityPicker value={draft.visibility} onChange={v => set('visibility', v)} />
        </Section>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(160).duration(360)}>
        <Section title="Preview">
          <VisitPreview draft={draft} park={park} userName={userName} username={username} avatarUrl={avatarUrl} />
        </Section>
      </Reanimated.View>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function LogVisitModal() {
  const router   = useRouter();
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets   = useSafeAreaInsets();
  const C = useColors();
  // Swiping this sheet down to dismiss (an interactive UISheetPresentationController
  // dismissal) can leave the window's trait collection stuck on this screen's
  // last-drawn appearance instead of reverting — the tab bar and toast render dark
  // until this forces a resync. See useReassertThemeOnUnmount for the full story.
  useReassertThemeOnUnmount();

  // Edit mode — opened from a feed post's "Edit visit" menu item
  const {
    visitId: visitIdParam, postId: postIdParam, parkCode: parkCodeParam,
    parkName: parkNameParam, parkStates: parkStatesParam, parkImageUrl: parkImageUrlParam,
  } = useLocalSearchParams<{
    visitId?: string; postId?: string; parkCode?: string;
    parkName?: string; parkStates?: string; parkImageUrl?: string;
  }>();
  const editVisitId = visitIdParam ? Number(visitIdParam) : null;
  const editPostId  = postIdParam && !isNaN(Number(postIdParam)) ? Number(postIdParam) : null;
  const isEdit = editVisitId != null && !isNaN(editVisitId);

  const [token,      setToken]      = useState<string | null>(null);
  // Clerk session tokens are short-lived (~60s) — this modal's flow can easily run
  // longer than that, so never reuse a cached token for a request. Always fetch a
  // fresh one right before the call via getTokenRef.current(), per the codebase idiom
  // (see map.tsx, profile/*.tsx). The `token` state is only for gating renders.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const getFreshToken = useCallback(async () => {
    const tok = await getTokenRef.current();
    setToken(tok);
    return tok;
  }, []);
  const [draft,      setDraftState] = useState<Draft>(() => {
    const blank = makeBlank();
    if (!isEdit && parkCodeParam) blank.parkCode = parkCodeParam;
    return blank;
  });
  const [step,       setStep]       = useState(0);
  // Measured height of the floating footer bar, so the scroll content can reserve
  // enough bottom padding not to end up hidden underneath it.
  const [footerH,    setFooterH]    = useState(0);
  // Seed with the park we were opened from (passed via route params) so the "Where"
  // step's park banner renders filled on the very first frame instead of flashing
  // an empty "Select a park" state while the full /api/parks list is still loading.
  // Replaced wholesale once that fetch resolves below.
  const [parks,      setParks]      = useState<ParkInfo[]>(() => {
    if (isEdit || !parkCodeParam || !parkNameParam || !parkStatesParam) return [];
    return [{ park_code: parkCodeParam, name: parkNameParam, states: parkStatesParam, image_url: parkImageUrlParam ?? null }];
  });
  const [showPicker, setShowPicker] = useState(false);
  // Which date the bottom-sheet picker is editing (null = closed) — lives at
  // the screen root so the DateSheet overlay can render outside the step
  // ScrollView (see the render at the bottom of this component).
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editLoading, setEditLoading] = useState(isEdit);
  const scrollRef = useRef<ScrollView>(null);
  // Photo URLs already persisted server-side before this session started (populated
  // when editing an existing visit). Anything in draft.photos NOT in this set was
  // freshly uploaded this session and is safe to delete from storage if abandoned.
  const originalPhotos = useRef<Set<string>>(new Set());

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraftState(prev => ({ ...prev, [k]: v }));
  }, []);

  // ── Drafts ──────────────────────────────────────────────────────────────────
  const draftId = useRef(`draft-${Date.now()}`);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every saved draft, newest first — all of them are listed in the restore
  // banner (not just the newest), since older drafts were otherwise unreachable.
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  // Set when the restored draft was itself saved mid-edit of an existing visit
  // (see handleSubmit's catch-all draft save) — lets a "+"-opened session
  // still PATCH that original visit on submit instead of creating a new one.
  const [resumedEdit, setResumedEdit] = useState<{ visitId: number; postId: number | null } | null>(null);
  const isEditing = isEdit || resumedEdit != null;
  const activeEditVisitId = isEdit ? editVisitId : (resumedEdit?.visitId ?? null);
  const activeEditPostId  = isEdit ? editPostId  : (resumedEdit?.postId  ?? null);
  // Set right before any router.back() we trigger ourselves (Cancel/Discard/Save draft/
  // submit) — those paths already handle the draft + any messaging. Left false, it means
  // the screen is being torn down by something we didn't drive, i.e. the native swipe-down
  // gesture, so the listener below saves the draft and reassures the user it's not lost.
  const leavingViaAction = useRef(false);

  // The sheet dismisses via the native swipe-down-to-close gesture on this `presentation:
  // 'modal'` screen (see app/_layout.tsx). That gesture and the star/slider controls both
  // claim vertical drags, and toggling gestureEnabled from a drag's Grant callback loses
  // the race — the native recognizer has often already begun by the time setOptions lands.
  // So the native gesture is switched off for the whole duration of the drag-driven steps
  // (Rating/Crowd/Difficulty) and the per-drag counter is kept as a belt-and-braces signal
  // for any other step that hosts a draggable control.
  //
  // It's also switched off while editing an existing visit — the "Discard
  // changes?" prompt has to land before anything disappears, and the
  // *interactive* swipe-down commits natively before beforeRemove's
  // preventDefault() below ever runs: that listener fires on the JS thread,
  // but UIKit's own sheet-dismiss animation isn't gated on JS and can finish
  // first, so "Keep editing" was reopening a sheet that had already visually
  // closed. Fresh visits keep the swipe: their draft is continuously
  // auto-saved (see the upsertDraft effect below), so a swipe-away loses
  // nothing and the beforeRemove listener just flushes the pending save.
  // (Other saved drafts are no obstacle — the resume banner lists every
  // draft, so a swipe-away save can't bury one.)
  const activeSliderDrags = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const isDragStep = (s: number) => s >= 1 && s <= 3;
  const blockSwipe = isEditing;
  const blockSwipeRef = useRef(blockSwipe);
  blockSwipeRef.current = blockSwipe;
  // Also freezes the step ScrollView while a slider drag is live — a slightly
  // off-horizontal swipe on a slider was scrolling the content vertically.
  const [controlDragging, setControlDragging] = useState(false);
  const setSliderDragging = useCallback((dragging: boolean) => {
    activeSliderDrags.current = Math.max(0, activeSliderDrags.current + (dragging ? 1 : -1));
    setControlDragging(activeSliderDrags.current > 0);
    navigation.setOptions({
      gestureEnabled: activeSliderDrags.current === 0 && !isDragStep(stepRef.current) && !blockSwipeRef.current,
    });
  }, [navigation]);
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !isDragStep(step) && activeSliderDrags.current === 0 && !blockSwipe,
    });
  }, [step, navigation, blockSwipe]);

  useEffect(() => {
    if (isEdit) return;
    loadDrafts().then(setSavedDrafts);
  }, [isEdit]);

  // Seed a fresh visit's visibility from the user's saved default (Privacy &
  // Moderation settings) — a restored draft or edit still wins since this only
  // runs once, before either of those can have set anything else.
  useEffect(() => {
    if (isEdit) return;
    getDefaultVisibility().then(v => {
      const capitalized = (v.charAt(0).toUpperCase() + v.slice(1)) as Draft['visibility'];
      setDraftState(prev => ({ ...prev, visibility: capitalized }));
    });
  }, [isEdit]);

  // Autosave while editing (debounced) — not when editing an existing visit
  useEffect(() => {
    if (isEdit || !draftHasContent(draft)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
      upsertDraft(draft, parkName, draftId.current, activeEditVisitId ?? undefined, activeEditPostId);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draft, parks, isEdit, activeEditVisitId, activeEditPostId]);

  // Shared save/discard/keep-editing prompt — used by both the explicit close
  // button and the beforeRemove interception below, so swipe-down and hardware
  // back get the exact same confirmation as tapping close.
  const promptExit = useCallback((onConfirmed: () => void) => {
    if (isEditing) {
      Alert.alert('Discard changes?', "Your edits won't be saved.", [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard', style: 'destructive',
          onPress: () => {
            const orphaned = draft.photos.filter(p => !originalPhotos.current.has(p));
            getFreshToken().then(tok => deletePhotos(orphaned, tok));
            if (!isEdit) {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              deleteDraft(draftId.current);
            }
            onConfirmed();
          },
        },
      ]);
      return;
    }
    if (!draftHasContent(draft)) { onConfirmed(); return; }
    Alert.alert('Save as draft?', 'Pick up where you left off next time.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard', style: 'destructive',
        onPress: () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          deleteDraft(draftId.current);
          getFreshToken().then(tok => deletePhotos(draft.photos, tok));
          onConfirmed();
        },
      },
      {
        text: 'Save draft',
        onPress: () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
          upsertDraft(draft, parkName, draftId.current);
          onConfirmed();
        },
      },
    ]);
  }, [isEditing, isEdit, draft, parks]);

  // Catches dismissal we didn't initiate ourselves — the native swipe-down-to-dismiss
  // gesture on this pageSheet, or the Android back button. Fresh visits are let
  // through: the draft auto-save effect above has been upserting all along (same id,
  // so nothing stacks), and this just flushes the debounced write so the last 600ms
  // of input isn't lost with the unmount. Edits still get the discard prompt — the
  // swipe gesture is disabled while editing (see gestureEnabled above), so
  // preventDefault here only ever races a button/back-key, which it wins.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', e => {
      if (leavingViaAction.current) return;
      if (!blockSwipe) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (draftHasContent(draft)) {
          const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
          upsertDraft(draft, parkName, draftId.current);
          showToast('Draft saved');
        }
        return;
      }
      // Editing — the swipe gesture is disabled for that case (see blockSwipe
      // above), so this interception only ever races a button/back-key,
      // which it wins.
      e.preventDefault();
      promptExit(() => {
        leavingViaAction.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, promptExit, blockSwipe, draft, parks]);

  const resumeDraft = (sd: SavedDraft) => {
    const doSwitch = () => {
      setDraftState(sd.draft);
      draftId.current = sd.id;
      // The banner list filters out the active id, so the restored row
      // disappears on its own while any remaining drafts stay reachable.
      if (sd.editVisitId != null) {
        const visitId = sd.editVisitId;
        setResumedEdit({ visitId, postId: sd.editPostId ?? null });
        // Re-fetch the original photo set so the cleanup/cover-photo logic in
        // handleSubmit has the same baseline it would from a route-driven edit.
        getFreshToken().then(tok => {
          if (!tok) return;
          apiFetch<VisitDetail>(`/api/visits/${visitId}`, tok)
            .then(v => { originalPhotos.current = new Set(v.photos ?? []); })
            .catch(() => {});
        });
      } else {
        setResumedEdit(null);
        originalPhotos.current = new Set();
      }
    };

    // Restoring over in-progress work: ask what happens to the current visit
    // first, instead of silently swapping it out from under the user. (The
    // autosave means "Save as draft" mostly just flushes the pending write —
    // the current session then shows up as its own row in the banner list.)
    if (!draftHasContent(draft)) {
      doSwitch();
      return;
    }
    Alert.alert('Switch to this draft?', 'You have a visit in progress.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard current', style: 'destructive',
        onPress: () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          const discardedId = draftId.current;
          deleteDraft(discardedId);
          setSavedDrafts(list => list.filter(s => s.id !== discardedId));
          getFreshToken().then(tok => deletePhotos(draft.photos.filter(p => !originalPhotos.current.has(p)), tok));
          doSwitch();
        },
      },
      {
        text: 'Save as draft',
        onPress: () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
          upsertDraft(draft, parkName, draftId.current, activeEditVisitId ?? undefined, activeEditPostId)
            .then(loadDrafts)
            .then(setSavedDrafts);
          doSwitch();
        },
      },
    ]);
  };

  const discardSavedDraft = (sd: SavedDraft) => {
    deleteDraft(sd.id);
    // An edit-tagged draft's photo list can include photos still live on the
    // original visit — safest to leave storage cleanup to the visit's own
    // photo diffing rather than risk deleting a still-in-use file here.
    if (sd.editVisitId == null) {
      getFreshToken().then(tok => deletePhotos(sd.draft.photos, tok));
    }
    setSavedDrafts(list => list.filter(s => s.id !== sd.id));
  };

  useEffect(() => {
    getFreshToken().then(tok => {
      if (tok) {
        apiFetch<ParkInfo[]>('/api/parks', tok).then(setParks).catch(() => {});
      }
    });
  }, [getFreshToken]);

  // ── GPX hike import ──────────────────────────────────────────────────────────
  const [gpxLoading, setGpxLoading] = useState(false);

  const pickGpxFile = async () => {
    setGpxLoading(true);
    try {
      // '*/*' only — mixing 'application/gpx+xml' (not a real registered iOS
      // UTType) into the type array malformed the allowed-types set on some
      // iOS versions, silently canceling the whole picker session on tap.
      // Extension is already checked below, so no need to filter by MIME.
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      if (!file.name.toLowerCase().endsWith('.gpx')) {
        showToast('Please choose a .gpx file', 'error');
        return;
      }
      const xml = await (await fetch(file.uri)).text();
      const parsed = parseGpx(xml);
      if (!parsed) {
        showToast("Couldn't read a route from that file", 'error');
        return;
      }
      set('hikeSource', 'gpx');
      set('distanceMeters', parsed.distanceMeters);
      set('durationSeconds', parsed.durationSeconds);
      set('elevationGainMeters', parsed.elevationGainMeters);
      set('routePolyline', parsed.routePolyline);
    } catch {
      showToast("Couldn't read that GPX file", 'error');
    } finally {
      setGpxLoading(false);
    }
  };

  const clearHike = () => {
    set('hikeSource', null);
    set('distanceMeters', null);
    set('durationSeconds', null);
    set('elevationGainMeters', null);
    set('routePolyline', null);
  };

  // Prefill the form when editing an existing visit
  useEffect(() => {
    if (!isEdit || !token) return;
    (async () => {
      try {
        const v = await apiFetch<VisitDetail>(`/api/visits/${editVisitId}`, token);
        let caption = '';
        if (editPostId != null) {
          const post = await apiFetch<{ caption: string | null }>(`/api/posts/${editPostId}`, token).catch(() => null);
          caption = post?.caption ?? '';
        }
        let companionObjs: CompanionUser[] = [];
        if (v.companions?.length) {
          companionObjs = await apiFetch<CompanionUser[]>(`/api/users?ids=${v.companions.join(',')}`, token).catch(() => []);
        }
        const vis = v.visibility ?? 'friends';
        const visibility = (vis.charAt(0).toUpperCase() + vis.slice(1)) as Draft['visibility'];
        originalPhotos.current = new Set(v.photos ?? []);
        // The first photo is now always the cover — if this visit had a
        // different photo set as cover previously, move it to the front.
        const photos = v.photos ?? [];
        const orderedPhotos = v.cover_photo && photos.includes(v.cover_photo) && photos[0] !== v.cover_photo
          ? [v.cover_photo, ...photos.filter(p => p !== v.cover_photo)]
          : photos;
        setDraftState({
          parkCode:   v.park_code,
          startDate:  v.visited_date ? new Date(v.visited_date) : null,
          endDate:    v.end_date ? new Date(v.end_date) : null,
          title:      v.title ?? '',
          rating:     v.rating ?? 0,
          crowd:      v.crowd ?? 0,
          difficulty: v.difficulty ?? 0,
          weather:    v.weather_conditions ?? [],
          wouldReturn: v.would_return ?? null,
          highlight:  v.highlight ?? '',
          notes:      v.notes ?? '',
          activities: v.activities ?? [],
          companions: v.companions ?? [],
          companionObjs,
          photos:     orderedPhotos,
          visibility: ['Private', 'Friends', 'Public'].includes(visibility) ? visibility : 'Friends',
          caption,
          hikeSource:          (v.external_source as 'gpx' | null) ?? null,
          distanceMeters:      v.distance_meters,
          durationSeconds:     v.duration_seconds,
          elevationGainMeters: v.elevation_gain_meters,
          routePolyline:       v.route_polyline,
        });
      } catch {
        Alert.alert('Could not load visit', 'Please try again.');
        router.back();
      } finally {
        setEditLoading(false);
      }
    })();
  }, [isEdit, token, editVisitId, editPostId, router]);

  // Union of NPS activity names across all parks — feeds activity autocomplete
  const [npsActivityNames, setNpsActivityNames] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${BASE}/api/parks/activities`)
      .then(r => r.ok ? r.json() : {})
      .then((map: Record<string, string[]>) => {
        const names = new Set<string>();
        Object.values(map).forEach(list => list.forEach(n => names.add(n)));
        setNpsActivityNames([...names].sort());
      })
      .catch(() => {});
  }, []);

  const canContinue = step === 0 ? !!draft.parkCode && !!draft.startDate : true;
  const isLast = step === STEPS.length - 1;

  const goNext = () => {
    if (!canContinue) return;
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const goBack = () => {
    if (step === 0) return;
    setStep(s => s - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  // Jump straight to Share (visibility + optional caption), skipping the
  // Visit/Journal steps for people who just want to log park + date fast.
  const goToShare = () => {
    if (!canContinue) return;
    setStep(STEPS.length - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleCancel = () => {
    promptExit(() => {
      leavingViaAction.current = true;
      router.back();
    });
  };

  const handleSubmit = async () => {
    if (!draft.parkCode || !draft.startDate) return;
    setSubmitting(true);
    try {
      // Fetch a fresh token right here rather than reusing the one from mount —
      // this flow can easily run past a Clerk session token's ~60s lifetime.
      const tok = await getFreshToken();
      if (!tok) throw new Error('No auth token');

      if (isEditing) {
        await apiFetch(`/api/visits/${activeEditVisitId}`, tok, {
          method: 'PATCH',
          body: JSON.stringify({
            park_code:          draft.parkCode,
            visited_date:       draft.startDate.toISOString(),
            end_date:           draft.endDate?.toISOString() ?? null,
            rating:             draft.rating  > 0 ? draft.rating  : null,
            crowd:              draft.crowd   > 0 ? draft.crowd   : null,
            difficulty:         draft.difficulty > 0 ? draft.difficulty : null,
            weather_conditions: draft.weather.length > 0 ? draft.weather : null,
            activities:         draft.activities.length > 0 ? draft.activities : null,
            companions:         draft.companions.length > 0 ? draft.companions : null,
            would_return:       draft.wouldReturn ?? null,
            highlight:          draft.highlight || null,
            title:              draft.title || null,
            notes:              draft.notes || null,
            photos:             draft.photos.length > 0 ? draft.photos : null,
            cover_photo:        draft.photos[0] ?? null,
            visibility:         draft.visibility.toLowerCase(),
            distance_meters:       draft.distanceMeters,
            duration_seconds:      draft.durationSeconds,
            elevation_gain_meters: draft.elevationGainMeters,
            route_polyline:        draft.routePolyline,
            external_source:       draft.hikeSource,
            external_activity_id:  null,
          }),
        });
        if (activeEditPostId != null) {
          await apiFetch(`/api/posts/${activeEditPostId}`, tok, {
            method: 'PATCH',
            body: JSON.stringify({
              caption:   draft.caption || null,
              photos:    draft.photos.length > 0 ? draft.photos : null,
              park_code: draft.parkCode,
            }),
          });
        }
        // Original photos dropped during this edit are no longer referenced anywhere — clean them up.
        deletePhotos([...originalPhotos.current].filter(p => !draft.photos.includes(p)), tok);
        // A resumed edit-draft (route-driven edits never have one) is now applied — remove it.
        if (!isEdit) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          deleteDraft(draftId.current);
        }
        // Badge awards are evaluated server-side on this fetch; fire it now so a
        // newly earned badge pushes a banner immediately instead of waiting for
        // the user to open a badges screen.
        apiFetch('/api/badges', tok).catch(() => {});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Visit updated');
        leavingViaAction.current = true;
        router.back();
        return;
      }

      const visitRes = await apiFetch<{ visit: { id: number } }>('/api/visits', tok, {
        method: 'POST',
        body: JSON.stringify({
          park_code:          draft.parkCode,
          visited_date:       draft.startDate.toISOString(),
          end_date:           draft.endDate?.toISOString() ?? null,
          rating:             draft.rating  > 0 ? draft.rating  : null,
          crowd:              draft.crowd   > 0 ? draft.crowd   : null,
          difficulty:         draft.difficulty > 0 ? draft.difficulty : null,
          weather_conditions: draft.weather.length > 0 ? draft.weather : null,
          activities:         draft.activities.length > 0 ? draft.activities : null,
          companions:         draft.companions.length > 0 ? draft.companions : null,
          would_return:       draft.wouldReturn ?? null,
          highlight:          draft.highlight || null,
          title:              draft.title || null,
          notes:              draft.notes || null,
          photos:             draft.photos.length > 0 ? draft.photos : null,
          cover_photo:        draft.photos[0] ?? null,
          visibility:         draft.visibility.toLowerCase(),
          distance_meters:       draft.distanceMeters,
          duration_seconds:      draft.durationSeconds,
          elevation_gain_meters: draft.elevationGainMeters,
          route_polyline:        draft.routePolyline,
          external_source:       draft.hikeSource,
          external_activity_id:  null,
        }),
      });

      if (draft.visibility !== 'Private' && visitRes.visit?.id) {
        await apiFetch('/api/posts', tok, {
          method: 'POST',
          body: JSON.stringify({
            caption:   draft.caption || null,
            photos:    draft.photos.length > 0 ? draft.photos : null,
            park_code: draft.parkCode,
            visit_id:  visitRes.visit.id,
          }),
        });
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      deleteDraft(draftId.current);
      // Badge awards are evaluated server-side on this fetch; fire it now so a
      // newly earned badge pushes a banner immediately instead of waiting for
      // the user to open a badges screen.
      apiFetch('/api/badges', tok).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Visit logged!');
      leavingViaAction.current = true;
      router.back();
    } catch (e) {
      if (e instanceof Error && e.message.includes('409')) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Park already logged', 'You already have a visit for that park. Edit that visit instead.');
      } else {
        // Post didn't go through — make sure the latest edits are saved as a draft so nothing is
        // lost. Tag it with the visit/post being edited (if any) so restoring it later updates
        // that visit instead of creating a brand-new one.
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
        upsertDraft(draft, parkName, draftId.current, activeEditVisitId ?? undefined, activeEditPostId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast("Couldn't post — saved as a draft", 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header: title on left, close on right; the grabber floats centered
          over the FULL sheet width — inside the left column it sat centered
          in that column only, i.e. visibly left of the sheet's midline. */}
      <View style={styles.modalTopRow}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' }}>
          <View style={styles.grabber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.modalTitle, { marginTop: 12 }]}>{isEditing ? 'Edit visit' : 'Log a visit'}</Text>
        </View>
        {/* +4 centers the circle in the full sheet-top → step-divider span
            (row padding is 10/10 but the divider sits 8 further down) */}
        <TouchableOpacity onPress={handleCancel} style={[styles.modalClose, { transform: [{ translateY: 4 }] }]} hitSlop={8}>
          <GlassIconBg />
          <Ionicons name="close" size={22} color={C.inkSoft} />
        </TouchableOpacity>
      </View>

      {/* Step indicator */}
      <View style={styles.stepBar}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[styles.stepDot, {
              flex: i === step ? 2 : 1,
              backgroundColor: i <= step ? C.primary : C.hairline,
            }]}
          />
        ))}
      </View>

      {/* Step kicker */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
        <Text style={styles.kicker}>STEP {step + 1} OF {STEPS.length}</Text>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 + footerH, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!controlDragging}
      >
        {step === 0 && (() => {
          const visibleDrafts = savedDrafts.filter(s => s.id !== draftId.current);
          if (visibleDrafts.length === 0) return null;
          return (
            <View style={styles.draftBanner}>
              <Text style={styles.draftBannerTitle}>
                {visibleDrafts.length === 1 ? 'You have a saved draft' : `Saved drafts (${visibleDrafts.length})`}
              </Text>
              {visibleDrafts.map((sd, i) => (
                <View key={sd.id} style={[styles.draftBannerRow, i > 0 && styles.draftBannerRowBorder]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.draftBannerSub} numberOfLines={1}>
                      {sd.parkName ?? 'No park selected'}
                      {sd.draft.title ? ` — ${sd.draft.title}` : ''}
                    </Text>
                    <Text style={styles.draftBannerAge}>{draftAge(sd.savedAt)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => resumeDraft(sd)} style={[styles.draftResumeBtn, { backgroundColor: C.primary }]} activeOpacity={0.8}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.onPrimary }}>Restore</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => discardSavedDraft(sd)} hitSlop={6} style={styles.draftDiscardBtn} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={16} color={C.inkMute} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })()}
        {editLoading && (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.inkMute} />
          </View>
        )}
        {!editLoading && step === 0 && (
          <StepWhere
            draft={draft} set={set} parks={parks}
            onPickPark={() => setShowPicker(true)} onOpenPicker={setOpenPicker}
          />
        )}
        {step === 1 && <StepRating draft={draft} set={set} onSliderDragChange={setSliderDragging} />}
        {step === 2 && <StepCrowd draft={draft} set={set} onSliderDragChange={setSliderDragging} />}
        {step === 3 && (
          <StepDifficulty
            draft={draft} set={set} onSliderDragChange={setSliderDragging}
            onClearHike={clearHike} onPickGpx={pickGpxFile} gpxLoading={gpxLoading}
          />
        )}
        {step === 4 && <StepWeather draft={draft} set={set} />}
        {step === 5 && <StepWouldReturn draft={draft} set={set} />}
        {step === 6 && <StepPhotos draft={draft} set={set} getToken={getFreshToken} originalPhotos={originalPhotos.current} onDragActiveChange={setSliderDragging} />}
        {step === 7 && token && <StepJournal draft={draft} set={set} token={token} npsActivityNames={npsActivityNames} />}
        {step === 8 && (
          <StepShare
            draft={draft}
            set={set}
            park={parks.find(p => p.park_code === draft.parkCode)}
            userName={user?.fullName ?? user?.username ?? 'You'}
            username={user?.username}
            avatarUrl={user?.imageUrl}
          />
        )}
      </ScrollView>

      {/* Footer nav — floats over the scroll content, so it needs its own fade so
          text scrolling underneath doesn't cut off hard against the button bar. */}
      <View
        style={styles.footerFloat}
        onLayout={e => setFooterH(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
        <LinearGradient
          // Same RGB (bg) at both stops, alpha-only ramp — black-transparent
          // start would tint the fade gray over light content underneath.
          // Literal stops per scheme: LinearGradient can't take DynamicColorIOS.
          colors={isDark ? ['rgba(23,21,17,0)', '#171511'] : ['rgba(242,235,219,0)', '#F2EBDB']}
          style={styles.footerFade}
          pointerEvents="none"
        />
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.footerTopRow}>
            <View style={{ width: 80 }} />

            <View style={{ flexDirection: 'row', gap: 5 }}>
              {STEPS.map((_, i) => (
                <View key={i} style={[styles.progDot, {
                  width: i === step ? 18 : 6,
                  backgroundColor: i <= step ? C.primary : C.hairline,
                }]} />
              ))}
            </View>

            <View style={{ width: 80 }} />
          </View>

          {step > 0 ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={goBack} style={[styles.backBtn, { flex: 1, width: undefined }]} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={18} color={C.ink} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={isLast ? handleSubmit : goNext}
                disabled={!canContinue || submitting}
                style={[
                  styles.nextBtn,
                  { flex: 3, width: undefined },
                  {
                    backgroundColor: canContinue ? C.primary : C.surfaceAlt,
                    borderWidth: canContinue ? 0 : 1,
                    borderColor: C.hairline,
                    shadowColor: C.primary,
                    shadowOpacity: canContinue ? 0.3 : 0,
                    elevation: canContinue ? 4 : 0,
                    opacity: canContinue ? 1 : 0.45,
                  },
                ]}
                activeOpacity={0.85}
              >
                {isLast && submitting ? (
                  <ActivityIndicator color={C.onPrimary} size="small" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: '800', color: canContinue ? C.onPrimary : C.inkMute }}>
                    {isLast ? (isEditing ? 'Save' : 'Post') : 'Continue'}
                  </Text>
                )}
                {!isLast && <Ionicons name="arrow-forward" size={15} color={canContinue ? C.onPrimary : C.inkMute} />}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={goToShare}
                disabled={!canContinue}
                style={[styles.backBtn, { flex: 1, width: undefined, opacity: canContinue ? 1 : 0.45 }]}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.ink }}>Skip & save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={goNext}
                disabled={!canContinue}
                style={[
                  styles.nextBtn,
                  { flex: 3, width: undefined },
                  {
                    backgroundColor: canContinue ? C.primary : C.surfaceAlt,
                    borderWidth: canContinue ? 0 : 1,
                    borderColor: C.hairline,
                    shadowColor: C.primary,
                    shadowOpacity: canContinue ? 0.3 : 0,
                    elevation: canContinue ? 4 : 0,
                    opacity: canContinue ? 1 : 0.45,
                  },
                ]}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: canContinue ? C.onPrimary : C.inkMute }}>
                  Continue
                </Text>
                <Ionicons name="arrow-forward" size={15} color={canContinue ? C.onPrimary : C.inkMute} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ParkPickerSheet
        visible={showPicker} parks={parks} selected={draft.parkCode}
        onClose={() => setShowPicker(false)} onPick={code => set('parkCode', code)}
      />

      {/* Date sheet — rendered at the screen root (not inside StepWhere's
          ScrollView, and deliberately not an RN Modal — see DateSheet). */}
      <DateSheet
        visible={openPicker !== null}
        title={openPicker === 'end' ? 'End date' : 'Start date'}
        value={openPicker === 'end'
          ? (draft.endDate ?? draft.startDate ?? new Date())
          : (draft.startDate ?? new Date())}
        minimumDate={openPicker === 'end' ? (draft.startDate ?? undefined) : undefined}
        maximumDate={new Date()}
        onPick={d => {
          if (openPicker === 'end') {
            set('endDate', d);
          } else {
            set('startDate', d);
            // Keep the range valid — an end date before the new start is stale
            if (draft.endDate && stripTime(draft.endDate) < stripTime(d)) set('endDate', null);
          }
        }}
        onClose={() => setOpenPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Draft restore banner
  draftBanner: {
    backgroundColor: 'rgba(31,61,46,0.07)',
    borderWidth: 0.5, borderColor: 'rgba(31,61,46,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 20,
  },
  draftBannerTitle: {
    fontSize: 13, fontWeight: '700', color: C.ink,
  },
  draftBannerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 8,
  },
  draftBannerRowBorder: {
    marginTop: 8,
    borderTopWidth: 0.5, borderTopColor: 'rgba(31,61,46,0.18)',
  },
  draftBannerSub: {
    fontSize: 13, color: C.inkMute, marginTop: 1,
  },
  draftBannerAge: {
    fontSize: 12, color: C.inkMute, marginTop: 2,
  },
  draftResumeBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  draftDiscardBtn: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 8,
    flexShrink: 0,
  },

  // Modal chrome
  grabber: {
    width: 36, height: 4.5, borderRadius: 3,
    backgroundColor: dyn('rgba(27,26,22,0.18)', 'rgba(240,234,217,0.24)'),
  },
  modalTopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.5, lineHeight: 30,
  },
  // Matches SearchOverlay's closeBtn (44pt Liquid Glass circle) — GlassIconBg
  // needs overflow hidden and no backgroundColor of its own.
  modalClose: {
    flexShrink: 0,
    width: 44, height: 44, borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 0.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center',
  },

  // Step bar
  stepBar: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 8,
  },
  stepDot: {
    height: 4, borderRadius: 2,
  },

  // Typography
  kicker: {
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 1.4,
  },
  sectionTitle: {
    fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 2,
  },

  // Card wrapper
  card: {
    backgroundColor: C.surface, borderRadius: 18, borderWidth: 0.5, borderColor: C.hairline, padding: 14,
  },

  // Scale buttons
  scaleSeg: {
    flex: 1, height: 26,
    borderRadius: 8, borderWidth: 0.5,
  },

  // Weather
  weatherChip: {
    paddingVertical: 18, borderRadius: 20, borderWidth: 0.5,
    alignItems: 'center', gap: 6,
  },
  weatherLabel: {
    fontSize: 15, fontWeight: '700',
  },

  // Activity
  activityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100, borderWidth: 0.5,
  },
  activityChipText: {
    fontSize: 13, fontWeight: '600', textTransform: 'capitalize',
  },

  // Would return
  returnBtn: {
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  returnBadge: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  returnBtnText: {
    fontSize: 16, fontWeight: '700',
  },

  // Visibility
  visRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13,
    borderRadius: 14, borderWidth: 1.5,
  },
  visIcon: {
    width: 38, height: 38, borderRadius: 11, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  visRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Companion
  companionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingLeft: 4, paddingRight: 8, paddingVertical: 4, borderRadius: 100,
  },
  companionInitial: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,251,241,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 14, padding: 13,
    borderWidth: 0.5, borderColor: C.hairline, marginBottom: 6,
  },
  searchInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: C.ink, padding: 0,
  },
  resultsBox: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
  },

  // Photos
  // No backgroundColor here — this style lands on a Reanimated.View, and
  // DynamicColorIOS values crash Reanimated. The Image itself covers the cell.
  // width/height are set inline per grid cell size — see PhotoStrip.
  photoThumb: {
    borderRadius: 14, overflow: 'hidden',
  },
  photoRemoveBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(20,17,12,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(20,17,12,0.6)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 100,
  },
  photoIndex: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(20,17,12,0.55)', width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  // width/height are set inline per grid cell size — see PhotoStrip.
  photoAdd: {
    borderRadius: 14,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.hairline,
    backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingVertical: 10,
  },
  photoReorderHint: {
    fontSize: 11.5, color: C.inkMute, marginTop: 8,
  },
  uploadProgressWrap: {
    marginTop: 10, gap: 6,
  },
  uploadProgressTrack: {
    height: 4, borderRadius: 2, backgroundColor: C.surfaceAlt, overflow: 'hidden',
  },
  uploadProgressFill: {
    height: 4, borderRadius: 2,
  },
  uploadProgressText: {
    fontSize: 11.5, color: C.inkMute,
  },

  // Photo crop modal
  cropBg: {
    flex: 1, backgroundColor: 'rgba(10,9,7,0.97)',
  },
  cropHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16,
  },
  cropIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,251,241,0.14)',
  },
  cropHeaderTitle: {
    fontSize: 12.5, fontWeight: '700', color: 'rgba(255,251,241,0.7)', letterSpacing: 1.3,
  },
  cropFrame: {
    borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,251,241,0.7)',
    backgroundColor: '#000',
  },
  cropFooter: {
    alignItems: 'center', gap: 14, paddingBottom: 48, paddingTop: 20,
  },
  ratioRow: {
    flexDirection: 'row', gap: 8,
  },
  ratioChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,251,241,0.3)',
    backgroundColor: 'rgba(255,251,241,0.08)',
  },
  ratioChipText: {
    fontSize: 13, fontWeight: '700', color: 'rgba(255,251,241,0.85)',
  },
  cropHint: {
    fontSize: 12.5, color: 'rgba(255,251,241,0.6)',
  },

  // Park picker
  pickerContainer: {
    flex: 1, backgroundColor: C.surface,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  pickerSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 12, backgroundColor: C.surfaceAlt, borderRadius: 12,
    padding: 10, borderWidth: 0.5, borderColor: C.hairline,
  },
  parkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    padding: 10, borderRadius: 10,
  },
  parkBadge: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Date sheet
  dateBackdrop: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  // Layout only — background/border/radius are applied inline with LITERAL
  // per-scheme colors. With the usual DynamicColorIOS tokens here, the
  // sheet's bottom region rendered semi-transparent (a gray band over the
  // backdrop) on iOS 17 and 26 alike, in and out of RN Modal — isolated by
  // stripping properties one at a time. Literals render clean.
  dateSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  dateSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },

  // Park banner
  parkBanner: {
    borderRadius: 16, borderWidth: 1.5, borderColor: C.hairline,
    padding: 16, marginBottom: 0,
    overflow: 'hidden',
  },

  // Text fields
  textField: {
    backgroundColor: C.surface, borderRadius: 14, padding: 13,
    fontSize: 15, color: C.ink, fontWeight: '600',
    borderWidth: 0.5, borderColor: C.hairline,
  },
  textArea: {
    minHeight: 120, textAlignVertical: 'top', fontWeight: '400',
  },
  charCountOutside: {
    alignSelf: 'flex-end', marginTop: 5,
    fontSize: 13, color: C.inkMute, fontWeight: '600', letterSpacing: 0.5,
  },

  // Activity autocomplete
  activitySuggestBox: {
    marginTop: 4,
    backgroundColor: C.surface,
    borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10,
    overflow: 'hidden',
  },
  activitySuggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  // Date rows
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
  },
  dateIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dateLabel: {
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 0.3,
  },
  dateValue: {
    fontSize: 15, fontWeight: '600', marginTop: 1,
  },

  // Footer — floats over the scroll content instead of docking in normal flow.
  footerFloat: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
  },
  footerFade: {
    position: 'absolute', left: 0, right: 0, top: -28, height: 28,
  },
  footer: {
    paddingHorizontal: 20, paddingTop: 10, gap: 12,
    backgroundColor: C.bg,
  },
  footerTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    width: 80, justifyContent: 'center',
  },
  progDot: {
    height: 6, borderRadius: 3,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 15, borderRadius: 14,
    width: '100%',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8, elevation: 4,
  },
});
