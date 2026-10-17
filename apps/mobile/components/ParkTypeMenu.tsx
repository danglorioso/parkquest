import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
import { PARK_TYPES } from '@/lib/parkTypes';
import { STATIC as C, dyn } from '@/lib/palette';

// "Showing: National Parks ⌄" — the park-designation picker for the parks
// list and the map. Replaced a horizontally scrolling chip row on both: with
// eight long labels only about two chips fit on screen, nothing hinted that
// the row scrolled, and what was currently switched on was mostly off-screen.
// A native pull-down (same control as the parks list's Sort menu) puts every
// option and its count in view on one tap, and the pill always reads back
// what's showing.
//
// Picking is one-of: "All" or a single designation. The screens still hold a
// SET of enabled types, because the saved default (Profile → Appearance) and
// the map's Map Details checklist can switch on any combination — that's
// what the "3 types" label and the multiple checkmarks are for.

const ALL = '__all__';

export function ParkTypeMenu({ enabled, counts, onSelectOnly, onSelectAll, floating = false }: {
  enabled: Set<string>;
  /** Parks per PARK_TYPES key, shown beside each option. */
  counts: Record<string, number>;
  /** Show this one designation and nothing else. */
  onSelectOnly: (key: string) => void;
  onSelectAll: () => void;
  /** Over the map: one self-contained pill with the map chrome's translucent
      fill and shadow, "Showing:" inside it — loose text on map tiles is
      unreadable. Otherwise the label sits beside a flat pill. */
  floating?: boolean;
}) {
  const on = PARK_TYPES.filter(t => enabled.has(t.key));
  const allOn = on.length === PARK_TYPES.length;
  const value =
    allOn ? 'All'
    : on.length === 1 ? on[0].label
    : on.length === 0 ? 'None'
    : `${on.length} types`;
  const total = PARK_TYPES.reduce((n, t) => n + (counts[t.key] ?? 0), 0);

  return (
    <View style={st.row}>
      {!floating && <Text style={st.label}>Showing:</Text>}
      <MenuView
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === ALL) onSelectAll();
          else onSelectOnly(nativeEvent.event);
        }}
        actions={[
          { id: ALL, title: `All (${total})`, state: allOn ? 'on' : 'off' },
          ...PARK_TYPES.map(t => ({
            id: t.key,
            title: `${t.label} (${counts[t.key] ?? 0})`,
            // With everything on, only "All" is checked — eight checkmarks say less than one
            state: !allOn && enabled.has(t.key) ? 'on' as const : 'off' as const,
          })),
        ]}
      >
        <View style={[st.pill, floating && st.pillFloating]}>
          {floating && <Text style={st.label}>Showing:</Text>}
          <Text style={st.value} numberOfLines={1}>{value}</Text>
          <Ionicons name="chevron-down" size={13} color={C.inkMute} />
        </View>
      </MenuView>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: C.inkMute },
  // Height matches the chip row this replaced — the map's offline banner is
  // positioned off it.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  pillFloating: {
    backgroundColor: dyn('rgba(255,251,241,0.93)', 'rgba(32,29,23,0.93)'),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  value: { fontSize: 13, fontWeight: '600', color: C.ink },
});
