// Coarse mobile/tablet check gating deep-link attempts (the "Open in App"
// overlay, parkquest:// redirects) to devices that could plausibly have the
// app installed. Desktop browsers have nothing registered for the custom
// scheme — attempting it there is what made desktop Safari show "Safari
// cannot open the page because the address is invalid."
export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
