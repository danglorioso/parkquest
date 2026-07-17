import { Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');
// Taller than one screen so there's slack to reveal as passport.tsx
// parallax-shifts this background against scroll — see PARALLAX_FACTOR
// there. Not full-content-height tileable (that needs a seamlessly
// wrapping pattern keyed off scrollY % tileHeight); this buffer just
// covers a few screens' worth of normal scrolling.
const PARALLAX_BUFFER = 2.4;
const CONTENT_H = H * PARALLAX_BUFFER;

// Same wave formula/unit scale as the cover art (360 units wide).
const VB_W = 360;
const VB_H = Math.ceil(VB_W * (CONTENT_H / W));
const STEP = 26;

const waveD = (y: number) =>
  `M-20 ${y} C 40 ${y - 12}, 80 ${y + 12}, 120 ${y} S 200 ${y - 12}, 240 ${y} S 320 ${y + 12}, 380 ${y}`;

const WAVE_YS: number[] = [];
for (let y = 0; y <= VB_H; y += STEP) WAVE_YS.push(y);

// Cheap security-print watermark so the paper pages read as passport paper,
// not blank white. Rows above it drop their own opaque background so it
// shows through. Sized taller than the screen (not "100%") so the parent's
// scroll-linked translateY has real pattern to reveal instead of empty gap.
export function PassportWatermark() {
  return (
    <Svg
      width="100%"
      height={CONTENT_H}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CONTENT_H }}
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
    >
      {WAVE_YS.map((y, i) => (
        <Path key={i} d={waveD(y)} stroke="rgba(58,46,28,0.05)" strokeWidth={1} fill="none" />
      ))}
    </Svg>
  );
}
