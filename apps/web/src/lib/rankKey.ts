// Fractional/lexicographic ranking keys (Trello/Figma-style) — inserting a visit
// between two already-ranked ones only ever writes the new row's key, never
// rewrites its neighbors. Keys are base62 strings; string comparison order
// matches numeric order because every generated key is left-padded to compare
// correctly against its siblings (see midpointKey below).

import { sql, type SQL } from 'drizzle-orm';
import { visits } from '@/lib/db/schema';

// Correlated-subquery version of packages/types' deriveRankScore, for SELECTs
// that join `visits` alongside other tables (feed/post cards) and only have
// one row of a user's list in scope — computes that row's 0-10 score from its
// position among the SAME user's other ranked visits, entirely in SQL. Only
// needed where the full list isn't already loaded in JS (see rank_key/JS-side
// deriveRankScore usage in users/[username]/route.ts's `journal` mapping for
// the alternative when it is).
export function visitRankScoreSql(): SQL<number | null> {
  return sql<number | null>`(
    SELECT 10.0 * POWER(
      1.0 - (r.rn - 1)::float / GREATEST(r.cnt - 1, 1),
      0.7
    )
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY rank_key) AS rn, COUNT(*) OVER () AS cnt
      FROM visits
      WHERE clerk_user_id = ${visits.clerk_user_id} AND rank_key IS NOT NULL
    ) r
    WHERE r.id = ${visits.id}
  )`;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;
const MIN_CHAR = ALPHABET[0];
const MAX_CHAR = ALPHABET[BASE - 1];
const MID_CHAR = ALPHABET[Math.floor(BASE / 2)];

function charIndex(c: string): number {
  return ALPHABET.indexOf(c);
}

/**
 * Returns a key strictly between `before` and `after` (either may be null,
 * meaning "start of the list" / "end of the list"). Pass both null for the
 * very first ranked item.
 */
export function midpointKey(before: string | null, after: string | null): string {
  if (before === null && after === null) return MID_CHAR;
  if (before === null) return beforeKey(after!);
  if (after === null) return afterKey(before);
  return between(before, after);
}

function afterKey(key: string): string {
  // Walk from the end bumping the first non-max char up by one; if every char
  // is already the max, extend the key with a mid char.
  const chars = key.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = charIndex(chars[i]);
    if (idx < BASE - 1) {
      chars[i] = ALPHABET[idx + 1];
      return chars.slice(0, i + 1).join('');
    }
  }
  return key + MID_CHAR;
}

function beforeKey(key: string): string {
  const chars = key.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = charIndex(chars[i]);
    if (idx > 0) {
      chars[i] = ALPHABET[idx - 1];
      return chars.slice(0, i + 1).join('');
    }
  }
  // key was all-MIN_CHAR (e.g. "000...") — go one level deeper, below it.
  return MIN_CHAR.repeat(key.length + 1) + MID_CHAR;
}

function between(a: string, b: string): string {
  if (a >= b) throw new Error(`midpointKey: before (${a}) must sort before after (${b})`);
  const len = Math.max(a.length, b.length) + 1;
  const av = a.padEnd(len, MIN_CHAR);
  const bv = b.padEnd(len, MIN_CHAR);

  let result = '';
  for (let i = 0; i < len; i++) {
    const ai = charIndex(av[i]);
    const bi = i < b.length ? charIndex(bv[i]) : BASE;
    if (ai === bi) {
      result += av[i];
      continue;
    }
    const mid = Math.floor((ai + bi) / 2);
    if (mid > ai) {
      result += ALPHABET[mid];
      return result;
    }
    // No room between ai and bi at this position (bi === ai + 1) — keep ai's
    // char and carry the search one position deeper.
    result += av[i];
  }
  // Ran out of shared precision — append a mid char to break the tie.
  return result + MID_CHAR;
}

export const RANK_KEY_MIN = MIN_CHAR;
export const RANK_KEY_MAX = MAX_CHAR;
