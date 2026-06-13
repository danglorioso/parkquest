import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg:       '#F2EBDB',
  surface:  '#FFFBF1',
  ink:      '#1B1A16',
  inkSoft:  '#3C3A33',
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

export interface JournalEntry {
  visit_id: number;
  visited_date: string | null;
  park_code: string | null;
  park_name: string | null;
  title: string | null;
  notes: string | null;
  rating: number | null;
  activities: string[] | null;
  visibility: string | null;
  redacted: boolean;
}

function groupJournalByYearMonth(entries: JournalEntry[]) {
  const map = new Map<number, Map<number, JournalEntry[]>>();
  for (const e of entries) {
    if (!e.visited_date) continue;
    const d = new Date(e.visited_date);
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!map.has(y)) map.set(y, new Map());
    if (!map.get(y)!.has(m)) map.get(y)!.set(m, []);
    map.get(y)!.get(m)!.push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort(([a], [b]) => b - a)
        .map(([month, items]) => ({ month, items })),
    }));
}

function VisibilityPill({ vis }: { vis: string | null }) {
  if (!vis || vis === 'public') return null;
  const label = vis === 'friends' ? 'Friends only' : 'Private';
  const color = vis === 'private' ? '#9A6B4B' : '#5B8A96';
  return (
    <View style={{ backgroundColor: color + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 }}>
      <Text style={{ fontSize: 8.5, fontWeight: '600', color, letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
}

function StarRating({ n }: { n: number }) {
  return (
    <Text>
      {Array.from({ length: 5 }, (_, i) => (
        <Text key={i} style={{ fontSize: 11, color: i < n ? '#C49A28' : C.hairline }}>★</Text>
      ))}
    </Text>
  );
}

export function JournalTimeline({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No journal entries visible.</Text>
      </View>
    );
  }

  const groups = groupJournalByYearMonth(entries);

  return (
    <View>
      {groups.map(({ year, months }) => (
        <View key={year} style={styles.yearGroup}>
          <Text style={styles.yearLabel}>{year}</Text>
          {months.map(({ month, items }) => (
            <View key={month} style={styles.monthGroup}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthLabel}>{MONTH_NAMES[month]}</Text>
                <View style={styles.monthLine} />
              </View>
              <View style={styles.entriesContainer}>
                <View style={styles.verticalLine} />
                {items.map((entry, idx) => {
                  const d = new Date(entry.visited_date!);
                  const day = d.getDate();
                  const mon = MONTH_SHORT[d.getMonth()];
                  return (
                    <View
                      key={entry.visit_id}
                      style={[styles.entryRow, idx < items.length - 1 && styles.entryRowGap]}
                    >
                      <View style={[styles.dot, { backgroundColor: entry.redacted ? C.hairline : '#2F7A4A' }]} />
                      {entry.redacted ? (
                        <View style={[styles.card, styles.cardDashed]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.dateLabel}>{mon} {day}</Text>
                            <Ionicons name="lock-closed" size={10} color={C.inkMute} />
                            <Text style={styles.privateText}>Private visit</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.card}>
                          <View style={styles.cardTop}>
                            <View style={styles.cardTopLeft}>
                              <Text style={styles.dateLabel}>{mon} {day}</Text>
                              <Text style={styles.parkName} numberOfLines={1}>{entry.park_name}</Text>
                            </View>
                            <VisibilityPill vis={entry.visibility} />
                          </View>
                          {entry.title ? (
                            <Text style={styles.entryTitle}>"{entry.title}"</Text>
                          ) : null}
                          {(entry.rating || (entry.activities?.length ?? 0) > 0) ? (
                            <View style={styles.ratingRow}>
                              {entry.rating ? <StarRating n={entry.rating} /> : null}
                              {(entry.activities?.length ?? 0) > 0 ? (
                                <Text style={styles.activities} numberOfLines={1}>
                                  {entry.activities!.join(' · ')}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                          {entry.notes ? (
                            <Text style={styles.notes} numberOfLines={4}>{entry.notes}</Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: C.inkMute,
  },
  yearGroup: {
    marginBottom: 28,
  },
  yearLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  monthGroup: {
    marginBottom: 20,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 9,
    letterSpacing: 1.6,
    fontWeight: '700',
    color: C.inkMute,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  monthLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: C.hairline,
  },
  entriesContainer: {
    paddingLeft: 20,
    position: 'relative',
  },
  verticalLine: {
    position: 'absolute',
    left: 5,
    top: 6,
    bottom: 6,
    width: 1,
    backgroundColor: C.hairline,
  },
  entryRow: {
    position: 'relative',
  },
  entryRowGap: {
    marginBottom: 14,
  },
  dot: {
    position: 'absolute',
    left: -19,
    top: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: C.bg,
  },
  card: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 10,
    padding: 12,
  },
  cardDashed: {
    borderStyle: 'dashed',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flex: 1,
  },
  dateLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: '600',
    color: C.inkMute,
    flexShrink: 0,
  },
  parkName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    flex: 1,
  },
  privateText: {
    fontSize: 12.5,
    color: C.inkMute,
    fontStyle: 'italic',
  },
  entryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.inkSoft,
    fontStyle: 'italic',
    marginTop: 5,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  activities: {
    fontSize: 11,
    color: C.inkMute,
    flex: 1,
  },
  notes: {
    fontSize: 12.5,
    color: C.inkSoft,
    lineHeight: 20,
    marginTop: 5,
  },
});
