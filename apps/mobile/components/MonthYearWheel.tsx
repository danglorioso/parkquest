import { useEffect, useRef, useState } from 'react';
import { FlatList, Text, View, type ColorValue } from 'react-native';
import * as Haptics from 'expo-haptics';

// Two-column month/year wheel styled after the native UIPickerView look (the
// wheel view you get by tapping the header of an inline UIDatePicker) — used
// when the exact day isn't known, so there's nothing for a day grid to show.
// The library's own DateTimePicker has no public prop/mode for that wheel
// (see IOSMode/IOSDisplay in its type defs), so this recreates it by hand:
// a shared pill highlight behind the center row, and rows fading out in
// opacity/scale the further they sit from center.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ITEM_H = 34;
const VISIBLE_ROWS = 7;
const PAD = Math.floor(VISIBLE_ROWS / 2) * ITEM_H;
const MONTH_COL_W = 170;
const YEAR_COL_W = 100;
const COL_GAP = 20;

function monthKey(y: number, m: number) { return y * 12 + m; }

// Continuous distance-from-center fade + slight vertical compression — the
// cheap approximation of UIPickerView's cylindrical perspective without a 3D
// transform or a masking dependency. `dist` is measured off the live scroll
// offset, not the (parent-controlled) settled selection, so the enlarged
// style follows the wheel immediately instead of lagging a beat behind while
// the picked value round-trips back down through props.
function rowStyle(dist: number, disabled: boolean, ink: ColorValue, inkMute: ColorValue) {
  const d = Math.min(dist, 3);
  const highlighted = dist < 0.5;
  // Apple's own wheel fades gradually enough that the 3rd row out (the very
  // edge of a 7-row window) still reads, just faint — the previous curve hit
  // near-zero by the 2nd row, which is what made this look shorter than it is.
  const opacity = (highlighted ? 1 : Math.max(0.22, 1 - d * 0.26)) * (disabled ? 0.4 : 1);
  const scaleY = 1 - d * 0.04;
  // Size grows continuously as a row nears center (t: 0 at dist>=1, 1 at
  // dist 0) instead of snapping between two fixed sizes at a distance
  // threshold — a discrete jump was exactly the "pops bigger" complaint.
  const t = Math.max(0, 1 - dist);
  const fontSize = 15 + 4 * t;
  return {
    opacity,
    transform: [{ scaleY }],
    fontSize,
    fontWeight: '400' as const,
    color: highlighted ? ink : inkMute,
  };
}

function WheelColumn({ items, selectedIndex, onSelect, width, ink, inkMute, minValidIndex = 0, maxValidIndex }: {
  items: string[]; selectedIndex: number; onSelect: (i: number) => void;
  width: number; ink: ColorValue; inkMute: ColorValue;
  // Indices outside [minValidIndex, maxValidIndex] render dimmer and can't be
  // scrolled to — e.g. months later in the year than maximumDate. Defaults to
  // the whole list (no disabled range) for the year column.
  minValidIndex?: number; maxValidIndex?: number;
}) {
  const maxIdx = maxValidIndex ?? items.length - 1;
  const listRef = useRef<FlatList<string>>(null);
  // Set while a touch owns the scroll — guards the sync effect below from
  // fighting a drag still in flight when `selectedIndex` is set from outside
  // (e.g. clamped against maximumDate by the other column).
  const userScrolling = useRef(false);
  // Live (fractional) scroll position, for a continuous center-fade while
  // dragging rather than one that only updates once the drag settles.
  const [liveCenter, setLiveCenter] = useState(selectedIndex);

  useEffect(() => {
    if (userScrolling.current) return;
    setLiveCenter(selectedIndex);
    listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);

  // Scrolling freely through a disabled (e.g. future) row is allowed — it's
  // only landing on one that's rejected, corrected here by springing back to
  // the nearest valid row once the drag settles rather than blocking the
  // scroll itself.
  const commit = (offsetY: number) => {
    userScrolling.current = false;
    const raw = Math.round(offsetY / ITEM_H);
    const idx = Math.max(minValidIndex, Math.min(maxIdx, raw));
    setLiveCenter(idx);
    listRef.current?.scrollToOffset({ offset: idx * ITEM_H, animated: true });
    if (idx !== selectedIndex) {
      Haptics.selectionAsync();
      onSelect(idx);
    }
  };

  return (
    <View style={{ height: ITEM_H * VISIBLE_ROWS, width, overflow: 'hidden' }}>
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
        scrollEventThrottle={16}
        onScroll={e => setLiveCenter(e.nativeEvent.contentOffset.y / ITEM_H)}
        onMomentumScrollEnd={e => commit(e.nativeEvent.contentOffset.y)}
        renderItem={({ item, index }) => {
          const dist = Math.abs(index - liveCenter);
          const disabled = index < minValidIndex || index > maxIdx;
          const st = rowStyle(dist, disabled, ink, inkMute);
          return (
            <View style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: st.fontSize, fontWeight: st.fontWeight, color: st.color, opacity: st.opacity, transform: st.transform }}>
                {item}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

export function MonthYearWheel({ value, minimumDate, maximumDate, onChange, highlightColor, ink, inkMute }: {
  value: Date;
  minimumDate?: Date;
  maximumDate: Date;
  onChange: (d: Date) => void;
  highlightColor: ColorValue;
  ink: ColorValue;
  inkMute: ColorValue;
}) {
  const minYear = minimumDate ? minimumDate.getFullYear() : maximumDate.getFullYear() - 100;
  const maxYear = maximumDate.getFullYear();
  const years = Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => String(minYear + i));

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

  // Months later in the year than maximumDate (or earlier than minimumDate's
  // month, in its year) render dimmed and are unreachable by scroll — see the
  // wall-clamp in WheelColumn.
  const minMonthIdx = minimumDate && year === minimumDate.getFullYear() ? minimumDate.getMonth() : 0;
  const maxMonthIdx = year === maxYear ? maximumDate.getMonth() : 11;

  return (
    <View style={{ width: MONTH_COL_W + COL_GAP + YEAR_COL_W, height: ITEM_H * VISIBLE_ROWS }}>
      <View pointerEvents="none" style={{
        position: 'absolute', top: PAD, left: 0, right: 0, height: ITEM_H,
        borderRadius: 12, backgroundColor: highlightColor,
      }} />
      <View style={{ flexDirection: 'row', gap: COL_GAP }}>
        <WheelColumn
          items={MONTH_NAMES} selectedIndex={month} width={MONTH_COL_W}
          ink={ink} inkMute={inkMute}
          minValidIndex={minMonthIdx} maxValidIndex={maxMonthIdx}
          onSelect={idx => clampAndEmit(year, idx)}
        />
        <WheelColumn
          items={years} selectedIndex={year - minYear} width={YEAR_COL_W}
          ink={ink} inkMute={inkMute}
          onSelect={idx => clampAndEmit(minYear + idx, month)}
        />
      </View>
    </View>
  );
}
