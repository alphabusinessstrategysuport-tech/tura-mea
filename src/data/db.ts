// Local database on the phone (IndexedDB via Dexie). No server, no account.
// To add a field later: bump the version and add an upgrade() if data must be migrated.
import Dexie, { type Table } from 'dexie';
import type { Bonus, BonusPayout, DailyTotal, FuelEntry, Ride, Shift, WeekPlan } from '../domain/types';

export interface KV {
  key: string;
  value: unknown;
}

export const TABLES = ['kv', 'plans', 'bonuses', 'shifts', 'rides', 'fuel', 'payouts', 'dailyTotals'] as const;
export type TableName = (typeof TABLES)[number];

export class TuraDB extends Dexie {
  kv!: Table<KV, string>;
  plans!: Table<WeekPlan, string>;
  bonuses!: Table<Bonus, string>;
  shifts!: Table<Shift, string>;
  rides!: Table<Ride, string>;
  fuel!: Table<FuelEntry, string>;
  payouts!: Table<BonusPayout, string>;
  dailyTotals!: Table<DailyTotal, string>;

  constructor(name = 'tura-mea') {
    super(name);
    this.version(1).stores({
      kv: 'key',
      plans: 'id',
      bonuses: 'id, weekId',
      shifts: 'id, day, start',
      rides: 'id, day, ts',
      fuel: 'id, day, ts',
      payouts: 'id, day, ts',
      dailyTotals: 'day',
    });
  }
}

let instance: TuraDB | null = null;
export function db(): TuraDB {
  if (!instance) instance = new TuraDB();
  return instance;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
