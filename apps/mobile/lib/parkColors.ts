// Deterministic per-park gradient, hashed from park_code.
// Single source of truth — matches web PostCard.tsx `parkGradient`.

export const PARK_GRADIENTS: [string, string, string][] = [
  ['#1F3D2E', '#2F7A4A', '#C56B3D'],
  ['#2D4F66', '#1F3D2E', '#D89A3A'],
  ['#7B3A1F', '#C56B3D', '#1F3D2E'],
  ['#3A2E5C', '#6E97A3', '#D89A3A'],
  ['#2F7A4A', '#1F3D2E', '#2D4F66'],
];

export function parkGradientIndex(code: string): number {
  return code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PARK_GRADIENTS.length;
}

/** Full three-stop gradient for hero banners and covers. */
export function parkGradient(code: string): [string, string, string] {
  return PARK_GRADIENTS[parkGradientIndex(code)];
}

/** First gradient stop — flat accent color for cards, dots, fallbacks. */
export function parkColor(code: string): string {
  return parkGradient(code)[0];
}
