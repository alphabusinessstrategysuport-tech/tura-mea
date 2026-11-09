// Turns the text read (OCR) from Bolt "Campanii" screenshots into bonuses.
// Expected blocks, as in the Bolt Driver app:
//   "10 nov., 06:00 – 10 nov., 08:59"
//   "Bonus 78 ron la 7 curse!"
// Tolerant to OCR noise: dash variants, missing dots/commas, "lei"/"RON", ":"/"." in times.
import type { BonusDraft } from './bonusImport';
import { diffDays, weekdayOf, weekIdOf } from './time';
import type { Weekday } from './types';

const MONTHS: Record<string, number> = {
  ian: 1, feb: 2, mar: 3, apr: 4, mai: 5, iun: 6, iul: 7, aug: 8, sep: 9, sept: 9, oct: 10, noi: 11, nov: 11, dec: 12,
  jan: 1, may: 5, jun: 6, jul: 7,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Picks the year that puts the date closest to `today` (screenshots are about the coming days). */
function dayKey(day: number, month: number, today: string): string {
  const y = Number(today.slice(0, 4));
  const options = [y - 1, y, y + 1].map((yy) => `${yy}-${pad(month)}-${pad(day)}`);
  return options.reduce((a, b) => (Math.abs(diffDays(b, today)) < Math.abs(diffDays(a, today)) ? b : a));
}

/** "08:59" → 540 (end times ending in :59 mean "until the full hour"). */
function minutes(h: number, m: number, isEnd: boolean): number {
  const t = h * 60 + m;
  return isEnd && m === 59 ? t + 1 : t;
}

export function parseBoltCampaigns(rawText: string, today: string): BonusDraft[] {
  const text = rawText
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const dateRe = /(\d{1,2})\s*([a-zăâîșț]{3,4})\.?\s*,?\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*-+\s*(\d{1,2})\s*([a-zăâîșț]{3,4})\.?\s*,?\s*(\d{1,2})\s*[:.]\s*(\d{2})/g;
  const bonusRe = /bonus\s*(\d{1,4})\s*(?:ron|lei)\s*(?:la|pentru)\s*(\d{1,3})\s*curs\w*!?/g;

  const dates = [...text.matchAll(dateRe)].map((m) => ({ i: m.index ?? 0, m }));
  const bonuses = [...text.matchAll(bonusRe)].map((m) => {
    const i = m.index ?? 0;
    const end = i + m[0].length;
    // The bold title is the hardest to read ("12" often becomes "72"); the bullet line below it
    // ("• 12 curse") is plain text and more reliable, so it wins when present.
    const nextDate = dates.find((d) => d.i > i)?.i ?? text.length;
    const bullet = text.slice(end, Math.min(nextDate, end + 120)).match(/(\d{1,3})\s*curse\b/);
    const rides = bullet ? Number(bullet[1]) : Number(m[2]);
    return { i, reward: Number(m[1]), rides };
  });

  const out: BonusDraft[] = [];
  for (const { i, m } of dates) {
    const b = bonuses.find((x) => x.i > i && (dates.find((d) => d.i > i)?.i ?? Infinity) > x.i);
    if (!b) continue;
    const m1 = MONTHS[m[2].replace(/\.$/, '')];
    const m2 = MONTHS[m[6].replace(/\.$/, '')];
    if (!m1 || !m2) continue;
    const startDay = dayKey(Number(m[1]), m1, today);
    const endDay = dayKey(Number(m[5]), m2, today);
    const span = diffDays(endDay, startDay);
    if (span < 0 || span > 1) continue;
    const start = minutes(Number(m[3]), Number(m[4]), false);
    const end = minutes(Number(m[7]), Number(m[8]), true) + span * 1440;
    if (end <= start || b.rides <= 0) continue;
    const draft: BonusDraft = {
      weekId: weekIdOf(startDay),
      kind: 'daily',
      days: [weekdayOf(startDay) as Weekday],
      start,
      end,
      ridesRequired: b.rides,
      reward: b.reward,
    };
    // Screenshots overlap: skip exact duplicates.
    if (!out.some((o) => o.weekId === draft.weekId && o.days[0] === draft.days[0] && o.start === draft.start && o.end === draft.end && o.reward === draft.reward && o.ridesRequired === draft.ridesRequired)) {
      out.push(draft);
    }
  }
  return out.sort((a, b) => a.weekId.localeCompare(b.weekId) || a.days[0] - b.days[0] || a.start - b.start);
}
