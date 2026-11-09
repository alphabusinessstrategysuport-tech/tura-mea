import { describe, expect, it } from 'vitest';
import { parseBoltCampaigns } from './bonusOcr';

// Text as OCR reads the Bolt "Campanii" screen (noise included on purpose).
const SHOT_1 = `18:01 Campanii Viitor
10 nov., 06:00 – 10 nov., 08:59 >
Bonus 78 ron la 7 curse!
Toate categoriile | București
• 7 curse • 80 % acceptarea comenzilor de calificare vezi toate condițiile
10 nov. 16:00 - 10 nov., 18.59
Bonus 78 RON la 7 curse!
• 7 curse
11 nov., 06:00 — 11 nov., 09:59
Bonus 99 ron la 9 curse!`;

const SHOT_2 = `11 nov., 06:00 – 11 nov., 09:59
Bonus 99 ron la 9 curse!
14 nov., 23:00 – 15 nov., 03:59
Bonus 132 ron la 12 curse!
vezi toate condițiile`;

describe('Bolt screenshot parser', () => {
  it('reads date ranges and rewards, tolerant to OCR noise', () => {
    const b = parseBoltCampaigns(SHOT_1, '2026-11-09');
    expect(b).toHaveLength(3);
    expect(b[0]).toEqual({ weekId: '2026-W46', kind: 'daily', days: [1], start: 360, end: 540, ridesRequired: 7, reward: 78 });
    expect(b[1]).toMatchObject({ days: [1], start: 960, end: 1140 });
    expect(b[2]).toMatchObject({ days: [2], start: 360, end: 600, ridesRequired: 9, reward: 99 });
  });

  it('keeps night bonuses on the start day and removes duplicates across screenshots', () => {
    const b = parseBoltCampaigns(`${SHOT_1}\n${SHOT_2}`, '2026-11-09');
    expect(b).toHaveLength(4);
    const night = b.find((x) => x.reward === 132)!;
    expect(night).toMatchObject({ days: [5], start: 23 * 60, end: 28 * 60 });
  });

  it('handles the year change (screenshot in late December)', () => {
    const b = parseBoltCampaigns('2 ian., 07:00 – 2 ian., 09:59 Bonus 50 lei la 5 curse', '2026-12-30');
    // 2 Jan 2027 (Saturday) belongs to ISO week 2026-W53
    expect(b[0]).toMatchObject({ weekId: '2026-W53', days: [5], start: 420, end: 600, reward: 50, ridesRequired: 5 });
  });

  it('fixes misread bold titles using the bullet line and accepts double dashes', () => {
    // Real OCR output: "12" read as "72" in the bold title, "-—" between the dates.
    const raw = `13 nov., 11:00 -— 13 nov., 14:59 >
Bonus 87 ron la 8 curse!
Pa Toate categoriile ' Q București
" 8 curse
13 nov., 15:00 - 13 nov., 20:59 >
Bonus 132 ron la 72 curse!
* 12 curse`;
    const b = parseBoltCampaigns(raw, '2026-11-09');
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ days: [4], start: 660, end: 900, ridesRequired: 8, reward: 87 });
    expect(b[1]).toMatchObject({ days: [4], start: 900, end: 1260, ridesRequired: 12, reward: 132 });
  });

  it('ignores text without bonuses', () => {
    expect(parseBoltCampaigns('Campanii\nNimic aici', '2026-11-09')).toEqual([]);
  });
});
