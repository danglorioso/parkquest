import {
  ActivityIndicator, Alert, Animated, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { fullStateName } from '@/lib/stateNames';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#F2EBDB',
  surface:    '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:        '#1B1A16',
  inkSoft:    '#3C3A33',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  hairlineSoft:'rgba(27,26,22,0.06)',
  primary:    '#1F3D2E',
  accent:     '#C56B3D',
  visited:    '#2F7A4A',
  bucket:     '#D89A3A',
};

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
  cover:     string | null;
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
const STEPS = ['Where & when', 'The visit', 'Journal', 'Share'];
const STAR_SIZE = 36;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlank(): Draft {
  return {
    parkCode: '', startDate: null, endDate: null, title: '',
    rating: 0, crowd: 0, difficulty: 0, weather: [], wouldReturn: null,
    highlight: '', notes: '', activities: [], companions: [], companionObjs: [],
    photos: [], cover: null, visibility: 'Friends', caption: '',
  };
}

// ── Draft persistence ─────────────────────────────────────────────────────────

const DRAFT_KEY = 'pq-visit-drafts';
const MAX_DRAFTS = 5;

interface SavedDraft {
  id: string;
  savedAt: string; // ISO
  parkName?: string;
  draft: Draft;
}

function draftHasContent(d: Draft): boolean {
  return !!(d.parkCode || d.title || d.notes || d.highlight ||
    d.activities.length || d.photos.length || d.rating || d.startDate);
}

async function loadDrafts(): Promise<SavedDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDraft[];
    // Rehydrate date objects
    return parsed.map(sd => ({
      ...sd,
      draft: {
        ...sd.draft,
        startDate: sd.draft.startDate ? new Date(sd.draft.startDate as unknown as string) : null,
        endDate:   sd.draft.endDate   ? new Date(sd.draft.endDate   as unknown as string) : null,
      },
    }));
  } catch { return []; }
}

async function upsertDraft(d: Draft, parkName: string | undefined, id: string): Promise<void> {
  try {
    const saved: SavedDraft = { id, savedAt: new Date().toISOString(), parkName, draft: d };
    const rest = (await loadDrafts()).filter(s => s.id !== id);
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify([saved, ...rest].slice(0, MAX_DRAFTS)));
  } catch { /* ignore */ }
}

async function deleteDraft(id: string): Promise<void> {
  try {
    const rest = (await loadDrafts()).filter(s => s.id !== id);
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
  } catch { /* ignore */ }
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

// ── StarRating ────────────────────────────────────────────────────────────────

const HALF_LABELS: Record<number, string> = {
  0:'', 0.5:'Not great', 1:'Rough', 1.5:'Below avg',
  2:'Meh', 2.5:'Decent', 3:'Good', 3.5:'Really good',
  4:'Great', 4.5:'Amazing', 5:'Unreal',
};

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={{ width: STAR_SIZE, height: STAR_SIZE }}>
            <Ionicons
              name={value >= i + 1 ? 'star' : value >= i + 0.5 ? 'star-half' : 'star-outline'}
              size={STAR_SIZE}
              color={value >= i + 0.5 ? C.accent : 'rgba(27,26,22,0.28)'}
            />
            {/* Invisible half-star tap targets */}
            <View style={[StyleSheet.absoluteFillObject as object, { flexDirection: 'row' }]}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => onChange(value === i + 0.5 ? 0 : i + 0.5)}
                activeOpacity={0.6}
              />
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => onChange(value === i + 1 ? 0 : i + 1)}
                activeOpacity={0.6}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, minHeight: 22 }}>
        {value > 0 ? (
          <>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.4 }}>{value}</Text>
            <Text style={{ fontSize: 12, color: C.inkMute, fontWeight: '600' }}>/ 5</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent }}>{HALF_LABELS[value]}</Text>
          </>
        ) : (
          <Text style={{ fontSize: 12.5, color: C.inkMute }}>Tap a star to rate</Text>
        )}
      </View>
    </View>
  );
}

// ── ScaleRow ──────────────────────────────────────────────────────────────────

function ScaleRow({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: string[] }) {
  return (
    <View>
      {/* Segmented track — fills up to the selected level */}
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {labels.map((l, i) => {
          const filled = value >= i + 1;
          const isSel  = value === i + 1;
          return (
            <TouchableOpacity
              key={l}
              onPress={() => onChange(isSel ? 0 : i + 1)}
              style={[styles.scaleSeg, {
                backgroundColor: filled ? C.primary : C.surfaceAlt,
                borderColor: filled ? C.primary : C.hairline,
                opacity: filled && !isSel ? 0.55 : 1,
              }]}
              activeOpacity={0.7}
            />
          );
        })}
      </View>
      <Text style={{ marginTop: 7, fontSize: 12, fontWeight: '600', color: value > 0 ? C.primary : C.inkMute }}>
        {value > 0 ? labels[value - 1] : 'Tap to set'}
      </Text>
    </View>
  );
}

// ── WeatherGrid ───────────────────────────────────────────────────────────────

function WeatherGrid({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(w => w !== id) : [...value, id]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {WEATHER_OPTS.map(w => {
        const on = value.includes(w.id);
        return (
          <TouchableOpacity
            key={w.id} onPress={() => toggle(w.id)} activeOpacity={0.7}
            style={[styles.weatherChip, { backgroundColor: on ? C.primary : C.surfaceAlt, borderColor: on ? C.primary : C.hairline }]}
          >
            <Text style={{ fontSize: 18, lineHeight: 22 }}>{w.emoji}</Text>
            <Text style={[styles.weatherLabel, { color: on ? '#FFFBF1' : C.inkSoft }]}>{w.label}</Text>
          </TouchableOpacity>
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
              <Text style={[styles.activityChipText, { color: on ? '#FFFBF1' : C.inkSoft }]}>{a}</Text>
            </TouchableOpacity>
          );
        })}
        {customActivities.map(a => (
          <View key={a} style={[styles.activityChip, { backgroundColor: C.primary, borderColor: C.primary }]}>
            <Text style={[styles.activityChipText, { color: '#FFFBF1' }]}>{a}</Text>
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
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {RETURN_OPTS.map(o => {
        const on = value === o.id;
        const textCol = on ? '#FFFBF1' : C.inkSoft;
        return (
          <TouchableOpacity
            key={o.id} onPress={() => onChange(on ? null : o.id as Draft['wouldReturn'])} activeOpacity={0.7}
            style={[styles.returnBtn, { backgroundColor: on ? o.color : C.surfaceAlt, borderColor: on ? o.color : C.hairline }]}
          >
            <Ionicons name={on ? o.iconFilled : o.icon} size={14} color={textCol} />
            <Text style={[styles.returnBtnText, { color: textCol }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── VisibilityPicker ──────────────────────────────────────────────────────────

const VIS_OPTS: Array<{ v: Draft['visibility']; icon: string; desc: string }> = [
  { v: 'Private', icon: 'lock-closed',  desc: 'Only you. Not posted to the feed.' },
  { v: 'Friends', icon: 'people',       desc: 'Posted to your friends\' feeds.' },
  { v: 'Public',  icon: 'globe',        desc: 'Posted publicly for all explorers.' },
];

function VisibilityPicker({ value, onChange }: { value: Draft['visibility']; onChange: (v: Draft['visibility']) => void }) {
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
              <Ionicons name={o.icon as any} size={17} color={on ? '#FFFBF1' : C.inkSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: C.ink }}>{o.v}</Text>
              <Text style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{o.desc}</Text>
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
              <View key={u.clerk_user_id} style={styles.companionChip}>
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={{ width: 22, height: 22, borderRadius: 11 }} />
                  : <View style={styles.companionInitial}><Text style={{ color: '#FFFBF1', fontSize: 10, fontWeight: '700' }}>{name[0]}</Text></View>
                }
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFBF1' }}>{name}</Text>
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
                key={u.clerk_user_id} onPress={() => toggle(u)} activeOpacity={0.7}
                style={[styles.resultRow, { backgroundColor: on ? 'rgba(31,61,46,0.06)' : 'transparent',
                  borderBottomWidth: idx < results.length - 1 ? 0.5 : 0, borderBottomColor: C.hairlineSoft }]}
              >
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                  : <View style={[styles.companionInitial, { width: 32, height: 32, borderRadius: 16 }]}><Text style={{ color: '#FFFBF1', fontWeight: '700' }}>{name[0]}</Text></View>
                }
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 13.5, color: C.ink }}>{name}</Text>
                  <Text style={{ fontSize: 11.5, color: C.inkMute }}>@{u.username}</Text>
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

// ── PhotoStrip ────────────────────────────────────────────────────────────────

function PhotoStrip({ token, photos, cover, onAdd, onRemove, onSetCover }: {
  token: string; photos: string[]; cover: string | null;
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onSetCover: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: Math.max(1, 10 - photos.length),
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    const urls: string[] = [];
    for (const asset of result.assets) {
      try {
        const presignRes = await apiFetch<{ uploadUrl: string; publicUrl: string }>(
          '/api/upload/presign', token,
          {
            method: 'POST',
            body: JSON.stringify({
              filename: asset.fileName ?? 'photo.jpg',
              contentType: asset.mimeType ?? 'image/jpeg',
              size: asset.fileSize ?? 0,
            }),
          }
        );
        const fileRes = await fetch(asset.uri);
        const blob = await fileRes.blob();
        await fetch(presignRes.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
          body: blob,
        });
        urls.push(presignRes.publicUrl);
      } catch (e) {
        console.warn('Photo upload failed:', e);
      }
    }
    if (urls.length) onAdd(urls);
    setUploading(false);
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {photos.map((url, idx) => {
          const isCover = cover === url;
          return (
            <View key={url} style={styles.photoThumb}>
              <Image source={{ uri: url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
              <TouchableOpacity style={styles.photoCoverBtn} onPress={() => onSetCover(url)}>
                <Ionicons name={isCover ? 'star' : 'star-outline'} size={11} color={isCover ? C.accent : '#FFFBF1'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => onRemove(url)}>
                <Ionicons name="close" size={11} color="#FFFBF1" />
              </TouchableOpacity>
              {isCover && (
                <View style={styles.coverBadge}>
                  <Text style={{ fontSize: 7.5, fontWeight: '700', color: '#FFFBF1', letterSpacing: 0.5 }}>COVER</Text>
                </View>
              )}
              <View style={styles.photoIndex}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFBF1' }}>{idx + 1}</Text>
              </View>
            </View>
          );
        })}
        {photos.length < 10 && (
          <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={styles.photoAdd} activeOpacity={0.7}>
            <Ionicons name={uploading ? 'hourglass' : 'add'} size={24} color={C.primary} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: C.primary, marginTop: 3 }}>
              {uploading ? 'Uploading…' : 'Add photos'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── ParkPickerSheet ───────────────────────────────────────────────────────────

function ParkPickerSheet({ visible, parks, selected, onClose, onPick }: {
  visible: boolean; parks: ParkInfo[]; selected: string;
  onClose: () => void; onPick: (code: string) => void;
}) {
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
                <View style={styles.parkBadge}>
                  <Text style={{ color: '#FFFBF1', fontWeight: '800', fontSize: 11 }}>{state2}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>{p.name}</Text>
                  <Text style={{ fontSize: 11.5, color: C.inkMute }}>{fullStateName(p.states.split(',')[0].trim())}</Text>
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
          <TouchableOpacity onPress={() => { setSelStart(null); setSelEnd(null); }}>
            <Text style={{ fontSize: 16, color: C.inkMute }}>Clear</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>Dates</Text>
          <TouchableOpacity onPress={() => { onApply(selStart, selEnd); onClose(); }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.primary }}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 16 }}>
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
                        color: isViewMonth ? '#FFFBF1' : isFuture ? 'rgba(122,116,106,0.4)' : C.inkSoft,
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
                    const isStart  = sameDay(d, selStart);
                    const isEnd    = selEnd ? sameDay(d, selEnd) : false;
                    const endpoint = isStart || isEnd;
                    const mid = !!(selStart && selEnd && stripTime(d) > stripTime(selStart) && stripTime(d) < stripTime(selEnd));
                    const isToday  = sameDay(d, today);
                    const disabled = stripTime(d) > stripTime(maxDate);
                    return (
                      <View key={di} style={styles.calCell}>
                        {/* Range background — half-fill at endpoints */}
                        {mid && <View style={[StyleSheet.absoluteFillObject as object, { backgroundColor: rangeBg }]} />}
                        {isStart && selEnd && !isEnd && (
                          <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: '50%', backgroundColor: rangeBg }} />
                        )}
                        {isEnd && !isStart && (
                          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%', backgroundColor: rangeBg }} />
                        )}
                        <TouchableOpacity
                          disabled={disabled}
                          onPress={() => pick(d)}
                          style={[
                            styles.calDayBtn,
                            endpoint && { backgroundColor: C.primary },
                            isToday && !endpoint && { borderWidth: 1.5, borderColor: 'rgba(31,61,46,0.4)' },
                          ]}
                        >
                          <Text style={{
                            fontSize: 13,
                            fontWeight: endpoint ? '800' : mid ? '700' : '400',
                            color: endpoint ? '#FFFBF1' : disabled ? 'rgba(122,116,106,0.35)' : mid ? C.primary : C.ink,
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
  return (
    <Text style={{
      fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase',
      color: kind === 'required' ? C.primary : C.inkMute,
    }}>
      {'  '}{kind}
    </Text>
  );
}

function Section({ kicker, title, hint, tag, children }: {
  kicker?: string; title?: string; hint?: string; tag?: 'required' | 'optional'; children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 24 }}>
      {(kicker || title || hint) && (
        <View style={{ marginBottom: 10 }}>
          {kicker && <Text style={styles.kicker}>{kicker}</Text>}
          {title  && <Text style={styles.sectionTitle}>{title}{tag && <RequirementTag kind={tag} />}</Text>}
          {hint   && <Text style={{ fontSize: 12.5, color: C.inkMute, marginTop: 3, lineHeight: 17 }}>{hint}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

// ── Step screens ──────────────────────────────────────────────────────────────

function StepWhere({ draft, set, parks, onPickPark }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  parks: ParkInfo[]; onPickPark: () => void;
}) {
  const park = parks.find(p => p.park_code === draft.parkCode);
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();

  const days = dayCount(draft.startDate, draft.endDate);

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

      <Section kicker="01" title="Where & when">
        {/* Park picker */}
        <TouchableOpacity onPress={onPickPark} activeOpacity={0.7} style={[
          styles.parkBanner,
          { backgroundColor: park ? C.primary : C.surfaceAlt, borderStyle: park ? 'solid' : 'dashed' },
        ]}>
          {park ? (
            <>
              {/* Faint cover photo behind the banner content, like web */}
              {park.image_url ? (
                <Image
                  source={{ uri: park.image_url }}
                  style={StyleSheet.absoluteFill as any}
                  resizeMode="cover"
                />
              ) : null}
              <LinearGradient
                colors={['rgba(0,0,0,0.58)', 'rgba(0,0,0,0.16)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,251,241,0.8)', letterSpacing: 1.2 }}>NATIONAL PARK</Text>
                  <Text numberOfLines={2} style={{ fontSize: 19, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.3, marginTop: 2 }}>{park.name}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,251,241,0.8)', marginTop: 1 }}>{fullStateName(park.states.split(',')[0].trim())}</Text>
                </View>
                <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,251,241,0.92)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 }}>
                  <Ionicons name="pencil" size={11} color={C.ink} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>Change</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="search" size={20} color="#FFFBF1" />
              </View>
              <View>
                <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink, letterSpacing: -0.2 }}>Select a park</Text>
                <Text style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>Search all 63 national parks</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Section>

      {/* Rest locked until park selected */}
      <View style={{ opacity: park ? 1 : 0.35, pointerEvents: park ? 'auto' : 'none' } as any}>
        <Section title="Trip title" tag="optional">
          <TextInput
            value={draft.title} onChangeText={v => set('title', v.slice(0, 80))}
            placeholder="Give this trip a name" placeholderTextColor={C.inkMute}
            style={styles.textField}
          />
        </Section>

        <Section title="Dates" tag="required">
          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => setShowCalendar(true)} activeOpacity={0.7}
              style={[styles.dateRow, { borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft }]}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar" size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Start date *</Text>
                <Text style={[styles.dateValue, { color: draft.startDate ? C.ink : C.inkMute }]}>
                  {draft.startDate ? fmtDate(draft.startDate) : 'Pick a date'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCalendar(true)} activeOpacity={0.7}
              disabled={!draft.startDate}
              style={[styles.dateRow, { opacity: draft.startDate ? 1 : 0.4 }]}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar-outline" size={16} color={C.inkMute} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>End date</Text>
                <Text style={[styles.dateValue, { color: draft.endDate ? C.ink : C.inkMute }]}>
                  {draft.endDate ? fmtDate(draft.endDate) : 'Optional multi-day trip'}
                </Text>
              </View>
              {draft.endDate
                ? <TouchableOpacity onPress={() => set('endDate', null)} hitSlop={8}><Ionicons name="close-circle" size={16} color={C.inkMute} /></TouchableOpacity>
                : <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
              }
            </TouchableOpacity>
          </View>
          {days > 1 && (
            <Text style={{ fontSize: 11.5, color: C.accent, fontWeight: '700', marginTop: 6 }}>{days} day trip</Text>
          )}
        </Section>
      </View>
    </View>
  );
}

function StepVisit({ draft, set }: { draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  return (
    <View>
      <Section kicker="02" title="How was it?" tag="optional">
        <View style={styles.card}>
          <StarRating value={draft.rating} onChange={v => set('rating', v)} />
        </View>
      </Section>

      <Section title="Conditions" tag="optional">
        <View style={styles.card}>
          <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="people-outline" size={15} color={C.inkMute} />
              <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>Crowd level</Text>
            </View>
            <ScaleRow value={draft.crowd} onChange={v => set('crowd', v)} labels={CROWD_LABELS} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="walk-outline" size={15} color={C.inkMute} />
              <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>Trail difficulty</Text>
            </View>
            <ScaleRow value={draft.difficulty} onChange={v => set('difficulty', v)} labels={DIFF_LABELS} />
          </View>
        </View>
      </Section>

      <Section title="Weather" tag="optional">
        <View style={styles.card}>
          <WeatherGrid value={draft.weather} onChange={v => set('weather', v)} />
        </View>
      </Section>

      <Section title="Would you go back?" tag="optional">
        <ReturnRow value={draft.wouldReturn} onChange={v => set('wouldReturn', v)} />
      </Section>
    </View>
  );
}

function StepJournal({ draft, set, token, npsActivityNames }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; token: string;
  npsActivityNames: string[];
}) {
  return (
    <View>
      <View style={{ marginBottom: 24 }}>
        <Text style={styles.kicker}>03</Text>
        <Text style={styles.sectionTitle}>Journal & photos</Text>
      </View>

      <Section title="Highlight" tag="optional">
        <TextInput
          value={draft.highlight} onChangeText={v => set('highlight', v.slice(0, 90))}
          placeholder="The one moment you'll remember" placeholderTextColor={C.inkMute}
          style={[styles.textField, { marginBottom: 0 }]}
        />
        <Text style={styles.charCountOutside}>{draft.highlight.length}/90</Text>
      </Section>

      <Section title="Notes" tag="optional">
        <TextInput
          value={draft.notes} onChangeText={v => set('notes', v.slice(0, 2000))}
          placeholder="What did you see, hear, feel?" placeholderTextColor={C.inkMute}
          multiline style={[styles.textField, styles.textArea]}
        />
        <Text style={styles.charCountOutside}>{draft.notes.length}/2000</Text>
      </Section>

      <Section title="Activities" tag="optional">
        <ActivityChips value={draft.activities} onChange={v => set('activities', v)} npsActivityNames={npsActivityNames} />
      </Section>

      <Section title="Who came along?" tag="optional">
        <CompanionSearch
          companions={draft.companions} companionObjs={draft.companionObjs}
          onChange={(ids, objs) => { set('companions', ids); set('companionObjs', objs); }}
          token={token}
        />
      </Section>

      <Section title="Photos" tag="optional">
        <PhotoStrip
          token={token} photos={draft.photos} cover={draft.cover}
          onAdd={urls => {
            const next = [...draft.photos, ...urls].slice(0, 10);
            set('photos', next);
            if (!draft.cover && next.length > 0) set('cover', next[0]);
          }}
          onRemove={url => {
            const next = draft.photos.filter(p => p !== url);
            set('photos', next);
            if (draft.cover === url) set('cover', next[0] ?? null);
          }}
          onSetCover={url => set('cover', url)}
        />
      </Section>
    </View>
  );
}

function PreviewChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.previewChip}>
      <Ionicons name={icon} size={11} color={C.inkSoft} />
      <Text style={styles.previewChipText}>{label}</Text>
    </View>
  );
}

function VisitPreview({ draft, park, userName, avatarUrl }: {
  draft: Draft; park: ParkInfo | undefined; userName: string; avatarUrl?: string | null;
}) {
  const visIcon: keyof typeof Ionicons.glyphMap =
    draft.visibility === 'Private' ? 'lock-closed' :
    draft.visibility === 'Public'  ? 'globe-outline' : 'people';
  const selectedWeather = WEATHER_OPTS.filter(w => draft.weather.includes(w.id));
  const days = dayCount(draft.startDate, draft.endDate);
  const coverUrl = draft.photos.length > 0 ? (draft.cover ?? draft.photos[0]) : null;

  return (
    <View style={styles.previewCard}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 9 }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFBF1', fontWeight: '800', fontSize: 13 }}>{userName[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: '700', fontSize: 13, color: C.ink }} numberOfLines={1}>
            {userName} <Text style={{ color: C.inkMute, fontWeight: '500' }}>· now</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location" size={10} color={C.primary} />
            <Text style={{ fontSize: 9.5, color: C.primary, letterSpacing: 0.4, fontWeight: '700' }} numberOfLines={1}>
              {park ? `${park.name.toUpperCase()} · ${park.states.split(',')[0].trim()}` : 'NO PARK'}
            </Text>
          </View>
        </View>
        <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 }}>
          <Ionicons name={visIcon} size={11} color={C.inkMute} />
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: C.inkMute }}>{draft.visibility}</Text>
        </View>
      </View>

      {/* Cover — photo or faint gradient placeholder */}
      {(coverUrl || draft.rating > 0) && (
        <View>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={{ width: '100%', height: 170 }} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[C.primary, C.accent]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ height: 170, opacity: 0.25 }}
            />
          )}
          {draft.rating > 0 && (
            <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 3, backgroundColor: 'rgba(20,17,12,0.55)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 100 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Ionicons
                  key={i}
                  name={draft.rating >= i + 1 ? 'star' : draft.rating >= i + 0.5 ? 'star-half' : 'star-outline'}
                  size={12}
                  color={draft.rating >= i + 0.5 ? '#FFD580' : 'rgba(255,255,255,0.4)'}
                />
              ))}
            </View>
          )}
          {draft.photos.length > 1 && (
            <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(20,17,12,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 }}>
              <Ionicons name="images-outline" size={11} color="#FFFBF1" />
              <Text style={{ color: '#FFFBF1', fontSize: 10, fontWeight: '600' }}>{draft.photos.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* Body */}
      <View style={{ paddingHorizontal: 13, paddingTop: 11, paddingBottom: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <Ionicons name="calendar-outline" size={13} color={C.inkMute} />
          <Text style={{ fontWeight: '600', fontSize: 11.5, color: C.inkSoft }}>
            {draft.startDate ? fmtDate(draft.startDate) : 'No date'}
            {draft.endDate ? ` – ${fmtDate(draft.endDate)}` : ''}
          </Text>
          {days > 1 && (
            <View style={{ backgroundColor: 'rgba(197,107,61,0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100 }}>
              <Text style={{ fontSize: 9, letterSpacing: 0.6, color: C.accent, fontWeight: '700' }}>{days} DAYS</Text>
            </View>
          )}
        </View>
        {draft.title ? (
          <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink, letterSpacing: -0.3, marginBottom: 5 }}>{draft.title}</Text>
        ) : null}
        {draft.caption ? (
          <Text style={{ fontSize: 13, color: C.inkSoft, lineHeight: 19 }}>
            {draft.caption.length > 160 ? `${draft.caption.slice(0, 160)}…` : draft.caption}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {selectedWeather.map(w => <PreviewChip key={w.id} icon="partly-sunny-outline" label={w.label} />)}
          {draft.crowd > 0 && <PreviewChip icon="people-outline" label={CROWD_LABELS[draft.crowd - 1]} />}
          {draft.difficulty > 0 && <PreviewChip icon="walk-outline" label={DIFF_LABELS[draft.difficulty - 1]} />}
          {draft.activities.slice(0, 3).map(a => <PreviewChip key={a} icon="location-outline" label={a} />)}
        </View>
      </View>
    </View>
  );
}

function StepShare({ draft, set, park, userName, avatarUrl }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  park: ParkInfo | undefined; userName: string; avatarUrl?: string | null;
}) {
  return (
    <View>
      <Section title="Add a caption" tag="optional">
        <TextInput
          value={draft.caption} onChangeText={v => set('caption', v.slice(0, 500))}
          placeholder="Share what made this trip special…" placeholderTextColor={C.inkMute}
          multiline style={[styles.textField, styles.textArea]}
        />
        <Text style={styles.charCountOutside}>{draft.caption.length}/500</Text>
      </Section>

      <Section title="Who can see this?">
        <VisibilityPicker value={draft.visibility} onChange={v => set('visibility', v)} />
      </Section>

      <Section title="Preview">
        <VisitPreview draft={draft} park={park} userName={userName} avatarUrl={avatarUrl} />
      </Section>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function LogVisitModal() {
  const router   = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets   = useSafeAreaInsets();

  // Edit mode — opened from a feed post's "Edit visit" menu item
  const { visitId: visitIdParam, postId: postIdParam } =
    useLocalSearchParams<{ visitId?: string; postId?: string }>();
  const editVisitId = visitIdParam ? Number(visitIdParam) : null;
  const editPostId  = postIdParam && !isNaN(Number(postIdParam)) ? Number(postIdParam) : null;
  const isEdit = editVisitId != null && !isNaN(editVisitId);

  const [token,      setToken]      = useState<string | null>(null);
  const [draft,      setDraftState] = useState<Draft>(makeBlank);
  const [step,       setStep]       = useState(0);
  const [parks,      setParks]      = useState<ParkInfo[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editLoading, setEditLoading] = useState(isEdit);
  const scrollRef = useRef<ScrollView>(null);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraftState(prev => ({ ...prev, [k]: v }));
  }, []);

  // ── Drafts ──────────────────────────────────────────────────────────────────
  const draftId = useRef(`draft-${Date.now()}`);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restoreBanner, setRestoreBanner] = useState<SavedDraft | null>(null);

  useEffect(() => {
    if (isEdit) return;
    loadDrafts().then(d => { if (d.length > 0) setRestoreBanner(d[0]); });
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

  const resumeDraft = () => {
    if (!restoreBanner) return;
    setDraftState(restoreBanner.draft);
    draftId.current = restoreBanner.id;
    setRestoreBanner(null);
  };

  const discardSavedDraft = () => {
    if (!restoreBanner) return;
    deleteDraft(restoreBanner.id);
    setRestoreBanner(null);
  };

  useEffect(() => {
    getToken().then(tok => {
      setToken(tok);
      if (tok) {
        apiFetch<ParkInfo[]>('/api/parks', tok).then(setParks).catch(() => {});
      }
    });
  }, [getToken]);

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
          photos:     v.photos ?? [],
          cover:      v.cover_photo ?? null,
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

  const handleCancel = () => {
    if (isEdit) {
      Alert.alert('Discard changes?', "Your edits won't be saved.", [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
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
            router.back();
          },
        },
        {
          text: 'Save draft',
          onPress: () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
            upsertDraft(draft, parkName, draftId.current);
            router.back();
          },
        },
      ]);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!draft.parkCode || !draft.startDate || !token) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/visits/${editVisitId}`, token, {
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
            cover_photo:        draft.cover ?? null,
            visibility:         draft.visibility.toLowerCase(),
          }),
        });
        if (editPostId != null) {
          await apiFetch(`/api/posts/${editPostId}`, token, {
            method: 'PATCH',
            body: JSON.stringify({
              caption:   draft.caption || null,
              photos:    draft.photos.length > 0 ? draft.photos : null,
              park_code: draft.parkCode,
            }),
          });
        }
        router.back();
        return;
      }

      const visitRes = await apiFetch<{ visit: { id: number } }>('/api/visits', token, {
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
          cover_photo:        draft.cover ?? null,
          visibility:         draft.visibility.toLowerCase(),
        }),
      });

      if (draft.visibility !== 'Private' && visitRes.visit?.id) {
        await apiFetch('/api/posts', token, {
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
      router.back();
    } catch (e) {
      if (e instanceof Error && e.message.includes('409')) {
        Alert.alert('Park already logged', 'You already have a visit for that park. Edit that visit instead.');
      } else {
        Alert.alert('Something went wrong', 'Please try again.');
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
      {/* Grabber — modal is natively swipe-down dismissible */}
      <View style={{ alignItems: 'center', paddingTop: 9 }}>
        <View style={styles.grabber} />
      </View>

      {/* Close — pinned to the top corner so it sits in the sheet's rounding */}
      <TouchableOpacity onPress={handleCancel} style={styles.modalClose} hitSlop={8}>
        <Ionicons name="close" size={16} color={C.inkSoft} />
      </TouchableOpacity>

      {/* Title row */}
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>{isEdit ? 'Edit visit' : 'Log a visit'}</Text>
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
        <Text style={styles.kicker}>STEP {String(step + 1).padStart(2, '0')} OF {String(STEPS.length).padStart(2, '0')} · {STEPS[step].toUpperCase()}</Text>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && restoreBanner && restoreBanner.id !== draftId.current && (
          <View style={styles.draftBanner}>
            <Ionicons name="document-text-outline" size={16} color={C.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.draftBannerTitle} numberOfLines={1}>
                {restoreBanner.parkName ?? 'No park selected'}
                {restoreBanner.draft.title ? ` — ${restoreBanner.draft.title}` : ''}
              </Text>
              <Text style={styles.draftBannerSub}>Draft saved {draftAge(restoreBanner.savedAt)}</Text>
            </View>
            <TouchableOpacity onPress={discardSavedDraft} hitSlop={6} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={15} color={C.inkMute} />
            </TouchableOpacity>
            <TouchableOpacity onPress={resumeDraft} style={styles.draftResumeBtn} activeOpacity={0.8}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFBF1' }}>Resume</Text>
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
        {step === 1 && <StepVisit draft={draft} set={set} />}
        {step === 2 && token && <StepJournal draft={draft} set={set} token={token} npsActivityNames={npsActivityNames} />}
        {step === 3 && (
          <StepShare
            draft={draft}
            set={set}
            park={parks.find(p => p.park_code === draft.parkCode)}
            userName={user?.fullName ?? user?.username ?? 'You'}
            avatarUrl={user?.imageUrl}
          />
        )}
      </ScrollView>

      {/* Footer nav */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {step > 0 ? (
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={15} color={C.ink} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}

        <View style={{ flexDirection: 'row', gap: 5 }}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.progDot, {
              width: i === step ? 18 : 6,
              backgroundColor: i <= step ? C.primary : C.hairline,
            }]} />
          ))}
        </View>

        <TouchableOpacity
          onPress={isLast ? handleSubmit : goNext}
          disabled={!canContinue || submitting}
          style={[styles.nextBtn, { backgroundColor: canContinue ? C.primary : C.surfaceAlt }]}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: canContinue ? '#FFFBF1' : C.inkMute }}>
            {isLast ? (submitting ? 'Saving…' : isEdit ? 'Save' : 'Post entry') : 'Continue'}
          </Text>
          {!isLast && <Ionicons name="arrow-forward" size={14} color={canContinue ? '#FFFBF1' : C.inkMute} />}
        </TouchableOpacity>
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(197,107,61,0.08)',
    borderWidth: 0.5, borderColor: 'rgba(197,107,61,0.35)',
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 20,
  },
  draftBannerTitle: {
    fontSize: 13, fontWeight: '700', color: C.ink,
  },
  draftBannerSub: {
    fontSize: 11, color: C.inkMute, marginTop: 1,
  },
  draftResumeBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 100,
  },

  // Modal chrome
  grabber: {
    width: 36, height: 4.5, borderRadius: 3,
    backgroundColor: 'rgba(27,26,22,0.18)',
  },
  modalTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 2,
  },
  modalTitle: {
    fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.3,
  },
  modalClose: {
    position: 'absolute', top: 10, right: 16, zIndex: 10,
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
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.4,
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
    width: '22.5%', paddingVertical: 10, borderRadius: 13, borderWidth: 0.5,
    alignItems: 'center', gap: 4,
  },
  weatherLabel: {
    fontSize: 11, fontWeight: '600',
  },

  // Activity
  activityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100, borderWidth: 0.5,
  },
  activityChipText: {
    fontSize: 12.5, fontWeight: '600', textTransform: 'capitalize',
  },

  // Would return
  returnBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 0.5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  returnBtnText: {
    fontSize: 12.5, fontWeight: '700',
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
    backgroundColor: C.primary,
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
  photoThumb: {
    width: 80, height: 80, borderRadius: 12, overflow: 'hidden',
    backgroundColor: C.surfaceAlt,
  },
  photoCoverBtn: {
    position: 'absolute', top: 5, left: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(20,17,12,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveBtn: {
    position: 'absolute', top: 5, right: 5,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(20,17,12,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute', bottom: 5, left: 5,
    backgroundColor: 'rgba(20,17,12,0.6)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 100,
  },
  photoIndex: {
    position: 'absolute', bottom: 5, right: 5,
    backgroundColor: 'rgba(20,17,12,0.55)', width: 17, height: 17, borderRadius: 8.5,
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.hairline,
    backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
    fontSize: 10, fontWeight: '600', color: C.inkMute,
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
    fontSize: 9.5, color: C.inkMute, fontWeight: '600', letterSpacing: 0.5,
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
    borderRadius: 100,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  previewChipText: {
    fontWeight: '600', fontSize: 11, color: C.inkSoft,
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
    fontSize: 11.5, fontWeight: '600', color: C.inkMute, letterSpacing: 0.3,
  },
  dateValue: {
    fontSize: 15, fontWeight: '600', marginTop: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
    backgroundColor: C.bg,
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
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10,
    width: 120, justifyContent: 'center',
    shadowColor: '#1F3D2E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
});
