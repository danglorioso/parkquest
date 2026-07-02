import {
  Alert, Dimensions, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

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
  accent:     '#C56B3D',
  danger:     '#C0392B',
};

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

const ALL_ACTIVITIES = [
  'hiking','camping','backpacking','climbing','kayaking',
  'rafting','fishing','diving','wildlife','photography',
  'stargazing','tours','cycling','mountaineering',
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
  rating: number | null;
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
}

interface Draft {
  title: string;
  visited_date: Date;
  end_date: Date | null;
  rating: number;
  crowd: number;
  difficulty: number;
  weather_conditions: string[];
  activities: string[];
  would_return: string;
  highlight: string;
  notes: string;
  photos: string[];
  cover_photo: string | null;
  visibility: string;
  caption: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_ABB = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  if (!end) return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`;
  const e = new Date(end);
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth())
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

function dayCount(start: string | null, end: string | null): number {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const GRADIENTS = ['#1F3D2E','#2D4F66','#7B3A1F','#3A2E5C','#2F7A4A'];
function gradientColor(code: string): string {
  return GRADIENTS[code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < Math.round(value) ? 'star' : 'star-outline'} size={size} color={C.accent} />
      ))}
    </View>
  );
}

function RatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <TouchableOpacity key={i} onPress={() => onChange(i + 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Ionicons name={i < value ? 'star' : 'star-outline'} size={26} color={C.accent} />
        </TouchableOpacity>
      ))}
      {value > 0 && (
        <TouchableOpacity onPress={() => onChange(0)} style={{ marginLeft: 4 }}>
          <Text style={{ fontSize: 13, color: C.inkMute }}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ScaleInput({ value, labels, onChange }: { value: number; labels: string[]; onChange: (n: number) => void }) {
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

function ActivityChips({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <MultiChips
      options={ALL_ACTIVITIES.map(a => ({ value: a, label: capitalize(a) }))}
      selected={selected}
      onChange={onChange}
    />
  );
}

// ── Photo section (view mode) ─────────────────────────────────────────────────

function PhotoHero({ photos, cover }: { photos: string[]; cover: string | null }) {
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
              style={s.heroArrow}
              onPress={() => setIdx(i => (i - 1 + photos.length) % photos.length)}
              disabled={idx === 0}
            >
              <View style={[s.heroArrowBg, idx === 0 && { opacity: 0.3 }]}>
                <Ionicons name="chevron-back" size={18} color="#FFFBF1" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.heroArrow, { right: 12, left: undefined }]}
              onPress={() => setIdx(i => (i + 1) % photos.length)}
              disabled={idx === photos.length - 1}
            >
              <View style={[s.heroArrowBg, idx === photos.length - 1 && { opacity: 0.3 }]}>
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
        const ext  = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
        const name = `journal-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const pr = await fetch(`${BASE}/api/upload/presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ filename: name }),
        });
        if (!pr.ok) continue;
        const { uploadUrl, publicUrl } = await pr.json();
        const blob = await fetch(asset.uri).then(r => r.blob());
        await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
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
                <Ionicons name={cover === uri ? 'star' : 'star-outline'} size={12} color="#FFFBF1" />
              </TouchableOpacity>
              {/* Remove */}
              <TouchableOpacity style={s.stripRemoveBtn} onPress={() => remove(uri)}>
                <Ionicons name="close-circle" size={18} color="#FFFBF1" />
              </TouchableOpacity>
            </View>
          ))}

          {photos.length < 5 && (
            <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={s.stripAdd}>
              {uploading
                ? <Ionicons name="cloud-upload-outline" size={22} color={C.primary} />
                : <Ionicons name="add-circle-outline" size={22} color={C.primary} />}
              <Text style={{ fontSize: 13, color: C.primary, fontWeight: '600', marginTop: 4 }}>
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
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={s.dateBtn}>
        <Ionicons name="calendar-outline" size={15} color={C.primary} />
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
          accentColor={C.primary}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const router = useRouter();

  const [entry,   setEntry]   = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [token,   setToken]   = useState('');

  const [draft, setDraft] = useState<Draft>({
    title: '', visited_date: new Date(), end_date: null, rating: 0,
    crowd: 0, difficulty: 0, weather_conditions: [], activities: [],
    would_return: '', highlight: '', notes: '', photos: [],
    cover_photo: null, visibility: 'private', caption: '',
  });

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
      const found = all.find(e => String(e.id) === String(id));
      if (found) {
        setEntry(found);
        setDraft(entryToDraft(found));
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
      rating:             e.rating ?? 0,
      crowd:              e.crowd ?? 0,
      difficulty:         e.difficulty ?? 0,
      weather_conditions: e.weather_conditions ?? [],
      activities:         e.activities ?? [],
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
        rating:            draft.rating || null,
        crowd:             draft.crowd || null,
        difficulty:        draft.difficulty || null,
        weather:           draft.weather_conditions,
        activities:        draft.activities,
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
      `Delete your ${entry.park_name ?? entry.park_code} journal entry? This cannot be undone.`,
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
    const visIcon  = visKey === 'public' ? 'globe-outline' : visKey === 'friends' ? 'people-outline' : 'lock-closed-outline';
    const visColor = visKey === 'public' ? '#2F7A4A' : visKey === 'friends' ? C.primary : C.inkMute;
    const weatherLabels = (entry.weather_conditions ?? []).map(
      v => WEATHER_OPTS.find(o => o.value === v)?.label ?? v
    );
    const placeholderBg = gradientColor(entry.park_code);

    return (
      <SafeAreaView style={s.screen} edges={['bottom']}>
        <Stack.Screen options={{
          title: entry.park_name ?? entry.park_code,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(modals)/log-visit', params: { visitId: String(entry.id) } } as never)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="create-outline" size={22} color={C.primary} />
            </TouchableOpacity>
          ),
        }} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
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
            {/* Park + state */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="location" size={12} color={C.primary} />
              <Text style={s.parkLabel}>
                {entry.park_name ?? entry.park_code}
                {entry.states ? <Text style={{ color: C.inkMute }}> · {entry.states}</Text> : null}
              </Text>
            </View>

            {/* Title */}
            <Text style={s.entryTitle}>{title}</Text>

            {/* Metadata row */}
            <View style={s.metaRow}>
              <Text style={s.metaText}>{fmtRange(entry.visited_date, entry.end_date)}</Text>
              {days > 1 && (
                <>
                  <View style={s.metaDivider} />
                  <View style={s.daysBadge}>
                    <Text style={s.daysBadgeText}>{days} days</Text>
                  </View>
                </>
              )}
              {entry.rating ? (
                <>
                  <View style={s.metaDivider} />
                  <Stars value={entry.rating} size={13} />
                </>
              ) : null}
              <View style={s.metaDivider} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name={visIcon as any} size={12} color={visColor} />
                <Text style={[s.metaText, { color: visColor }]}>{capitalize(visKey)}</Text>
              </View>
            </View>

            {/* Caption */}
            {entry.caption ? (
              <Text style={{ fontSize: 14, color: C.inkSoft, lineHeight: 21, marginTop: 4 }}>{entry.caption}</Text>
            ) : null}

            {/* Highlight */}
            {entry.highlight ? (
              <View style={s.highlightBox}>
                <Ionicons name="sparkles-outline" size={13} color={C.accent} style={{ marginTop: 2 }} />
                <Text style={s.highlightText}>"{entry.highlight}"</Text>
              </View>
            ) : null}

            {/* Conditions */}
            {(entry.crowd || entry.difficulty || weatherLabels.length > 0 || entry.would_return) ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Conditions</Text>
                <View style={{ gap: 8 }}>
                  {entry.crowd ? (
                    <View style={s.condRow}>
                      <Text style={s.condKey}>Crowds</Text>
                      <Text style={s.condVal}>{CROWD_LABELS[(entry.crowd ?? 1) - 1]}</Text>
                    </View>
                  ) : null}
                  {entry.difficulty ? (
                    <View style={s.condRow}>
                      <Text style={s.condKey}>Difficulty</Text>
                      <Text style={s.condVal}>{DIFF_LABELS[(entry.difficulty ?? 1) - 1]}</Text>
                    </View>
                  ) : null}
                  {weatherLabels.length > 0 ? (
                    <View style={s.condRow}>
                      <Text style={s.condKey}>Weather</Text>
                      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                        {weatherLabels.map(l => (
                          <View key={l} style={s.viewChip}><Text style={s.viewChipText}>{l}</Text></View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {entry.would_return ? (
                    <View style={s.condRow}>
                      <Text style={s.condKey}>Would return</Text>
                      <Text style={s.condVal}>{capitalize(entry.would_return)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Activities */}
            {(entry.activities?.length ?? 0) > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Activities</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {entry.activities!.map(a => (
                    <View key={a} style={s.viewChip}><Text style={s.viewChipText}>{capitalize(a)}</Text></View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Notes */}
            {entry.notes ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Notes</Text>
                <Text style={{ fontSize: 14.5, color: C.inkSoft, lineHeight: 22 }}>{entry.notes}</Text>
              </View>
            ) : null}

            {/* Delete */}
            <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn}>
              <Ionicons name="trash-outline" size={15} color={C.danger} />
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60, gap: 22 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Park name (non-editable) */}
          <View style={s.editField}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14 }}>
              <Ionicons name="location" size={14} color={C.primary} />
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

          {/* Rating */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Rating</Text>
            <RatingInput value={draft.rating} onChange={v => set('rating', v)} />
          </View>

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
                    <Ionicons name={opt.icon as any} size={14} color={on ? '#FFFBF1' : C.inkSoft} />
                    <Text style={[s.chipText, on && s.chipTextOn]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Activities */}
          <View style={{ gap: 8 }}>
            <Text style={s.fieldLabel}>Activities</Text>
            <ActivityChips selected={draft.activities} onChange={v => set('activities', v)} />
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
                    <Ionicons name={opt.icon as any} size={13} color={on ? '#FFFBF1' : C.inkSoft} />
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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  heroPlaceholder: { width: W, height: 200, justifyContent: 'flex-end', padding: 16 },
  heroArrow: { position: 'absolute', left: 12, top: '50%', marginTop: -20 },
  heroArrowBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroDots: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  heroDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  heroDotOn: { backgroundColor: '#FFFBF1' },

  body: { padding: 16, paddingTop: 20, gap: 16 },

  parkLabel:  { fontSize: 13, fontWeight: '700', color: C.primary },
  entryTitle: { fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -0.5, lineHeight: 28 },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaText: { fontSize: 13, color: C.inkMute },
  metaDivider: { width: 1, height: 12, backgroundColor: C.hairline },
  daysBadge: { backgroundColor: C.surfaceAlt, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  daysBadgeText: { fontSize: 13, fontWeight: '700', color: C.accent },

  highlightBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: C.surface, borderRadius: 12,
    borderLeftWidth: 3, borderLeftColor: C.accent,
    padding: 12, paddingLeft: 10,
  },
  highlightText: { flex: 1, fontSize: 14.5, fontStyle: 'italic', color: C.inkSoft, lineHeight: 22 },

  section:      { gap: 10, paddingTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 0.8, textTransform: 'uppercase' },
  condRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  condKey:      { fontSize: 13.5, color: C.inkMute, width: 96 },
  condVal:      { fontSize: 13.5, color: C.ink, fontWeight: '600' },

  viewChip: {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  viewChipText: { fontSize: 13, color: C.inkSoft, fontWeight: '500' },

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
  scalePillOn:     { backgroundColor: C.primary, borderColor: C.primary },
  scalePillText:   { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  scalePillTextOn: { color: '#FFFBF1' },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
  },
  chipOn:     { backgroundColor: C.primary, borderColor: C.primary },
  chipText:   { fontSize: 13, fontWeight: '500', color: C.inkSoft },
  chipTextOn: { color: '#FFFBF1' },

  // Photo strip
  stripThumb:     { width: 80, height: 80, borderRadius: 8, overflow: 'hidden' },
  stripCoverBtn:  { position: 'absolute', top: 4, left: 4, padding: 2 },
  stripRemoveBtn: { position: 'absolute', top: 2, right: 2 },
  stripAdd: {
    width: 80, height: 80, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(192,57,43,0.25)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: C.danger },

  ctaBtn: {
    backgroundColor: C.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFBF1', letterSpacing: -0.1 },
});
