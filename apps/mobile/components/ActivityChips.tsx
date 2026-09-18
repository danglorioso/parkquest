import { View, Text, TextInput, TouchableOpacity, Keyboard, StyleSheet } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C, useColors } from '@/lib/palette';

export const ALL_ACTIVITIES = [
  'hiking', 'camping', 'backpacking', 'climbing', 'kayaking', 'rafting', 'fishing',
  'diving', 'wildlife', 'photography', 'sightseeing', 'stargazing', 'tours', 'cycling', 'mountaineering',
];

// Shared activity picker — fixed chips + free-text add (normalized against
// the standard list, deduped case-insensitively) + NPS-name autocomplete.
// Used by the log-visit wizard's own step and the journal entry edit
// screen, so tagging activities looks and works identically wherever you
// do it — including going beyond the fixed set, not just toggling it.
export function ActivityChips({ value, onChange, npsActivityNames = [] }: {
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
                    Add "{customQ.trim()}"
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

const styles = StyleSheet.create({
  activityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100, borderWidth: 0.5,
  },
  activityChipText: {
    fontSize: 13, fontWeight: '600', textTransform: 'capitalize',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 14, padding: 13,
    borderWidth: 0.5, borderColor: C.hairline, marginBottom: 6,
  },
  searchInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: C.ink, padding: 0,
  },
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
});
