import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/palette';

// Shared between the profile screen's own small passport card and the
// full-size cover in components/PassportBackdrop.tsx (the permanent layer
// that sits behind the profile screen) — used to be two separately
// hand-maintained copies of this markup, and they drifted (different font
// sizes, margins, alpha values, a fixed-vs-centered bio, a stat grid sized
// off the full screen width instead of its own container) until tapping
// the card produced a visible "jump" between them. One component, one set
// of styles, makes that class of bug structurally impossible.

const GOLD = '#F0C550';
// Matches the card's own passportCard paddingHorizontal exactly.
const PADDING_H = 20;
const STAT_ROW_H = 52;

export interface PassportFaceStatItem {
  label: string;
  value: string;
  onPress?: () => void;
}

type AnimatedNumber = Animated.Value | Animated.AnimatedInterpolation<number>;

export interface PassportFaceProps {
  avatarUrl: string | null;
  name: string | null;
  username: string | null;
  joinDate: string | null;
  bio: string | null;
  /** Exactly 4 — pre-formatted by the caller (each screen has its own
      loading-placeholder rules, e.g. the card shows "–" for a stat whose
      own fetch hasn't resolved yet, which the expand view never needs to). */
  statItems: PassportFaceStatItem[];
  /** Pre-formatted, e.g. "12 of 63 parks stamped" or "Loading…". */
  progressLabel: string;
  /** 0-100. */
  progressPct: number;
  mrzLine1: string;
  mrzLine2: string;
  /** The current rendered width of this component's own outer box — the
      stat grid sizes itself as a fraction of this rather than assuming a
      fixed screen width, so it always matches whatever box is actually on
      screen (including mid-animation, while the passport-expand overlay's
      hero is still growing from card size to full screen). Pass a plain
      `new Animated.Value(width)` for a box that never resizes (the card). */
  containerWidth: AnimatedNumber;
  /** 0 = full 2×2 stat grid with bio/progress/MRZ all visible, 1 =
      collapsed to a single stat row with those three faded away. Pass a
      plain `new Animated.Value(0)` for a face that never collapses (the
      card). */
  collapseFrac: AnimatedNumber;
  onAvatarPress?: () => void;
}

export function PassportFace({
  avatarUrl, name, username, joinDate, bio, statItems, progressLabel, progressPct, mrzLine1, mrzLine2,
  containerWidth, collapseFrac, onAvatarPress,
}: PassportFaceProps) {
  const T = useColors();

  const contentWidth = Animated.subtract(containerWidth, PADDING_H * 2);
  const halfW = Animated.multiply(contentWidth, 0.5);
  const quarterW = Animated.multiply(contentWidth, 0.25);
  // Splits the collapse into two non-overlapping phases so a row-1 item's
  // path is a clean L, not a diagonal: every item's horizontal move
  // finishes by the midpoint (settleEarly reaches 1 at collapseFrac=0.5,
  // then holds), and only after that — once every item is already parked
  // in its own non-overlapping final column — do row-1 items rise into
  // row 0 (riseLate stays 0 until 0.5, then 0→1). A single linear
  // collapseFrac driving X and Y together let a rising row-1 item cross
  // directly through row 0 while its own column was still mid-transit,
  // visibly overlapping whichever row-0 item hadn't finished narrowing
  // out of the way yet.
  const settleEarly = collapseFrac.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] });
  const riseLate = collapseFrac.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const itemWidth = Animated.subtract(halfW, Animated.multiply(quarterW, settleEarly));
  // Shrinks proportionally with the collapse so the text never ends up
  // sized for the old 2×2 grid but squeezed into the much shorter
  // collapsed row — without this it was still full-size right up against
  // the row's (and the cover's) own bottom edge.
  const statLabelSize = collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [13, 9] });
  const statValSize = collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [26, 16] });

  const statsRowStyle = {
    transform: [{ translateY: collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [0, bio ? -55 : 0] }) }],
    marginTop: collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [14, 12] }),
    paddingTop: collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [12, 8] }),
    height: collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [STAT_ROW_H * 2, STAT_ROW_H * 0.7] }),
  };
  // Bio / progress bar / MRZ footer — none of them fit once collapsed, so
  // they fade out (on top of getting clipped away regardless, since the
  // stat grid slides up past them as it collapses).
  const fadeAwayStyle = { opacity: collapseFrac.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };

  const statItemStyle = (i: number) => {
    const row = Math.floor(i / 2);
    const expandedX = Animated.multiply(halfW, i % 2);
    const collapsedX = Animated.multiply(quarterW, i);
    const translateX = Animated.add(expandedX, Animated.multiply(Animated.subtract(collapsedX, expandedX), settleEarly));
    const translateY = row === 0 ? 0 : Animated.multiply(STAT_ROW_H, Animated.subtract(1, riseLate));
    return { width: itemWidth, transform: [{ translateX }, { translateY }] };
  };

  const avatarContent = avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={st.avatarInner} />
  ) : (
    <View style={[st.avatarInner, st.avatarFallback, { backgroundColor: T.primary }]}>
      {name ? (
        <Text style={st.avatarInitial}>{name[0].toUpperCase()}</Text>
      ) : (
        <Ionicons name="person" size={30} color="rgba(255,251,241,0.45)" />
      )}
    </View>
  );

  return (
    <View style={{ alignItems: 'center' }}>
      {onAvatarPress ? (
        <TouchableOpacity
          style={[st.avatarWrap, { borderColor: T.hairline, backgroundColor: T.surface }]}
          activeOpacity={avatarUrl ? 0.85 : 1}
          disabled={!avatarUrl}
          onPress={onAvatarPress}
        >
          {avatarContent}
        </TouchableOpacity>
      ) : (
        <View style={[st.avatarWrap, { borderColor: T.hairline, backgroundColor: T.surface }]}>
          {avatarContent}
        </View>
      )}

      <Text style={st.name} numberOfLines={1} adjustsFontSizeToFit>{name ?? 'Explorer'}</Text>
      {username ? <Text style={st.handle}>@{username}</Text> : null}
      {joinDate ? <Text style={st.joined}>Joined {joinDate}</Text> : null}

      {bio ? <Animated.Text style={[st.bio, fadeAwayStyle]}>{bio}</Animated.Text> : null}

      <Animated.View style={[st.statsRow, statsRowStyle]}>
        {statItems.map((sItem, i) => {
          const label = (
            <Animated.Text style={[st.statLabel, { fontSize: statLabelSize }]} numberOfLines={1}>{sItem.label}</Animated.Text>
          );
          const value = (
            <Animated.Text
              style={[st.statVal, { fontSize: statValSize }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {sItem.value}
            </Animated.Text>
          );
          return (
            <Animated.View key={sItem.label} style={[st.statItem, statItemStyle(i)]}>
              {sItem.onPress ? (
                <TouchableOpacity activeOpacity={0.6} onPress={sItem.onPress}>
                  {label}
                  {value}
                </TouchableOpacity>
              ) : (
                <>
                  {label}
                  {value}
                </>
              )}
            </Animated.View>
          );
        })}
      </Animated.View>

      <Animated.View style={[fadeAwayStyle, { width: '100%' }]}>
        <View style={st.progressWrap}>
          <Text style={st.progressText}>{progressLabel}</Text>
          <View style={st.progressTrack}>
            <View style={[st.progressFill, { width: `${progressPct}%` as `${number}%` }]} />
          </View>
        </View>

        <View style={st.footer}>
          <Text style={st.mrzText} numberOfLines={1}>{mrzLine1}</Text>
          <Text style={st.mrzText} numberOfLines={1}>{mrzLine2}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  avatarWrap: {
    padding: 1.5,
    borderRadius: 50,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarInner: { width: 84, height: 84, borderRadius: 42, overflow: 'hidden' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 30, fontWeight: '900', color: GOLD },
  name: {
    width: '100%', fontSize: 26, fontWeight: '800', color: GOLD, letterSpacing: -0.5, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  handle: { fontSize: 13, fontWeight: '600', color: 'rgba(201,169,74,0.85)', letterSpacing: 0.8, marginTop: 3, textAlign: 'center' },
  joined: { fontSize: 13, color: 'rgba(201,169,74,0.8)', marginTop: 8, textAlign: 'center' },
  bio: { fontSize: 13.5, color: 'rgba(255,251,241,0.75)', lineHeight: 19, marginTop: 12 },
  statsRow: {
    position: 'relative', width: '100%',
    borderTopWidth: 0.5, borderTopColor: 'rgba(201,169,74,0.2)',
  },
  statItem: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },
  statLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(201,169,74,0.8)', letterSpacing: 1.2, textAlign: 'center' },
  statVal: {
    fontSize: 26, fontWeight: '800', color: GOLD, marginTop: 2, letterSpacing: -0.3, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  progressWrap: { gap: 6, marginTop: 18, marginBottom: 10 },
  progressText: { fontSize: 11, fontWeight: '600', color: GOLD, opacity: 0.7, letterSpacing: 0.5 },
  progressTrack: { height: 3, backgroundColor: GOLD + '22', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: GOLD, borderRadius: 2, opacity: 0.85 },
  footer: { marginTop: 2, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(201,169,74,0.15)' },
  mrzText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9, color: 'rgba(201,169,74,0.35)', letterSpacing: 1.5, lineHeight: 14,
  },
});
