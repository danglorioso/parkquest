import { useWindowDimensions } from 'react-native';

// iPad mini portrait (744pt) is the narrowest real iPad — comfortably above
// any iPhone's portrait width (max ~430pt, Pro Max) since the app is
// portrait-locked (app.json orientation: "portrait"), so this only trips on
// iPad-class screens, not a wide iPhone. Width-based rather than
// Platform.isPad so Split View/Slide Over at a narrow width correctly falls
// back to one column instead of cramming a grid into a slice of the screen.
const GRID_BREAKPOINT = 700;
// Gap between grid columns/rows and the two cards' combined width can't
// exceed the container width, so each column is (100% - gap) / 2 wide —
// callers multiply this fraction by their own content width.
export const FEED_GRID_GAP = 16;

// Feed-style post lists (main feed, profile posts, park community posts) go
// two-up at iPad width instead of one full-width column — a single post's
// photo filling the whole iPad screen was too large to see a full post
// without scrolling. Returns 1 on phones/narrow Split View, 2 at iPad width.
export function useFeedColumns(): 1 | 2 {
  const { width } = useWindowDimensions();
  return width >= GRID_BREAKPOINT ? 2 : 1;
}
