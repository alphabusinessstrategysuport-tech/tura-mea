// Share a week's bonuses as a link: https://…/tura-mea/#/import/<code>
// Opening the link on the phone shows the list and adds the bonuses after confirmation.
import type { Bonus, WeekId, Weekday } from './types';

/** Compact form used inside the link. */
interface Packed {
  v: 1;
  w: WeekId;
  b: [kind: 'd' | 'w', days: number[], start: number, end: number, rides: number, reward: number][];
}

export type BonusDraft = Omit<Bonus, 'id' | 'mode'>;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeBonuses(weekId: WeekId, bonuses: BonusDraft[]): string {
  const packed: Packed = {
    v: 1,
    w: weekId,
    b: bonuses.map((x) => [x.kind === 'weekly' ? 'w' : 'd', x.days, x.start, x.end, x.ridesRequired, x.reward]),
  };
  return toBase64Url(JSON.stringify(packed));
}

/** Throws an Error with a Romanian message if the code is invalid. */
export function decodeBonuses(code: string): { weekId: WeekId; bonuses: BonusDraft[] } {
  let p: Packed;
  try {
    p = JSON.parse(fromBase64Url(code));
  } catch {
    throw new Error('Linkul de bonusuri nu e valid.');
  }
  if (p?.v !== 1 || typeof p.w !== 'string' || !/^\d{4}-W\d{2}$/.test(p.w) || !Array.isArray(p.b)) {
    throw new Error('Linkul de bonusuri nu e valid.');
  }
  const bonuses = p.b.map((t) => {
    const [k, days, start, end, rides, reward] = t;
    const ok = Array.isArray(days) && days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      && [start, end, rides, reward].every((n) => Number.isFinite(n)) && end > start && end - start <= 1440 && rides > 0 && reward >= 0;
    if (!ok) throw new Error('Un bonus din link are date greșite.');
    return { weekId: p.w, kind: k === 'w' ? 'weekly' : 'daily', days: days as Weekday[], start, end, ridesRequired: rides, reward } as BonusDraft;
  });
  return { weekId: p.w, bonuses };
}

export function sameBonus(a: BonusDraft, b: BonusDraft): boolean {
  return a.weekId === b.weekId && a.kind === b.kind && a.start === b.start && a.end === b.end
    && a.ridesRequired === b.ridesRequired && a.reward === b.reward
    && [...a.days].sort().join() === [...b.days].sort().join();
}

/** Bonuses from the link that are not already saved. */
export function newOnly(incoming: BonusDraft[], existing: Bonus[]): BonusDraft[] {
  return incoming.filter((x) => !existing.some((e) => sameBonus(x, e)));
}
