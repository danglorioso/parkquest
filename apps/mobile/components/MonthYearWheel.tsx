import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Text, View, type ColorValue } from 'react-native';
import * as Haptics from 'expo-haptics';

// Two-column month/year wheel, styled to match the native inline
// DateTimePicker's own month/year wheel (the one you get by tapping its
// "September 2026" header) — used when the exact day isn't known, so there's
// nothing for a day grid to show.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const PAD = Math.floor(VISIBLE_ROWS / 2) * ITEM_H;

function monthKey(y: number, m: number) { return y * 12 + m; }

function WheelColumn({ items, selectedIndex, onSelect, width, accentColor, ink, inkMute }: {
  items: string[]; selectedIndex: number; onSelect: (i: number) => void;
  width: number; accentColor: string; ink: ColorValue; inkMute: ColorValue;
}) {
  const listRef = useRef<FlatList<string>>(null);
  // Set while a touch owns the scroll — guards the sync effect below from
  // fighting a drag still in flight when `selectedIndex` is set from outside
  // (e.g. clamped against maximumDate by the other column).
  const userScrolling = useRef(false);

  useEffect(() => {
    if (userScrolling.current) return;
    listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);

  const commit = (offsetY: number) => {
    userScrolling.current = false;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / ITEM_H)));
    if (idx !== selectedIndex) {
      Haptics.selectionAsync();
      onSelect(idx);
    } else {
      listRef.current?.scrollToOffset({ offset: idx * ITEM_H, animated: true });
    }
  };

  return (
    <View style={{ height: ITEM_H * VISIBLE_ROWS, width }}>
      <View pointerEvents="none" style={{
        position: 'absolute', top: PAD, left: 0, right: 0, height: ITEM_H,
        borderTopWidth: 1, borderBottomWidth: 1, borderColor: accentColor,
        backgroundColor: `${accentColor}14`,
      }} />
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        initialScrollIndex={selectedIndex}
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
        contentContainerStyle={{ paddingVertical: PAD }}
        onScrollBeginDrag={() => { userScrolling.current = true; }}
        onMomentumScrollEnd={e => commit(e.nativeEvent.contentOffset.y)}
        renderItem={({ item, index }) => {
          const on = index === selectedIndex;
          return (
            <View style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: on ? 19 : 16, fontWeight: on ? '700' : '400', color: on ? ink : inkMute }}>
                {item}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

export function MonthYearWheel({ value, minimumDate, maximumDate, onChange, accentColor, ink, inkMute }: {
  value: Date;
  minimumDate?: Date;
  maximumDate: Date;
  onChange: (d: Date) => void;
  accentColor: string;
  ink: ColorValue;
  inkMute: ColorValue;
}) {
  const minYear = minimumDate ? minimumDate.getFullYear() : maximumDate.getFullYear() - 100;
  const maxYear = maximumDate.getFullYear();
  const years = useMemo(
    () => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => String(minYear + i)),
    [minYear, maxYear],
  );

  const month = value.getMonth();
  const year = value.getFullYear();

  const minKey = minimumDate ? monthKey(minimumDate.getFullYear(), minimumDate.getMonth()) : -Infinity;
  const maxKey = monthKey(maximumDate.getFullYear(), maximumDate.getMonth());

  const clampAndEmit = (y: number, m: number) => {
    const key = Math.min(maxKey, Math.max(minKey, monthKey(y, m)));
    const cy = Math.floor(key / 12);
    const cm = ((key % 12) + 12) % 12;
    onChange(new Date(cy, cm, 1));
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
      <WheelColumn
        items={MONTH_NAMES} selectedIndex={month} width={170}
        accentColor={accentColor} ink={ink} inkMute={inkMute}
        onSelect={idx => clampAndEmit(year, idx)}
      />
      <WheelColumn
        items={years} selectedIndex={year - minYear} width={90}
        accentColor={accentColor} ink={ink} inkMute={inkMute}
        onSelect={idx => clampAndEmit(minYear + idx, month)}
      />
    </View>
  );
}
