// Shared date formatting for visit/journal surfaces — one source of truth
// so every screen renders dates the same way.

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTHS_ABB = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "June 14, 2026" */
export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "June 14–16, 2026" / "Jun 30 – Jul 2, 2026" / "Dec 30, 2025 – Jan 2, 2026" */
export function fmtRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  if (!end) return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`;
  const e = new Date(end);
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth())
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

/** Inclusive number of days a visit spans; 1 when there is no end date. */
export function dayCount(start: string | null, end: string | null): number {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

/** Compact relative time for feed-style timestamps: "just now", "5m", "3h", "2d", then a date. */
export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
