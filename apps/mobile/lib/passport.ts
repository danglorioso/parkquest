// Shared passport-document helpers — used by the passport screen, the
// profile page's passport card, and the export/share card so all three
// print identical "official document" fields (number, MRZ strip).

export function passportNo(username: string): string {
  const n = ((username.length * 73291 + 41023) % 9999999).toString().padStart(7, '0');
  return `PQ${n}`;
}

export function stampDateStr(iso: string): string {
  const d = new Date(iso);
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export interface MrzInput {
  name: string;            // display name (falls back to 'Explorer' upstream)
  username: string;
  userId: string | null;
  createdAt: Date | number | null;
  visitedCount: number;
}

// Machine-readable-zone strip, two 44-char lines — encodes real user data
// in passport MRZ format.
export function buildMrzLines({ name, username, userId, createdAt, visitedCount }: MrzInput): [string, string] {
  const parts = name.toUpperCase().replace(/[^A-Z ]/g, '').split(' ');
  const surname = (parts[0] ?? 'UNKNOWN').slice(0, 12);
  const given = (parts.slice(1).join('<') || 'EXPLORER').slice(0, 10);
  const line1 = `P<USA<<${surname}<<${given}`.padEnd(44, '<').slice(0, 44);

  const uid = userId?.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-7).padStart(7, '0') ?? '0000000';
  const joined = createdAt
    ? new Date(createdAt).toISOString().slice(2, 10).replace(/-/g, '')
    : '000000';
  const parks3 = String(visitedCount).padStart(3, '0');
  const uname = username.toUpperCase().slice(0, 9).padEnd(9, '<');
  const line2 = `${uid}<USA${joined}${parks3}${uname}`.padEnd(44, '<').slice(0, 44);

  return [line1, line2];
}
