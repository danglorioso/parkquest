import {
  Alert, Dimensions, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { GlassIconBg } from '@/components/GlassIconBg';
import * as ImagePicker from 'expo-image-picker';
import { fitUnderUploadCap } from '@/lib/uploadImage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { STATIC as C, useColors, useThemedStyles, type Colors } from '@/lib/palette';
import { dayCount, fmtDate, fmtRange, MONTHS } from '@/lib/dates';
import { parkColor } from '@/lib/parkColors';
import { HikeStatsCard } from '@/components/HikeStatsCard';
import { CompanionSearch, type CompanionUser } from '@/components/CompanionSearch';
import { ActivityChips } from '@/components/ActivityChips';
import { deriveRankScore, sortByRankKey } from '@parkquest/types';

const DANGER = '#C0392B';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const W    = Dimensions.get('window').width;

// ── Constants ─────────────────────────────────────────────────────────────────

const WEATHER_OPTS = [
  { value: 'clear',   label: '☀️ Clear' },
  { value: 'partly',  label: '⛅ Partly Cloudy' },
  { value: 'cloudy',  label: '☁️ Overcast' },
  { value: 'rain',    label: '🌧️ Rain' },
  { value: 'storm',   label: '⛈️ Storms' },
  { value: 'snow',    label: '❄️ Snow' },
  { value: 'fog',     label: '🌫️ Fog' },
  { value: 'wind',    label: '💨 Windy' },
];

const CROWD_LABELS  = ['Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
const DIFF_LABELS   = ['Easy',  'Light', 'Moderate', 'Hard', 'Strenuous'];
const RETURN_OPTS   = [
  { value: 'yes',   label: 'Yes',   icon: 'checkmark-circle-outline' },
  { value: 'maybe', label: 'Maybe', icon: 'help-circle-outline' },
  { value: 'no',    label: 'No',    icon: 'close-circle-outline' },
];

const VIS_OPTS = [
  { value: 'private', label: 'Private', icon: 'lock-closed-outline'  },
  { value: 'friends', label: 'Friends', icon: 'people-outline'       },
  { value: 'public',  label: 'Public',  icon: 'globe-outline'        },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: number;
  park_code: string;
  park_name: string | null;
  states: string | null;
  visited_date: string | null;
  end_date: string | null;
  is_bucket_list: boolean;
  rank_key: string | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  would_return: string | null;
  highlight: string | null;
  title: string | null;
  notes: string | null;
  photos: string[] | null;
  cover_photo: string | null;
  visibility: string | null;
  caption: string | null;
  created_at: string | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  elevation_gain_meters: number | null;
  route_polyline: string | null;
  external_source: string | null;
}

interface Draft {
  title: string;
  visited_date: Date;
  end_date: Date | null;
  crowd: number;
  difficulty: number;
  weather_conditions: string[];
  activities: string[];
  companions: string[];
  companionObjs: CompanionUser[];
  would_return: string;
  highlight: string;
  notes: string;
  photos: string[];
  cover_photo: string | null;
  visibility: string;
  caption: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScaleInput({ value, labels, onChange }: { value: number; labels: string[]; onChange: (n: number) => void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {labels.map((lbl, i) => {
        const active = value === i + 1;
        return (
          <TouchableOpacity key={i} onPress={() => onChange(i + 1)} style={[s.scalePill, active && s.scalePillOn]}>
            <Text style={[s.scalePillText, active && s.scalePillTextOn]}>{lbl}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MultiChips({
  options, selected, onChange,
}: { options: { value: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  const s = useThemedStyles(makeStyles);
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {options.map(opt => {
        const on = selected.includes(opt.value);
        return (
          <TouchableOpacity key={opt.value} onPress={() => toggle(opt.value)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Photo section (view mode) ─────────────────────────────────────────────────

function PhotoHero({ photos, cover }: { photos: string[]; cover: string | null }) {
  const s = useThemedStyles(makeStyles);
  const [idx, setIdx] = useState(() => {
    const ci = cover ? photos.indexOf(cover) : -1;
    return ci >= 0 ? ci : 0;
  });

  if (!photos.length) return null;

  return (
    <View>
      <View style={{ width: W, height: 280, backgroundColor: '#111' }}>
        <Image
          source={{ uri: photos[idx] }}
          style={{ width: W, height: 280 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        {/* Prev / next arrows */}
        {photos.length > 1 && (
          <>
            <TouchableOpacity
              style={[s.heroArrow, idx === 0 && { opacity: 0.3 }]}
              onPress={() => setIdx(i => (i - 1 + photos.length) % photos.length)}
              disabled={idx === 0}
            >
              <View style={s.heroArrowBg}>
                <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
                <Ionicons name="chevron-back" size={18} color="#FFFBF1" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.heroArrow, { right: 12, left: undefined }, idx === photos.length - 1 && { opacity: 0.3 }]}
              onPress={() => setIdx(i => (i + 1) % photos.length)}
              disabled={idx === photos.length - 1}
            >
              <View style={s.heroArrowBg}>
                <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
                <Ionicons name="chevron-forward" size={18} color="#FFFBF1" />
              </View>
            </TouchableOpacity>
            {/* Dot indicators */}
            <View style={s.heroDots}>
              {photos.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => setIdx(i)}>
                  <View style={[s.heroDot, i === idx && s.heroDotOn]} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Thumbnail strip (if >1 photo) */}
      {photos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: '#000' }}>
          {photos.map((uri, i) => (
            <TouchableOpacity key={i} onPress={() => setIdx(i)}>
              <Image
                source={{ uri }}
                style={{ width: 64, height: 64, opacity: i === idx ? 1 : 0.45 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Photo strip for edit mode ─────────────────────────────────────────────────

function PhotoStrip({
  photos, cover, onPhotosChange, onCoverChange, token,
}: {
  photos: string[];
  cover: string | null;
  onPhotosChange: (p: string[]) => void;
  onCoverChange: (p: string | null) => void;
  token: string;
}) {
  const s = useThemedStyles(makeStyles);
  const T = useColors();
  const [uploading, setUploading] = useState(false);

  async function pickAndUpload() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(0, 5 - photos.length),
    });
    if (result.canceled || !result.assets.length) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const asset of result.assets) {
        // Photos upload at original dimensions; only shrunk if they'd blow the
        // request body cap (Vercel Functions cap bodies at 4.5 MB) — see /lib/uploadImage.
        const { blob, mimeType } = await fitUnderUploadCap(asset.uri, asset.mimeType);
        const up = await fetch(`${BASE}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': mimeType, Authorization: `Bearer ${token}` },
          body: blob,
        });
        if (!up.ok) continue;
        const { publicUrl } = await up.json();
        newUrls.push(publicUrl);
      }
      const updated = [...photos, ...newUrls];
      onPhotosChange(updated);
      if (!cover && updated.length > 0) onCoverChange(updated[0]);
    } catch {
      Alert.alert('Upload failed', 'Could not upload one or more photos.');
    } finally {
      setUploading(false);
    }
  }

  function remove(uri: string) {
    const updated = photos.filter(p => p !== uri);
    onPhotosChange(updated);
    if (cover === uri) onCoverChange(updated[0] ?? null);
  }

  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
          {photos.map(uri => (
            <View key={uri} style={s.stripThumb}>
              <Image source={{ uri }} style={{ width: 80, height: 80 }} contentFit="cover" />
              {/* Cover star */}
              <TouchableOpacity
                style={s.stripCoverBtn}
                onPress={() => onCoverChange(uri === cover ? null : uri)}
              >
                <GlassIconBg onMedia borderRadius={11} fallbackColor="rgba(0,0,0,0.4)" />
                <Ionicons name={cover === uri ? 'star' : 'star-outline'} size={12} color="#FFFBF1" />
              </TouchableOpacity>
              {/* Remove */}
              <TouchableOpacity style={s.stripRemoveBtn} onPress={() => remove(uri)}>
                <GlassIconBg onMedia borderRadius={11} fallbackColor="rgba(0,0,0,0.4)" />
                <Ionicons name="close" size={14} color="#FFFBF1" />
              </TouchableOpacity>
            </View>
          ))}

          {photos.length < 5 && (
            <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={s.stripAdd}>
              {uploading
                ? <Ionicons name="cloud-upload-outline" size={22} color={T.primary} />
                : <Ionicons name="add-circle-outline" size={22} color={T.primary} />}
              <Text style={{ fontSize: 13, color: T.primary, fontWeight: '600', marginTop: 4 }}>
                {uploading ? 'Uploading…' : 'Add photo'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      {photos.length > 0 && (
        <Text style={{ fontSize: 13, color: C.inkMute }}>Tap ★ to set cover photo</Text>
      )}
    </View>
  );
}

// ── Date row ─────────────────────────────────────────────────────────────────

function DateRow({
  label, value, onChange,
}: { label: string; value: Date | null; onChange: (d: Date | null) => void }) {
  const s = useThemedStyles(makeStyles);
  const T = useColors();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={s.dateBtn}>
        <Ionicons name="calendar-outline" size={15} color={T.primary} />
        <Text style={s.dateBtnText}>
          {value ? `${MONTHS[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}` : 'Select date'}
        </Text>
        {value && label === 'End date' && (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={C.inkMute} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, d) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (d) onChange(d);
          }}
          accentColor={T.primary}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function JournalEntryScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { getToken } = useAuth();
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const s = useThemedStyles(makeStyles);
  const T = useColors();

  const [entry,   setEntry]   = useState<JournalEntry | null>(null);
  // Full list, fetched anyway to locate `entry` by id — reused to compute
  // this visit's rank position/score without a second round trip.
  const [allEntries, setAllEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Deep-linked from the journal list's "Edit entry" quick action.
  const [editing, setEditing] = useState(edit === '1');
  const [saving,  setSaving]  = useState(false);
  const [token,   setToken]   = useState('');

  const [draft, setDraft] = useState<Draft>({
    title: '', visited_date: new Date(), end_date: null,
    crowd: 0, difficulty: 0, weather_conditions: [], activities: [],
    companions: [], companionObjs: [],
    would_return: '', highlight: '', notes: '', photos: [],
    cover_photo: null, visibility: 'private', caption: '',
  });

  // Union of NPS activity names across all parks — feeds activity autocomplete,
  // same corpus the log-visit wizard's own Activities step uses.
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

  // getToken is unstable across renders — dep arrays containing it loop forever
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const load = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setToken(tok);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/visits`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) return;
      const all: JournalEntry[] = await res.json();
      setAllEntries(all);
      const found = all.find(e => String(e.id) === String(id));
      if (found) {
        setEntry(found);
        setDraft(entryToDraft(found));
        // Companions come back as bare clerk_user_ids — resolve to
        // display-ready profiles for the chip row + picker.
        if (found.companions?.length) {
          const objs = await fetch(`${BASE}/api/users?ids=${found.companions.join(',')}`, {
            headers: { Authorization: `Bearer ${tok}` },
          }).then(r => r.ok ? r.json() : []).catch(() => []);
          setDraft(d => ({ ...d, companionObjs: objs }));
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function entryToDraft(e: JournalEntry): Draft {
    return {
      title:              e.title ?? '',
      visited_date:       e.visited_date ? new Date(e.visited_date) : new Date(),
      end_date:           e.end_date ? new Date(e.end_date) : null,
      crowd:              e.crowd ?? 0,
      difficulty:         e.difficulty ?? 0,
      weather_conditions: e.weather_conditions ?? [],
      activities:         e.activities ?? [],
      // companionObjs resolved separately in load() (companions here are
      // bare ids) — reset to empty so a stale prior entry's tagged people
      // don't bleed into this one while resolution is in flight.
      companions:         e.companions ?? [],
      companionObjs:      [],
      would_return:       e.would_return ?? '',
      highlight:          e.highlight ?? '',
      notes:              e.notes ?? '',
      photos:             e.photos ?? [],
      cover_photo:        e.cover_photo ?? null,
      visibility:         e.visibility ?? 'private',
      caption:            e.caption ?? '',
    };
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => ({ ...d, [k]: v }));
  }

  async function save() {
    if (!entry) return;
    setSaving(true);
    try {
      const body = {
        parkCode:          entry.park_code,
        startDate:         draft.visited_date.toISOString().split('T')[0],
        endDate:           draft.end_date ? draft.end_date.toISOString().split('T')[0] : null,
        title:             draft.title || null,
        crowd:             draft.crowd || null,
        difficulty:        draft.difficulty || null,
        weather:           draft.weather_conditions,
        activities:        draft.activities,
        companions:        draft.companions,
        wouldReturn:       draft.would_return || null,
        highlight:         draft.highlight || null,
        notes:             draft.notes || null,
        photos:            draft.photos,
        cover:             draft.cover_photo,
        visibility:        draft.visibility,
        caption:           draft.caption || null,
      };
      const res = await fetch(`${BASE}/api/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await load();
        setEditing(false);
      } else {
        Alert.alert('Save failed', 'Could not save changes. Try again.');
      }
    } catch {
      Alert.alert('Save failed', 'Network error.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!entry) return;
    Alert.alert(
      'Delete entry',
      `Delete your ${entry.park_name ?? entry.park_code} visit? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const res = await fetch(
              `${BASE}/api/visits?park_code=${encodeURIComponent(entry.park_code)}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
            );
            if (res.ok) router.back();
            else Alert.alert('Delete failed', 'Could not delete entry.');
          },
        },
      ],
    );
  }

  const title = entry ? (entry.title || fmtDate(entry.visited_date)) : 'Entry';
  const days  = entry ? dayCount(entry.visited_date, entry.end_date) : 0;
  const photos = entry?.photos ?? [];

  if (loading) {
    return (
      <SafeAreaView style={s.screen} edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ gap: 14, width: W - 32 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ height: 20, backgroundColor: C.surfaceAlt, borderRadius: 6, width: `${70 + i * 8}%` as any }} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={s.screen} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="journal-outline" size={40} color={C.inkMute} />
          <Text style={{ fontSize: 16, color: C.inkMute }}>Entry not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.ctaBtn}>
            <Text style={s.ctaBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────────

  if (!editing) {
    const visKey   = (entry.visibility ?? 'private').toLowerCase();
    const placeholderBg = parkColor(entry.park_code);
    const weatherLabels = (entry.weather_conditions ?? []).map(
      v => WEATHER_OPTS.find(o => o.value === v)?.label ?? v
    );
    const hasHike = !!entry.external_source && entry.distance_meters != null;
    const ranked = sortByRankKey(allEntries);
    const rankIndex = entry.rank_key ? ranked.findIndex(e => e.id === entry.id) : -1;
    const rankRow = rankIndex >= 0
      ? { key: 'Rank', value: `#${rankIndex + 1} of ${ranked.length} · ${deriveRankScore(rankIndex, ranked.length)}` }
      : null;
    // Plain label: value rows, grouped into sections like the park profile
    // page — not PostCard's spread-out stat strip, and not one undifferentiated
    // list either, since "when/who/what it was like" are different questions.
    type Row = { key: string; value: string };
    const tripRows: Row[] = [
      { key: 'Visit date', value: fmtRange(entry.visited_date, entry.end_date) + (days > 1 ? ` · ${days} days` : '') },
      { key: 'Visibility', value: capitalize(visKey) },
      ...(entry.created_at ? [{ key: 'Post date', value: fmtDate(entry.created_at) }] : []),
    ];
    const statRows: Row[] = [
      ...(rankRow ? [rankRow] : []),
      ...(entry.crowd ? [{ key: 'Crowd', value: CROWD_LABELS[(entry.crowd ?? 1) - 1] }] : []),
      ...(entry.difficulty ? [{ key: 'Difficulty', value: DIFF_LABELS[(entry.difficulty ?? 1) - 1] }] : []),
      ...(entry.would_return ? [{ key: 'Would return', value: capitalize(entry.would_return) }] : []),
    ];
    const activityRows: Row[] = [
      ...(weatherLabels.length > 0 ? [{ key: 'Weather', value: weatherLabels.join(', ') }] : []),
      ...((entry.activities?.length ?? 0) > 0 ? [{ key: 'Activities', value: entry.activities!.map(capitalize).join(', ') }] : []),
      ...((entry.companions?.length ?? 0) > 0 ? [{ key: 'With', value: `${entry.companions!.length} ${entry.companions!.length === 1 ? 'person' : 'people'}` }] : []),
    ];

    return (
      <SafeAreaView style={s.screen} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Floating back + edit + log-another-visit — 44pt glass circles
            over the hero, same recipe (and same edit/log-visit icon pair)
            as the park detail page's header buttons for an already-visited
            park. */}
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 10 }]}>
          <TouchableOpacity
            style={[s.floatBtn, { top: insets.top + 8, left: 16 }]}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
            <Ionicons name="chevron-back" size={22} color="#FFFBF1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.floatBtn, { top: insets.top + 8, right: 68 }]}
            onPress={() => router.push({ pathname: '/(modals)/log-visit', params: { visitId: String(entry.id) } } as never)}
            hitSlop={8}
          >
            <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
            <Ionicons name="pencil-outline" size={19} color="#FFFBF1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.floatBtn, { top: insets.top + 8, right: 16 }]}
            onPress={() => router.push({
              pathname: '/(modals)/log-visit',
              params: { parkCode: entry.park_code, parkName: entry.park_name ?? '', parkStates: entry.states ?? '' },
            } as never)}
            hitSlop={8}
          >
            <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
            <Ionicons name="checkmark-outline" size={22} color="#FFFBF1" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}>
          {/* Hero photo section */}
          {photos.length > 0
            ? <PhotoHero photos={photos} cover={entry.cover_photo} />
            : (
              <View style={[s.heroPlaceholder, { backgroundColor: placeholderBg }]}>
                <Text style={{ fontSize: 13, color: 'rgba(255,251,241,0.6)', fontWeight: '600', letterSpacing: 0.8 }}>
                  {(entry.park_name ?? entry.park_code).toUpperCase()}
                </Text>
              </View>
            )
          }

          {/* Body */}
          <View style={s.body}>
            {/* Park + state — links to the park's own profile page */}
            <TouchableOpacity
              onPress={() => router.push(`/park/${entry.park_code}` as never)}
              activeOpacity={0.6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}
            >
              <Ionicons name="location" size={12} color={T.primary} />
              <Text style={s.parkLabel}>
                {entry.park_name ?? entry.park_code}
                {entry.states ? <Text style={{ color: C.inkMute }}> · {entry.states}</Text> : null}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={T.primary} />
            </TouchableOpacity>

            {/* Title */}
            <Text style={s.entryTitle}>{title}</Text>

            {/* Caption */}
            {entry.caption ? (
              <Text style={{ fontSize: 14, color: C.inkSoft, lineHeight: 21, marginTop: 4 }}>{entry.caption}</Text>
            ) : null}

            {/* Grouped into sections, like the park profile page, instead of
                one undifferentiated list — when/who/what-it-was-like are
                different questions. */}
            {tripRows.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.sectionLabel}>Trip</Text>
                <View style={s.detailList}>
                  {tripRows.map((row, i) => (
                    <View key={row.key} style={[s.detailRow, i === 0 && { borderTopWidth: 0 }]}>
                      <Text style={s.detailKey}>{row.key}</Text>
                      <Text style={s.detailVal}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {statRows.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.sectionLabel}>Conditions</Text>
                <View style={s.detailList}>
                  {statRows.map((row, i) => (
                    <View key={row.key} style={[s.detailRow, i === 0 && { borderTopWidth: 0 }]}>
                      <Text style={s.detailKey}>{row.key}</Text>
                      <Text style={s.detailVal}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {activityRows.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.sectionLabel}>Activity</Text>
                <View style={s.detailList}>
                  {activityRows.map((row, i) => (
                    <View key={row.key} style={[s.detailRow, i === 0 && { borderTopWidth: 0 }]}>
                      <Text style={s.detailKey}>{row.key}</Text>
                      <Text style={s.detailVal}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {(entry.highlight || entry.notes) && (
              <View style={{ gap: 8 }}>
                <Text style={s.sectionLabel}>Notes</Text>
                {entry.highlight ? (
                  <View style={s.highlightBox}>
                    <Ionicons name="sparkles-outline" size={13} color={T.accent} style={{ marginTop: 2 }} />
                    <Text style={s.highlightText}>"{entry.highlight}"</Text>
                  </View>
                ) : null}
                {entry.notes ? <Text style={s.notesText}>{entry.notes}</Text> : null}
              </View>
            )}

            {/* Hike stats + route (attached from a GPX upload in the log-visit wizard) */}
            {hasHike ? (
              <HikeStatsCard
                distanceMeters={entry.distance_meters}
                durationSeconds={entry.duration_seconds}
                elevationGainMeters={entry.elevation_gain_meters}
                routePolyline={entry.route_polyline}
              />
            ) : null}

            {/* Edit + delete */}
            <TouchableOpacity onPress={() => setEditing(true)} style={s.editEntryBtn}>
              <Ionicons name="pencil-outline" size={15} color={T.primary} />
              <Text style={[s.editEntryBtnText, { color: T.primary }]}>Edit entry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn}>
              <Ionicons name="trash-outline" size={15} color={DANGER} />
              <Text style={s.deleteBtnText}>Delete entry</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.screen} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'Edit Entry',
        headerRight: () => (
          <TouchableOpacity onPress={() => { setEditing(false); setDraft(entryToDraft(entry)); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 15, color: C.inkMute }}>Cancel</Text>
          </TouchableOpacity>
        ),
      }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: tabBarSpace + 24, gap: 22 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Park name (non-editable) */}
          <View style={s.editField}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14 }}>
              <Ionicons name="location" size={14} color={T.primary} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{entry.park_name ?? entry.park_code}</Text>
            </View>
          </View>

          {/* Title */}
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Title</Text>
            <TextInput
              value={draft.title} onChangeText={v => set('title', v)}
              placeholder="Give this visit a title…"
              placeholderTextColor={C.inkMute}
              style={s.editInput}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Dates */}
          <DateRow label="Visit date" value={draft.visited_date} onChange={d => set('visited_date', d ?? new Date())} />
          <DateRow label="End date"   value={draft.end_date}     onChange={d => set('end_date', d)} />

          {/* Crowds */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Crowds</Text>
            <ScaleInput value={draft.crowd} labels={CROWD_LABELS} onChange={v => set('crowd', v)} />
          </View>

          {/* Difficulty */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Difficulty</Text>
            <ScaleInput value={draft.difficulty} labels={DIFF_LABELS} onChange={v => set('difficulty', v)} />
          </View>

          {/* Weather */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Weather</Text>
            <MultiChips
              options={WEATHER_OPTS}
              selected={draft.weather_conditions}
              onChange={v => set('weather_conditions', v)}
            />
          </View>

          {/* Would return */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Would return?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RETURN_OPTS.map(opt => {
                const on = draft.would_return === opt.value;
                return (
                  <TouchableOpacity key={opt.value} onPress={() => set('would_return', on ? '' : opt.value)} style={[s.chip, on && s.chipOn]}>
                    <Ionicons name={opt.icon as any} size={14} color={on ? C.onPrimary : C.inkSoft} />
                    <Text style={[s.chipText, on && s.chipTextOn]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Activities — fixed chips + free-text add, same picker the
              log-visit wizard uses */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Activities</Text>
            <ActivityChips value={draft.activities} onChange={v => set('activities', v)} npsActivityNames={npsActivityNames} />
          </View>

          {/* Who came along */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Who came along?</Text>
            <CompanionSearch
              companions={draft.companions}
              companionObjs={draft.companionObjs}
              onChange={(ids, objs) => { set('companions', ids); set('companionObjs', objs); }}
              token={token}
            />
          </View>

          {/* Highlight */}
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Highlight</Text>
            <TextInput
              value={draft.highlight} onChangeText={v => set('highlight', v)}
              placeholder="Your best moment…"
              placeholderTextColor={C.inkMute}
              style={[s.editInput, { fontStyle: draft.highlight ? 'italic' : 'normal' }]}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Notes */}
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput
              value={draft.notes} onChangeText={v => set('notes', v)}
              placeholder="Trail conditions, tips, memories…"
              placeholderTextColor={C.inkMute}
              style={[s.editInput, s.editTextarea]}
              multiline textAlignVertical="top"
            />
          </View>

          {/* Caption */}
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Caption</Text>
            <TextInput
              value={draft.caption} onChangeText={v => set('caption', v)}
              placeholder="Short caption for social sharing…"
              placeholderTextColor={C.inkMute}
              style={s.editInput}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Photos */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Photos</Text>
            <PhotoStrip
              photos={draft.photos}
              cover={draft.cover_photo}
              onPhotosChange={v => set('photos', v)}
              onCoverChange={v => set('cover_photo', v)}
              token={token}
            />
          </View>

          {/* Visibility */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Visibility</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {VIS_OPTS.map(opt => {
                const on = (draft.visibility ?? 'private') === opt.value;
                return (
                  <TouchableOpacity key={opt.value} onPress={() => set('visibility', opt.value)} style={[s.chip, on && s.chipOn]}>
                    <Ionicons name={opt.icon as any} size={13} color={on ? C.onPrimary : C.inkSoft} />
                    <Text style={[s.chipText, on && s.chipTextOn]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save button */}
          <TouchableOpacity onPress={save} disabled={saving} style={[s.ctaBtn, saving && { opacity: 0.6 }]}>
            <Text style={s.ctaBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (T: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  heroPlaceholder: { width: W, height: 200, justifyContent: 'flex-end', padding: 16 },
  heroArrow: { position: 'absolute', left: 12, top: '50%', marginTop: -20 },
  heroArrowBg: {
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },

  // Floating header — 44pt circle recipe shared with park/[id]'s backBtn.
  floatBtn: {
    position: 'absolute',
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  heroDots: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  heroDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  heroDotOn: { backgroundColor: C.onPrimary },

  body: { padding: 16, paddingTop: 20, gap: 16 },

  parkLabel:  { fontSize: 13, fontWeight: '700', color: T.primary },
  entryTitle: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -0.5, lineHeight: 28 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 0.8, textTransform: 'uppercase' },
  detailList: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 14,
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 11,
    borderTopWidth: 0.5, borderTopColor: C.hairline,
  },
  detailKey: { fontSize: 13.5, fontWeight: '600', color: C.inkMute, width: 96 },
  detailVal: { flex: 1, fontSize: 13.5, color: C.ink, fontWeight: '500', lineHeight: 19 },

  highlightBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: C.surface, borderRadius: 12,
    borderLeftWidth: 3, borderLeftColor: T.accent,
    padding: 12, paddingLeft: 10,
  },
  highlightText: { flex: 1, fontSize: 14.5, fontStyle: 'italic', color: C.inkSoft, lineHeight: 22 },
  notesText: { fontSize: 14.5, color: C.inkSoft, lineHeight: 22 },

  editEntryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: C.hairline,
    backgroundColor: C.surface,
  },
  editEntryBtnText: { fontSize: 14, fontWeight: '600' },

  // Edit form
  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 0.8, textTransform: 'uppercase' },
  editField: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden',
  },
  editInput: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: C.ink,
  },
  editTextarea: { minHeight: 100, paddingTop: 12 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dateBtnText: { flex: 1, fontSize: 15, color: C.ink },

  scalePill: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
  },
  scalePillOn:     { backgroundColor: T.primary, borderColor: T.primary },
  scalePillText:   { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  scalePillTextOn: { color: C.onPrimary },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
  },
  chipOn:     { backgroundColor: T.primary, borderColor: T.primary },
  chipText:   { fontSize: 13, fontWeight: '500', color: C.inkSoft },
  chipTextOn: { color: C.onPrimary },

  // Photo strip
  stripThumb: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden' },
  stripCoverBtn: {
    position: 'absolute', top: 4, left: 4,
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  stripRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  stripAdd: {
    width: 80, height: 80, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: T.primary, alignItems: 'center', justifyContent: 'center',
  },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(192,57,43,0.25)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: DANGER },

  ctaBtn: {
    backgroundColor: T.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: C.onPrimary, letterSpacing: -0.1 },
});
