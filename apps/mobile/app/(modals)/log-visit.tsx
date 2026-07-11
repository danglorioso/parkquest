import {
  ActivityIndicator, Alert, Animated, DeviceEventEmitter, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, PanResponder, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, useColorScheme, useWindowDimensions,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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
import { STATIC as C, dyn, useColors } from '@/lib/palette';
import { ImageLightbox } from '@/components/ImageLightbox';
import { showToast } from '@/lib/toast';
import { loadRawDrafts, upsertRawDraft, deleteRawDraft, type SavedDraft as SharedSavedDraft } from '@/lib/drafts';
import { parkColor } from '@/lib/parkColors';
import { relTime } from '@/lib/dates';
import { getDefaultVisibility } from '@/lib/settings';

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
const ALL_ACTIVITIES= ['hiking','camping','backpacking','climbing','kayaking','rafting','fishing','diving','wildlife','photography','stargazing','tours','cycling','mountaineering'];
const RETURN_OPTS   = [
  { id: 'yes',   label: 'Definitely',   color: C.visited, icon: 'heart-outline' as const,  iconFilled: 'heart' as const },
  { id: 'maybe', label: 'Maybe',        color: C.bucket,  icon: 'repeat-outline' as const, iconFilled: 'repeat' as const },
  { id: 'no',    label: 'Probably not', color: C.inkMute, icon: 'cloud-outline' as const,  iconFilled: 'cloud' as const },
];
const STEPS = [
  'Where & when', 'Rating', 'Crowd', 'Difficulty', 'Weather', 'Would you return?', 'Journal', 'Share',
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

async function upsertDraft(d: Draft, parkName: string | undefined, id: string): Promise<void> {
  await upsertRawDraft<Draft>({ id, savedAt: new Date().toISOString(), parkName, draft: d });
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
          Touch x maps off the inner row's pageX, so the padding is pure slack. */}
      <View style={{ paddingVertical: 16, paddingHorizontal: 20 }} {...panResponder.panHandlers}>
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
    // track's own measured pageX.
    <View style={{ paddingHorizontal: 10, paddingVertical: 16 }} {...panResponder.panHandlers}>
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

  const toggle = (a: string) =>
    onChange(value.includes(a) ? value.filter(x => x !== a) : value.length < 8 ? [...value, a] : value);

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
            onPress={() => { Haptics.selectionAsync(); onChange(on ? null : o.id as Draft['wouldReturn']); }}
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
            key={o.v} onPress={() => onChange(o.v)} activeOpacity={0.7}
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

const PHOTO_THUMB = 124;
const PHOTO_GAP = 8;
const CROP_MAX_ZOOM = 4;
// Longest edge, px — matches the server's safety-net cap. Keeps what we upload (and
// pay to store in R2) close to what a feed/thumbnail ever actually displays.
const PHOTO_MAX_DIMENSION = 1600;

function PhotoCropModal({ uri, index, total, onCancel, onSkip, onDone }: {
  uri: string | null; index: number; total: number;
  onCancel: () => void; onSkip: () => void; onDone: (croppedUri: string) => void;
}) {
  const C = useColors();
  const FRAME = Math.min(Dimensions.get('window').width - 48, 320);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);
  const gesture = useRef({ startScale: 1, startTx: 0, startTy: 0, startDist: 0 }).current;

  useEffect(() => {
    if (!uri) return;
    setScale(1); setTx(0); setTy(0);
    Image.getSize(uri, (w, h) => setImgSize({ w, h }), () => setImgSize({ w: 1, h: 1 }));
  }, [uri]);

  const baseScale = imgSize ? Math.max(FRAME / imgSize.w, FRAME / imgSize.h) : 1;
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const clampPan = (nx: number, ny: number, s: number) => {
    if (!imgSize) return { x: nx, y: ny };
    const dw = imgSize.w * baseScale * s;
    const dh = imgSize.h * baseScale * s;
    const maxX = Math.max(0, (dw - FRAME) / 2);
    const maxY = Math.max(0, (dh - FRAME) / 2);
    return { x: clamp(nx, -maxX, maxX), y: clamp(ny, -maxY, maxY) };
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      gesture.startScale = scale;
      gesture.startTx = tx;
      gesture.startTy = ty;
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
        setScale(nextScale);
        const p = clampPan(gesture.startTx, gesture.startTy, nextScale);
        setTx(p.x); setTy(p.y);
      } else if (touches.length === 1) {
        const p = clampPan(gesture.startTx + gestureState.dx, gesture.startTy + gestureState.dy, scale);
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
      const left = (dw - FRAME) / 2 - tx;
      const top = (dh - FRAME) / 2 - ty;
      const cropSize = FRAME / totalScale;
      const cropX = clamp(left / totalScale, 0, Math.max(0, imgSize.w - cropSize));
      const cropY = clamp(top / totalScale, 0, Math.max(0, imgSize.h - cropSize));
      const actions: ImageManipulator.Action[] = [{ crop: {
        originX: cropX, originY: cropY,
        width: Math.min(cropSize, imgSize.w - cropX),
        height: Math.min(cropSize, imgSize.h - cropY),
      } }];
      // Cap the output — the crop region can still be huge on a high-res source photo.
      if (cropSize > PHOTO_MAX_DIMENSION) {
        actions.push({ resize: { width: PHOTO_MAX_DIMENSION, height: PHOTO_MAX_DIMENSION } });
      }
      const result = await ImageManipulator.manipulateAsync(
        uri,
        actions,
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
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
        <View style={styles.cropHeader}>
          <TouchableOpacity onPress={onCancel} hitSlop={8}>
            <Text style={styles.cropHeaderBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.cropHeaderTitle}>{total > 1 ? `Crop photo ${index + 1} of ${total}` : 'Crop photo'}</Text>
          <TouchableOpacity onPress={handleDone} disabled={busy} hitSlop={8}>
            {busy ? <ActivityIndicator size="small" color="#FFFBF1" /> : <Text style={[styles.cropHeaderBtn, { fontWeight: '800', color: C.accent }]}>Use Photo</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[styles.cropFrame, { width: FRAME, height: FRAME }]} {...panResponder.panHandlers}>
            {uri && imgSize && (
              <Image
                source={{ uri }}
                style={{
                  position: 'absolute',
                  width: imgSize.w * baseScale,
                  height: imgSize.h * baseScale,
                  left: (FRAME - imgSize.w * baseScale) / 2,
                  top: (FRAME - imgSize.h * baseScale) / 2,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale }],
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.cropFooter}>
          <Text style={styles.cropHint}>Pinch to zoom &middot; drag to reposition</Text>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={styles.cropSkip}>Use original, uncropped</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Draggable photo thumb ───────────────────────────────────────────────────

const PHOTO_CELL = PHOTO_THUMB + PHOTO_GAP;

function DraggablePhotoThumb({
  index, url, isCover, count, activeIndex, overIndex, onDragStart, onDragEnd, onPress, onRemove,
}: {
  index: number; url: string; isCover: boolean; count: number;
  activeIndex: SharedValue<number>; overIndex: SharedValue<number>;
  onDragStart: () => void;
  onDragEnd: (from: number, to: number) => void;
  onPress: () => void; onRemove: () => void;
}) {
  const C = useColors();
  const translateX = useSharedValue(0);

  // Gesture.Pan() is rebuilt fresh every render (not memoized), so it already closes
  // over the current `index` prop directly — no ref indirection needed here.
  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      translateX.value = 0;
      activeIndex.value = index;
      overIndex.value = index;
      runOnJS(onDragStart)();
    })
    .onUpdate(e => {
      translateX.value = e.translationX;
      const raw = index + Math.round(e.translationX / PHOTO_CELL);
      const clamped = Math.max(0, Math.min(count - 1, raw));
      if (clamped !== overIndex.value) overIndex.value = clamped;
    })
    .onEnd(() => {
      translateX.value = withSpring(0, { damping: 20, stiffness: 260 });
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
        transform: [{ translateX: translateX.value }, { scale: 1.06 }],
        zIndex: 10, shadowOpacity: 0.22,
      };
    }
    let shift = 0;
    if (activeIndex.value !== -1) {
      const a = activeIndex.value, t = overIndex.value;
      if (a < index && index <= t) shift = -1;
      else if (a > index && index >= t) shift = 1;
    }
    return {
      transform: [{ translateX: withTiming(shift * PHOTO_CELL, { duration: 160 }) }, { scale: 1 }],
      zIndex: 0, shadowOpacity: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View style={[styles.photoThumb, animStyle]}>
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

function PhotoStrip({ getToken, photos, onAdd, onRemove, onReorder }: {
  getToken: () => Promise<string | null>; photos: string[];
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onReorder: (next: string[]) => void;
}) {
  const C = useColors();
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const uploading = uploadProgress.total > 0;
  const [cropQueue, setCropQueue] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [cropDone, setCropDone] = useState<{ uri: string; mimeType?: string; fileName?: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const activeIndex = useSharedValue(-1);
  const overIndex = useSharedValue(-1);

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
        const fileRes = await fetch(item.uri);
        const blob = await fileRes.blob();
        // Posts the (already client-resized) bytes straight to our server, which does
        // a safety-net resize/recompress before writing to R2 — see /api/upload.
        const { publicUrl } = await apiFetch<{ publicUrl: string }>('/api/upload', tok, {
          method: 'POST',
          headers: { 'Content-Type': item.mimeType ?? 'image/jpeg' },
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

  const advanceCrop = (finalUri: string) => {
    const asset = cropQueue[0];
    const nextDone = [...cropDone, { uri: finalUri, mimeType: 'image/jpeg', fileName: asset.fileName ?? 'photo.jpg' }];
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

  const skipCrop = async () => {
    const asset = cropQueue[0];
    const longestEdge = Math.max(asset.width, asset.height);
    // width/height can come back 0 if the system didn't report them — treat that as
    // "unknown" (needs the resize pass) rather than "already small enough".
    if (longestEdge > 0 && longestEdge <= PHOTO_MAX_DIMENSION) { advanceCrop(asset.uri); return; }
    try {
      // Uncropped photos still need the resize pass — a picked-but-not-cropped
      // photo can be full sensor resolution otherwise.
      const resizeAction: ImageManipulator.Action = asset.width >= asset.height
        ? { resize: { width: PHOTO_MAX_DIMENSION } }
        : { resize: { height: PHOTO_MAX_DIMENSION } };
      const result = await ImageManipulator.manipulateAsync(
        asset.uri, [resizeAction], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      advanceCrop(result.uri);
    } catch (e) {
      console.warn('Resize failed, using original photo:', e);
      advanceCrop(asset.uri);
    }
  };
  const cancelCrops = () => { setCropQueue([]); setCropDone([]); };

  const handleReorder = (from: number, to: number) => {
    setScrollEnabled(true);
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
        onSkip={skipCrop}
        onDone={advanceCrop}
      />
      {lightboxIndex !== null && (
        <ImageLightbox
          images={photos.map(url => ({ url }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ gap: PHOTO_GAP, paddingBottom: 4, paddingHorizontal: 2 }}
      >
        {photos.map((url, idx) => (
          <DraggablePhotoThumb
            key={url}
            index={idx} url={url} isCover={idx === 0} count={photos.length}
            activeIndex={activeIndex} overIndex={overIndex}
            onDragStart={() => setScrollEnabled(false)}
            onDragEnd={handleReorder}
            onPress={() => setLightboxIndex(idx)}
            onRemove={() => onRemove(url)}
          />
        ))}
        {photos.length < 10 && (
          <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={styles.photoAdd} activeOpacity={0.7}>
            <Ionicons name={uploading ? 'hourglass' : 'add'} size={24} color={C.primary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.primary, marginTop: 4 }}>
              {uploading ? 'Uploading…' : 'Add photos'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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

// ── Calendar date-range sheet ─────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['S','M','T','W','T','F','S'];

function stripTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && stripTime(a) === stripTime(b);
}

function CalendarSheet({ visible, start, end, maxDate, onApply, onClose }: {
  visible: boolean;
  start: Date | null;
  end: Date | null;
  maxDate: Date;
  onApply: (start: Date | null, end: Date | null) => void;
  onClose: () => void;
}) {
  const C = useColors();
  const [selStart, setSelStart] = useState<Date | null>(start);
  const [selEnd,   setSelEnd]   = useState<Date | null>(end);
  const [view, setView] = useState(() => {
    const d = start ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // Slide only the sheet; the modal itself fades so the backdrop doesn't ride up
  const slide = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      setSelStart(start);
      setSelEnd(end);
      const d = start ?? new Date();
      setView(new Date(d.getFullYear(), d.getMonth(), 1));
      setMonthPickerOpen(false);
      slide.setValue(400);
      Animated.spring(slide, {
        toValue: 0, useNativeDriver: true,
        damping: 26, mass: 0.8, stiffness: 220,
      }).start();
    }
  }, [visible, start, end, slide]);

  // Same range logic as web: 1st tap = start, 2nd tap (>= start) = end
  const pick = (d: Date) => {
    if (!selStart || (selStart && selEnd)) { setSelStart(d); setSelEnd(null); return; }
    if (stripTime(d) < stripTime(selStart)) { setSelStart(d); setSelEnd(null); return; }
    setSelEnd(d);
  };

  const today = new Date();

  // Same quick-select chips as web: Today, This weekend
  const applyToday = () => {
    setSelStart(today);
    setSelEnd(null);
    setView(new Date(today.getFullYear(), today.getMonth(), 1));
  };
  const applyThisWeekend = () => {
    const sat = new Date(today);
    sat.setDate(today.getDate() + (6 - today.getDay()));
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    setSelStart(sat);
    setSelEnd(sun);
    setView(new Date(sat.getFullYear(), sat.getMonth(), 1));
  };
  const rangeBg = 'rgba(31,61,46,0.13)';

  const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.dateBackdrop} onPress={onClose} />
      <Animated.View style={[styles.dateSheet, { transform: [{ translateY: slide }] }]}>
        <View style={styles.dateSheetHeader}>
          <TouchableOpacity onPress={() => {
            if (selStart || selEnd) { setSelStart(null); setSelEnd(null); }
            else onClose();
          }}>
            <Text style={{ fontSize: 16, color: C.inkMute }}>{selStart || selEnd ? 'Clear' : 'Cancel'}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>Dates</Text>
          <TouchableOpacity onPress={() => { onApply(selStart, selEnd); onClose(); }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.primary }}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 16 }}>
          {/* Quick-select chips */}
          <View style={styles.calChipsRow}>
            <TouchableOpacity style={styles.calChip} onPress={applyToday}>
              <Text style={styles.calChipText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calChip} onPress={applyThisWeekend}>
              <Text style={styles.calChipText}>This weekend</Text>
            </TouchableOpacity>
          </View>

          {/* Month / year navigation */}
          <View style={styles.calNavRow}>
            <TouchableOpacity
              style={styles.calNavBtn}
              onPress={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
            >
              <Ionicons name="chevron-back" size={15} color={C.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calMonthLabel}
              onPress={() => setMonthPickerOpen(o => !o)}
              activeOpacity={0.7}
            >
              <Text style={{ fontWeight: '700', fontSize: 15, color: C.ink }}>
                {MONTHS[view.getMonth()]} {view.getFullYear()}
              </Text>
              <Ionicons name={monthPickerOpen ? 'chevron-up' : 'chevron-down'} size={13} color={C.inkMute} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calNavBtn}
              onPress={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
            >
              <Ionicons name="chevron-forward" size={15} color={C.inkSoft} />
            </TouchableOpacity>
          </View>

          {monthPickerOpen ? (
            /* Month + year picker */
            <View>
              <View style={[styles.calNavRow, { marginTop: 12 }]}>
                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => setView(v => new Date(v.getFullYear() - 1, v.getMonth(), 1))}
                >
                  <Ionicons name="chevron-back" size={15} color={C.inkSoft} />
                </TouchableOpacity>
                <Text style={{ fontWeight: '700', fontSize: 15, color: C.ink }}>{view.getFullYear()}</Text>
                <TouchableOpacity
                  style={[styles.calNavBtn, view.getFullYear() >= today.getFullYear() && { opacity: 0.3 }]}
                  disabled={view.getFullYear() >= today.getFullYear()}
                  onPress={() => setView(v => new Date(v.getFullYear() + 1, v.getMonth(), 1))}
                >
                  <Ionicons name="chevron-forward" size={15} color={C.inkSoft} />
                </TouchableOpacity>
              </View>
              <View style={styles.calMonthGrid}>
                {MONTHS_ABBR.map((m, i) => {
                  const isFuture = view.getFullYear() === today.getFullYear() && i > today.getMonth();
                  const isViewMonth = i === view.getMonth();
                  return (
                    <TouchableOpacity
                      key={m}
                      disabled={isFuture}
                      onPress={() => { setView(new Date(view.getFullYear(), i, 1)); setMonthPickerOpen(false); }}
                      style={[styles.calMonthCell, isViewMonth && { backgroundColor: C.primary }]}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: isViewMonth ? '700' : '500',
                        color: isViewMonth ? C.onPrimary : isFuture ? 'rgba(122,116,106,0.4)' : C.inkSoft,
                      }}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            /* Day grid */
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row' }}>
                {DOW.map((d, i) => (
                  <Text key={i} style={styles.calDow}>{d}</Text>
                ))}
              </View>
              {weeks.map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'row' }}>
                  {week.map((d, di) => {
                    if (!d) return <View key={di} style={styles.calCell} />;
                    const isStart    = sameDay(d, selStart);
                    const isEnd      = selEnd ? sameDay(d, selEnd) : false;
                    const endpoint   = isStart || isEnd;
                    const mid        = !!(selStart && selEnd && stripTime(d) > stripTime(selStart) && stripTime(d) < stripTime(selEnd));
                    const isToday    = sameDay(d, today);
                    const disabled   = stripTime(d) > stripTime(maxDate);
                    const isRowStart = di === 0;
                    const isRowEnd   = di === 6;
                    return (
                      <View key={di} style={styles.calCell}>
                        {/* Range background — pill strip, rounded at row edges and endpoints */}
                        {mid && (
                          <View style={{
                            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                            backgroundColor: rangeBg,
                            borderTopLeftRadius:     isRowStart ? 999 : 0,
                            borderBottomLeftRadius:  isRowStart ? 999 : 0,
                            borderTopRightRadius:    isRowEnd   ? 999 : 0,
                            borderBottomRightRadius: isRowEnd   ? 999 : 0,
                          }} />
                        )}
                        {isStart && selEnd && !isEnd && (
                          <View style={{
                            position: 'absolute', top: 0, bottom: 0, right: 0, left: '50%',
                            backgroundColor: rangeBg,
                            borderTopRightRadius:    isRowEnd ? 999 : 0,
                            borderBottomRightRadius: isRowEnd ? 999 : 0,
                          }} />
                        )}
                        {isEnd && !isStart && (
                          <View style={{
                            position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%',
                            backgroundColor: rangeBg,
                            borderTopLeftRadius:    isRowStart ? 999 : 0,
                            borderBottomLeftRadius: isRowStart ? 999 : 0,
                          }} />
                        )}
                        <TouchableOpacity
                          disabled={disabled}
                          onPress={() => pick(d)}
                          style={[
                            styles.calDayBtn,
                            endpoint && { backgroundColor: C.primary },
                            isToday && !endpoint && !mid && { borderWidth: 1.5, borderColor: 'rgba(31,61,46,0.4)' },
                          ]}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: endpoint ? '800' : mid ? '700' : '400',
                            color: endpoint ? C.onPrimary : disabled ? 'rgba(122,116,106,0.35)' : mid ? C.primary : C.ink,
                          }}>{d.getDate()}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
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
    <View style={{ flex: 1, minHeight: Math.min(440, winH * 0.55), justifyContent: 'center', alignItems: 'center' }}>
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

function StepWhere({ draft, set, parks, onPickPark }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  parks: ParkInfo[]; onPickPark: () => void;
}) {
  const C = useColors();
  const park = parks.find(p => p.park_code === draft.parkCode);
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();

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
      <CalendarSheet
        visible={showCalendar}
        start={draft.startDate}
        end={draft.endDate}
        maxDate={today}
        onApply={(s, e) => { set('startDate', s); set('endDate', e); }}
        onClose={() => setShowCalendar(false)}
      />

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

      {/* Rest locked until park selected */}
      <Reanimated.View
        entering={FadeInDown.delay(160).duration(360)}
        style={unlockedStyle}
        pointerEvents={park ? 'auto' : 'none'}
      >
        <Section title="Trip title" mb={28}>
          <TextInput
            value={draft.title} onChangeText={v => set('title', v.slice(0, 80))}
            placeholder="Give this trip a name" placeholderTextColor={C.inkMute}
            style={styles.textField}
          />
        </Section>

        <Section title="Dates" tag="required" mb={0}>
          <View style={[styles.card, { paddingVertical: 4 }]}>
            <PressableScale
              onPress={() => setShowCalendar(true)}
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
              onPress={() => setShowCalendar(true)}
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

function StepDifficulty({ draft, set, onSliderDragChange }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onSliderDragChange?: (dragging: boolean) => void;
}) {
  const v = draft.difficulty;
  return (
    <HeroSlide
      emoji={v > 0 ? DIFF_EMOJI[v - 1] : '🥾'}
      title="How tough was the trail?"
      subtitle={v > 0 ? DIFF_LABELS[v - 1] : 'Drag or tap to set'}
    >
      <ScaleRow value={v} onChange={x => set('difficulty', x)} labels={DIFF_LABELS} onDragChange={onSliderDragChange} />
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

function StepJournal({ draft, set, token, getToken, npsActivityNames, originalPhotos }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; token: string;
  getToken: () => Promise<string | null>;
  npsActivityNames: string[];
  originalPhotos: Set<string>;
}) {
  const C = useColors();
  return (
    <View>
      <Reanimated.View entering={FadeInDown.duration(360)} style={{ marginBottom: 24 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Journal & photos</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(80).duration(360)}>
        <Section title="Photos" hint={`${draft.photos.length} of 10`}>
          <PhotoStrip
            getToken={getToken} photos={draft.photos}
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
        </Section>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.delay(160).duration(360)}>
        <Section title="Highlight">
          <TextInput
            value={draft.highlight} onChangeText={v => set('highlight', v.slice(0, 90))}
            placeholder="The one moment you'll remember" placeholderTextColor={C.inkMute}
            style={[styles.textField, { marginBottom: 0 }]}
          />
          <Text style={styles.charCountOutside}>{draft.highlight.length}/90</Text>
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

      <Reanimated.View entering={FadeInDown.delay(400).duration(360)}>
        <Section title="Who came along?">
          <CompanionSearch
            companions={draft.companions} companionObjs={draft.companionObjs}
            onChange={(ids, objs) => { set('companions', ids); set('companionObjs', objs); }}
            token={token}
          />
        </Section>
      </Reanimated.View>
    </View>
  );
}

// Mirrors the (unexported) label/icon maps PostCard.tsx uses to render a real
// feed post, so this preview matches what the post will actually look like.
const PREVIEW_WEATHER_LABELS: Record<string, string> = {
  clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy',
  rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Fog', wind: 'Windy',
};
const PREVIEW_WEATHER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny-outline', partly: 'partly-sunny-outline', cloudy: 'cloud-outline',
  rain: 'rainy-outline', storm: 'thunderstorm-outline', snow: 'snow-outline',
  fog: 'water-outline', wind: 'speedometer-outline',
};
const PREVIEW_ACTIVITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  hiking: 'walk-outline', camping: 'bonfire-outline', backpacking: 'walk-outline',
  climbing: 'trending-up-outline', kayaking: 'boat-outline', rafting: 'boat-outline',
  fishing: 'fish-outline', diving: 'water-outline', wildlife: 'paw-outline',
  photography: 'camera-outline', stargazing: 'moon-outline', tours: 'map-outline',
  cycling: 'bicycle-outline', mountaineering: 'trending-up-outline',
};
const PREVIEW_VIS_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  public: 'globe-outline', friends: 'people-outline', private: 'lock-closed-outline',
};

function PreviewChip({ icon, children }: { icon?: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.previewChip}>
      {icon && <Ionicons name={icon} size={11} color={C.inkSoft} />}
      {typeof children === 'string' ? <Text style={styles.previewChipText}>{children}</Text> : children}
    </View>
  );
}

function VisitPreview({ draft, park, userName, username, avatarUrl }: {
  draft: Draft; park: ParkInfo | undefined; userName: string; username?: string | null; avatarUrl?: string | null;
}) {
  const C = useColors();
  const visIcon = PREVIEW_VIS_ICONS[draft.visibility.toLowerCase()] ?? PREVIEW_VIS_ICONS.friends;
  const selectedWeather = WEATHER_OPTS.filter(w => draft.weather.includes(w.id));
  const hasPhotos = draft.photos.length > 0;
  const coverUrl = draft.photos[0] ?? null;
  const dateLabel = draft.startDate ? fmtDate(draft.startDate) : null;

  const hasMeta = draft.rating > 0 || (hasPhotos && !!dateLabel) || selectedWeather.length > 0 ||
    draft.crowd > 0 || draft.difficulty > 0 || draft.activities.length > 0 ||
    draft.companionObjs.length > 0 || !!draft.highlight;

  return (
    <View style={styles.previewCard}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingTop: 13, paddingBottom: 9 }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 38, height: 38, borderRadius: 19 }} />
        ) : (
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.onPrimary, fontWeight: '800', fontSize: 14 }}>{userName[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }} numberOfLines={1}>{userName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
            <Text style={{ fontSize: 13, color: C.inkMute }} numberOfLines={1}>
              {username ? `@${username} · ` : ''}now
            </Text>
            <Ionicons name={visIcon} size={10.5} color={C.inkMute} style={{ opacity: 0.75 }} />
          </View>
        </View>
      </View>

      {/* Park chip — only shown alongside photos, like the real card (no-photo posts show the park in the hero banner instead) */}
      {park && hasPhotos && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, paddingBottom: 9 }}>
          <Ionicons name="location-sharp" size={11} color={C.primary} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, color: C.primary }}>{park.name.toUpperCase()}</Text>
        </View>
      )}

      {/* Caption */}
      {draft.caption ? (
        <Text style={{ paddingHorizontal: 13, paddingBottom: 10, fontSize: 14.5, color: C.ink, lineHeight: 20 }}>
          {draft.caption.length > 200 ? `${draft.caption.slice(0, 200)}…` : draft.caption}
        </Text>
      ) : null}

      {/* Visit metadata */}
      {hasMeta && (
        <View style={{ paddingHorizontal: 13, paddingBottom: 11, gap: 8 }}>
          {draft.highlight ? (
            <Text style={{ fontSize: 13, color: C.inkSoft, fontStyle: 'italic', lineHeight: 18 }}>"{draft.highlight}"</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {draft.rating > 0 && (
              <PreviewChip>
                <Text style={styles.previewChipText}>
                  <Text style={{ color: '#C49A28' }}>★ </Text>
                  {draft.rating % 1 === 0 ? draft.rating.toFixed(0) : draft.rating.toFixed(1)}
                </Text>
              </PreviewChip>
            )}
            {hasPhotos && dateLabel ? <PreviewChip icon="calendar-outline">{dateLabel}</PreviewChip> : null}
            {selectedWeather.map(w => (
              <PreviewChip key={w.id} icon={PREVIEW_WEATHER_ICONS[w.id] ?? 'cloudy-outline'}>
                {PREVIEW_WEATHER_LABELS[w.id] ?? w.label}
              </PreviewChip>
            ))}
            {draft.crowd > 0 && <PreviewChip icon="people-outline">{CROWD_LABELS[draft.crowd - 1]}</PreviewChip>}
            {draft.difficulty > 0 && <PreviewChip icon="trail-sign-outline">{DIFF_LABELS[draft.difficulty - 1]}</PreviewChip>}
            {draft.activities.map(a => (
              <PreviewChip key={a} icon={PREVIEW_ACTIVITY_ICONS[a] ?? 'star-outline'}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </PreviewChip>
            ))}
            {draft.companionObjs.length > 0 && (() => {
              const MAX = 2;
              const shown = draft.companionObjs.slice(0, MAX);
              const extra = draft.companionObjs.length - MAX;
              return (
                <PreviewChip icon="people-outline">
                  {`With ${shown.map(c => c.display_name ?? `@${c.username}`).join(', ')}${extra > 0 ? `, +${extra} more` : ''}`}
                </PreviewChip>
              );
            })()}
          </View>
        </View>
      )}

      {/* Photo carousel — or a park hero banner when there are no photos yet */}
      {hasPhotos ? (
        <View>
          <Image source={{ uri: coverUrl! }} style={{ width: '100%', height: 210 }} resizeMode="cover" />
          {draft.photos.length > 1 && (
            <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(20,17,12,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 }}>
              <Text style={{ color: '#FFFBF1', fontSize: 12, fontWeight: '500' }}>1 / {draft.photos.length}</Text>
            </View>
          )}
          {draft.photos.length > 1 && (
            <View style={{ position: 'absolute', bottom: 10, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
              {draft.photos.map((_, i) => (
                <View key={i} style={{
                  height: 6, borderRadius: 3, width: i === 0 ? 22 : 6,
                  backgroundColor: i === 0 ? '#FFFBF1' : 'rgba(255,251,241,0.5)',
                }} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ paddingHorizontal: 13, paddingBottom: 13 }}>
          <View style={{ borderRadius: 14, overflow: 'hidden', height: 150, justifyContent: 'flex-end' }}>
            {park?.image_url ? (
              <Image source={{ uri: park.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: parkColor(draft.parkCode || 'ZZZZ') }]} />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
              locations={[0.25, 0.6, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.3 }} numberOfLines={2}>
                {park?.name ?? 'National Park'}
              </Text>
              {dateLabel && (
                <Text style={{ fontSize: 12.5, color: 'rgba(255,251,241,0.70)', marginTop: 3, fontWeight: '500' }}>{dateLabel}</Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Action row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: C.hairlineSoft }}>
        <Ionicons name="heart-outline" size={19} color={C.inkSoft} />
        <Ionicons name="chatbubble-outline" size={17} color={C.inkSoft} />
        <Ionicons name="share-outline" size={17} color={C.inkSoft} />
      </View>
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
  const [restoreBanner, setRestoreBanner] = useState<SavedDraft | null>(null);
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
  const activeSliderDrags = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const isDragStep = (s: number) => s >= 1 && s <= 3;
  // Also freezes the step ScrollView while a slider drag is live — a slightly
  // off-horizontal swipe on a slider was scrolling the content vertically.
  const [controlDragging, setControlDragging] = useState(false);
  const setSliderDragging = useCallback((dragging: boolean) => {
    activeSliderDrags.current = Math.max(0, activeSliderDrags.current + (dragging ? 1 : -1));
    setControlDragging(activeSliderDrags.current > 0);
    navigation.setOptions({ gestureEnabled: activeSliderDrags.current === 0 && !isDragStep(stepRef.current) });
  }, [navigation]);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !isDragStep(step) && activeSliderDrags.current === 0 });
  }, [step, navigation]);

  useEffect(() => {
    if (isEdit) return;
    loadDrafts().then(d => { if (d.length > 0) setRestoreBanner(d[0]); });
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
      upsertDraft(draft, parkName, draftId.current);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draft, parks, isEdit]);

  // Catches dismissal we didn't initiate ourselves — the native swipe-down-to-dismiss
  // gesture on this pageSheet, or the Android back button — and flushes the draft
  // immediately instead of waiting on the debounce, with a toast to confirm it stuck.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (leavingViaAction.current || isEdit || !draftHasContent(draft)) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
      upsertDraft(draft, parkName, draftId.current);
      showToast('Draft saved');
    });
    return unsub;
  }, [navigation, draft, parks, isEdit]);

  const resumeDraft = () => {
    if (!restoreBanner) return;
    setDraftState(restoreBanner.draft);
    draftId.current = restoreBanner.id;
    setRestoreBanner(null);
  };

  const discardSavedDraft = () => {
    if (!restoreBanner) return;
    deleteDraft(restoreBanner.id);
    getFreshToken().then(tok => deletePhotos(restoreBanner.draft.photos, tok));
    setRestoreBanner(null);
  };

  useEffect(() => {
    getFreshToken().then(tok => {
      if (tok) {
        apiFetch<ParkInfo[]>('/api/parks', tok).then(setParks).catch(() => {});
      }
    });
  }, [getFreshToken]);

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
    if (isEdit) {
      Alert.alert('Discard changes?', "Your edits won't be saved.", [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard', style: 'destructive',
          onPress: () => {
            // Photos already on the saved visit stay put — only clean up ones added this session.
            const orphaned = draft.photos.filter(p => !originalPhotos.current.has(p));
            getFreshToken().then(tok => deletePhotos(orphaned, tok));
            leavingViaAction.current = true;
            router.back();
          },
        },
      ]);
      return;
    }
    if (draftHasContent(draft)) {
      Alert.alert('Save as draft?', 'Pick up where you left off next time.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            deleteDraft(draftId.current);
            getFreshToken().then(tok => deletePhotos(draft.photos, tok));
            leavingViaAction.current = true;
            router.back();
          },
        },
        {
          text: 'Save draft',
          onPress: () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
            upsertDraft(draft, parkName, draftId.current);
            leavingViaAction.current = true;
            router.back();
          },
        },
      ]);
    } else {
      leavingViaAction.current = true;
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!draft.parkCode || !draft.startDate) return;
    setSubmitting(true);
    try {
      // Fetch a fresh token right here rather than reusing the one from mount —
      // this flow can easily run past a Clerk session token's ~60s lifetime.
      const tok = await getFreshToken();
      if (!tok) throw new Error('No auth token');

      if (isEdit) {
        await apiFetch(`/api/visits/${editVisitId}`, tok, {
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
          }),
        });
        if (editPostId != null) {
          await apiFetch(`/api/posts/${editPostId}`, tok, {
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Visit logged!');
      leavingViaAction.current = true;
      router.back();
    } catch (e) {
      if (e instanceof Error && e.message.includes('409')) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Park already logged', 'You already have a visit for that park. Edit that visit instead.');
      } else {
        // Post didn't go through — make sure the latest edits are saved as a draft so nothing is lost.
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
        upsertDraft(draft, parkName, draftId.current);
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
      {/* Header: grabber + title on left, close centered on right */}
      <View style={styles.modalTopRow}>
        <View style={{ flex: 1 }}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View style={styles.grabber} />
          </View>
          <Text style={styles.modalTitle}>{isEdit ? 'Edit visit' : 'Log a visit'}</Text>
        </View>
        <TouchableOpacity onPress={handleCancel} style={styles.modalClose} hitSlop={8}>
          <Ionicons name="close" size={16} color={C.inkSoft} />
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
        {step === 0 && restoreBanner && restoreBanner.id !== draftId.current && (
          <View style={styles.draftBanner}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.draftBannerTitle}>You have a saved draft</Text>
              <Text style={styles.draftBannerSub} numberOfLines={1}>
                {restoreBanner.parkName ?? 'No park selected'}
                {restoreBanner.draft.title ? ` — ${restoreBanner.draft.title}` : ''}
              </Text>
              <Text style={styles.draftBannerAge}>{draftAge(restoreBanner.savedAt)}</Text>
            </View>
            <TouchableOpacity onPress={resumeDraft} style={[styles.draftResumeBtn, { backgroundColor: C.primary }]} activeOpacity={0.8}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.onPrimary }}>Restore</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={discardSavedDraft} hitSlop={6} style={styles.draftDiscardBtn} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={C.inkMute} />
            </TouchableOpacity>
          </View>
        )}
        {editLoading && (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.inkMute} />
          </View>
        )}
        {!editLoading && step === 0 && (
          <StepWhere draft={draft} set={set} parks={parks} onPickPark={() => setShowPicker(true)} />
        )}
        {step === 1 && <StepRating draft={draft} set={set} onSliderDragChange={setSliderDragging} />}
        {step === 2 && <StepCrowd draft={draft} set={set} onSliderDragChange={setSliderDragging} />}
        {step === 3 && <StepDifficulty draft={draft} set={set} onSliderDragChange={setSliderDragging} />}
        {step === 4 && <StepWeather draft={draft} set={set} />}
        {step === 5 && <StepWouldReturn draft={draft} set={set} />}
        {step === 6 && token && <StepJournal draft={draft} set={set} token={token} getToken={getFreshToken} npsActivityNames={npsActivityNames} originalPhotos={originalPhotos.current} />}
        {step === 7 && (
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
                <Ionicons name="chevron-back" size={15} color={C.ink} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>Back</Text>
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
                <Text style={{ fontSize: 15, fontWeight: '800', color: canContinue ? C.onPrimary : C.inkMute }}>
                  {isLast ? (submitting ? 'Saving…' : isEdit ? 'Save' : 'Post') : 'Continue'}
                </Text>
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
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Draft restore banner
  draftBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(31,61,46,0.07)',
    borderWidth: 0.5, borderColor: 'rgba(31,61,46,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 20,
  },
  draftBannerTitle: {
    fontSize: 13, fontWeight: '700', color: C.ink,
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
  modalClose: {
    flexShrink: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.surfaceAlt,
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
    backgroundColor: C.surface, borderRadius: 12, padding: 10,
    borderWidth: 0.5, borderColor: C.hairline, marginBottom: 6,
  },
  searchInput: {
    flex: 1, fontSize: 13.5, color: C.ink, padding: 0,
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
  photoThumb: {
    width: PHOTO_THUMB, height: PHOTO_THUMB, borderRadius: 14, overflow: 'hidden',
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
  photoAdd: {
    width: PHOTO_THUMB, height: PHOTO_THUMB, borderRadius: 14,
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
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  cropHeaderBtn: {
    fontSize: 15, fontWeight: '600', color: '#FFFBF1',
  },
  cropHeaderTitle: {
    fontSize: 14, fontWeight: '700', color: 'rgba(255,251,241,0.85)',
  },
  cropFrame: {
    borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,251,241,0.7)',
    backgroundColor: '#000',
  },
  cropFooter: {
    alignItems: 'center', gap: 14, paddingBottom: 48, paddingTop: 20,
  },
  cropHint: {
    fontSize: 12.5, color: 'rgba(255,251,241,0.6)',
  },
  cropSkip: {
    fontSize: 13.5, fontWeight: '600', color: 'rgba(255,251,241,0.85)', textDecorationLine: 'underline',
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

  // Date picker
  dateBackdrop: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dateSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingBottom: 40,
  },
  dateSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },

  // Calendar
  calChipsRow: {
    flexDirection: 'row', gap: 6, marginBottom: 12,
  },
  calChip: {
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5,
  },
  calChipText: {
    fontSize: 12, fontWeight: '600', color: C.inkSoft,
  },
  calNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  calNavBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  calMonthLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  calMonthGrid: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: 12,
  },
  calMonthCell: {
    width: '25%', paddingVertical: 11, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  calDow: {
    flex: 1, textAlign: 'center',
    fontSize: 13, fontWeight: '600', color: C.inkMute,
    paddingVertical: 4,
  },
  calCell: {
    flex: 1, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  calDayBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
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

  // Post preview
  previewCard: {
    backgroundColor: C.surface,
    borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 18,
    overflow: 'hidden',
  },
  previewChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.surfaceAlt,
    borderRadius: 100, borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  previewChipText: {
    fontWeight: '600', fontSize: 13, color: C.inkSoft,
    textTransform: 'capitalize',
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
