import { describe, expect, it } from 'vitest';
import { decodeBonuses, encodeBonuses, newOnly, type BonusDraft } from './bonusImport';

const drafts: BonusDraft[] = [
  { weekId: '2026-W46', kind: 'daily', days: [1], start: 360, end: 540, ridesRequired: 7, reward: 78 },
  { weekId: '2026-W46', kind: 'daily', days: [5], start: 1380, end: 1680, ridesRequired: 12, reward: 132 },
];

describe('bonus import link', () => {
  it('round-trips bonuses through the link code (URL-safe)', () => {
    const code = encodeBonuses('2026-W46', drafts);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeBonuses(code);
    expect(back.weekId).toBe('2026-W46');
    expect(back.bonuses).toEqual(drafts);
  });

  it('rejects broken links', () => {
    expect(() => decodeBonuses('nu-e-bun')).toThrow('nu e valid');
    const bad = encodeBonuses('2026-W46', [{ ...drafts[0], end: 100 }]);
    expect(() => decodeBonuses(bad)).toThrow('date greșite');
  });

  it('skips bonuses that are already saved', () => {
    const existing = [{ ...drafts[0], id: 'x', mode: 'auto' as const }];
    expect(newOnly(drafts, existing)).toEqual([drafts[1]]);
  });
});
