import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { exportAll, importAll, validateBackup } from './backup';
import { TuraDB } from './db';

describe('backup', () => {
  it('round-trips all tables through JSON', async () => {
    const a = new TuraDB('test-a');
    await a.kv.put({ key: 'settings', value: { commissionPct: 10 } });
    await a.rides.bulkPut([
      { id: 'r1', day: '2026-11-09', ts: 1, amount: 25 },
      { id: 'r2', day: '2026-11-09', ts: 2, amount: 31.5 },
    ]);
    await a.dailyTotals.put({ day: '2026-11-08', gross: 300, rides: 12 });
    const file = JSON.parse(JSON.stringify(await exportAll(a)));

    const b = new TuraDB('test-b');
    await b.rides.put({ id: 'old', day: '2020-01-01', ts: 0, amount: 1 });
    await importAll(b, validateBackup(file));
    expect(await b.rides.count()).toBe(2);
    expect(await b.rides.get('old')).toBeUndefined();
    expect((await b.kv.get('settings'))?.value).toEqual({ commissionPct: 10 });
    expect(await b.dailyTotals.get('2026-11-08')).toEqual({ day: '2026-11-08', gross: 300, rides: 12 });
  });

  it('rejects files that are not backups', () => {
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup({ app: 'altceva' })).toThrow('nu este un backup Tura Mea');
    expect(() => validateBackup({ app: 'tura-mea', schemaVersion: 99, data: {} })).toThrow('versiune mai nouă');
    expect(() => validateBackup({ app: 'tura-mea', schemaVersion: 1, data: { rides: 'x' } })).toThrow('invalid');
  });
});
