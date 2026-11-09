// App state (Zustand) + persistence to IndexedDB. Every action writes to the DB first.
import { create } from 'zustand';
import { defaultHeatmap, defaultSettings, defaultTemplate } from '../domain/defaults';
import { activeShift } from '../domain/actuals';
import { workDayOf } from '../domain/time';
import type { Bonus, DailyTotal, Heatmap, LoggedData, Settings, WeekPlan, WeekTemplate } from '../domain/types';
import type { Notice, SentEntry } from '../domain/notifications';
import { db, newId } from '../data/db';
import { exportAll, importAll, type BackupFile } from '../data/backup';

export type QuickLogMode = 'ride' | 'fuel' | 'payout' | 'total';

interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  action?: () => void;
}

interface AppState {
  ready: boolean;
  settings: Settings;
  template: WeekTemplate;
  heatmap: Heatmap;
  plans: Record<string, WeekPlan>;
  bonuses: Bonus[];
  data: LoggedData;
  sent: string[];
  sentLog: SentEntry[];
  lastBackupAt?: number;
  banner: Notice | null;

  // UI
  quickLog: QuickLogMode | null;
  wizardWeek: string | null; // weekStart
  toast: Toast | null;
  celebration: Celebration | null;
  /** during a shift: focused driving screen, or the full app */
  shiftFull: boolean;
  onboardingOpen: boolean;

  init: () => Promise<void>;
  setSettings: (s: Settings) => Promise<void>;
  setTemplate: (t: WeekTemplate) => Promise<void>;
  setHeatmap: (h: Heatmap) => Promise<void>;
  savePlan: (p: WeekPlan) => Promise<void>;
  upsertBonus: (b: Bonus) => Promise<void>;
  deleteBonus: (id: string) => Promise<void>;

  startShift: () => Promise<void>;
  pauseShift: () => Promise<void>;
  resumeShift: () => Promise<void>;
  endShift: () => Promise<void>;
  addRide: (amount: number) => Promise<string>;
  addFuel: (total: number, liters?: number) => Promise<string>;
  addPayout: (amount: number, bonusId?: string) => Promise<string>;
  setDailyTotal: (t: DailyTotal) => Promise<void>;
  deleteDailyTotal: (day: string) => Promise<void>;
  deleteEntry: (table: 'rides' | 'fuel' | 'payouts' | 'shifts', id: string) => Promise<void>;
  markSent: (keys: string[]) => Promise<void>;
  /** notices sent (counted for the daily limit) and dropped (never sent later) */
  logNotices: (sent: Notice[], dropped: Notice[]) => Promise<void>;
  showBanner: (n: Notice | null) => void;

  exportBackup: () => Promise<BackupFile>;
  importBackup: (f: BackupFile) => Promise<void>;

  openQuickLog: (m: QuickLogMode | null) => void;
  openWizard: (weekStart: string | null) => void;
  showToast: (text: string, actionLabel?: string, action?: () => void) => void;
  hideToast: () => void;
  celebrate: (c: Celebration) => void;
  clearCelebration: () => void;
  setShiftFull: (v: boolean) => void;
  openOnboarding: (v: boolean) => void;
}

export interface Celebration {
  kind: 'day' | 'week' | 'bonus';
  title: string;
  body: string;
}

/** Fills fields added in newer versions with defaults. */
function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    target: { ...d.target, ...saved.target },
    fuel: { ...d.fuel, ...saved.fuel },
    estimates: { ...d.estimates, ...saved.estimates },
    learning: { ...d.learning, ...saved.learning },
    breaks: { ...d.breaks, ...saved.breaks },
    notifications: { ...d.notifications, ...saved.notifications },
    costItems: saved.costItems ?? d.costItems,
    // Settings saved by an older version = an existing user who already configured everything.
    onboarded: saved.onboarded ?? true,
  };
}

const emptyData = (): LoggedData => ({ shifts: [], rides: [], fuel: [], payouts: [], dailyTotals: [] });
let toastSeq = 0;

export const useApp = create<AppState>((set, get) => {
  const kvPut = (key: string, value: unknown) => db().kv.put({ key, value });
  const now = () => Date.now();
  const currentDay = () => {
    const a = activeShift(get().data.shifts);
    return a ? a.day : workDayOf(now(), get().settings.dayCutoffHour);
  };
  const setData = (patch: Partial<LoggedData>) => set({ data: { ...get().data, ...patch } });

  return {
    ready: false,
    settings: defaultSettings(),
    template: defaultTemplate(),
    heatmap: defaultHeatmap(),
    plans: {},
    bonuses: [],
    data: emptyData(),
    sent: [],
    sentLog: [],
    lastBackupAt: undefined,
    banner: null,
    quickLog: null,
    wizardWeek: null,
    toast: null,
    celebration: null,
    shiftFull: false,
    onboardingOpen: false,

    async init() {
      const d = db();
      const [kv, plans, bonuses, shifts, rides, fuel, payouts, dailyTotals] = await Promise.all([
        d.kv.toArray(), d.plans.toArray(), d.bonuses.toArray(), d.shifts.toArray(), d.rides.toArray(),
        d.fuel.toArray(), d.payouts.toArray(), d.dailyTotals.toArray(),
      ]);
      const get_ = (k: string) => kv.find((x) => x.key === k)?.value;
      set({
        ready: true,
        settings: (() => {
          const st = mergeSettings(get_('settings') as Partial<Settings> | undefined);
          // Anyone who already has data (plans, bonuses, shifts, rides…) is an existing user: no onboarding.
          const hasData = plans.length + bonuses.length + shifts.length + rides.length + fuel.length + payouts.length + dailyTotals.length > 0;
          return hasData && !st.onboarded ? { ...st, onboarded: true } : st;
        })(),
        template: (get_('template') as WeekTemplate | undefined) ?? defaultTemplate(),
        heatmap: (get_('heatmap') as Heatmap | undefined) ?? defaultHeatmap(),
        sent: (get_('sent') as string[] | undefined) ?? [],
        sentLog: (get_('sentLog') as SentEntry[] | undefined) ?? [],
        lastBackupAt: get_('lastBackupAt') as number | undefined,
        plans: Object.fromEntries(plans.map((p) => [p.id, p])),
        bonuses,
        data: { shifts, rides, fuel, payouts, dailyTotals },
      });
      // Ask the browser not to evict our data.
      navigator.storage?.persist?.().catch(() => undefined);
    },

    async setSettings(s) {
      await kvPut('settings', s);
      set({ settings: s });
    },
    async setTemplate(t) {
      await kvPut('template', t);
      set({ template: t });
    },
    async setHeatmap(h) {
      await kvPut('heatmap', h);
      set({ heatmap: h });
    },
    async savePlan(p) {
      await db().plans.put(p);
      set({ plans: { ...get().plans, [p.id]: p } });
    },
    async upsertBonus(b) {
      await db().bonuses.put(b);
      const rest = get().bonuses.filter((x) => x.id !== b.id);
      set({ bonuses: [...rest, b] });
    },
    async deleteBonus(id) {
      await db().bonuses.delete(id);
      set({ bonuses: get().bonuses.filter((x) => x.id !== id) });
    },

    async startShift() {
      if (activeShift(get().data.shifts)) return;
      const t = now();
      const s = { id: newId(), day: workDayOf(t, get().settings.dayCutoffHour), start: t, end: null, pauses: [] };
      await db().shifts.put(s);
      setData({ shifts: [...get().data.shifts, s] });
      set({ shiftFull: false });
    },
    async pauseShift() {
      const a = activeShift(get().data.shifts);
      if (!a || a.pauses.some((p) => p.end === null)) return;
      const s = { ...a, pauses: [...a.pauses, { start: now(), end: null }] };
      await db().shifts.put(s);
      setData({ shifts: get().data.shifts.map((x) => (x.id === s.id ? s : x)) });
    },
    async resumeShift() {
      const a = activeShift(get().data.shifts);
      if (!a) return;
      const t = now();
      const s = { ...a, pauses: a.pauses.map((p) => (p.end === null ? { ...p, end: t } : p)) };
      await db().shifts.put(s);
      setData({ shifts: get().data.shifts.map((x) => (x.id === s.id ? s : x)) });
    },
    async endShift() {
      const a = activeShift(get().data.shifts);
      if (!a) return;
      const t = now();
      const s = { ...a, end: t, pauses: a.pauses.map((p) => (p.end === null ? { ...p, end: t } : p)) };
      await db().shifts.put(s);
      setData({ shifts: get().data.shifts.map((x) => (x.id === s.id ? s : x)) });
    },
    async addRide(amount) {
      const r = { id: newId(), day: currentDay(), ts: now(), amount };
      await db().rides.put(r);
      setData({ rides: [...get().data.rides, r] });
      return r.id;
    },
    async addFuel(total, liters) {
      const f = { id: newId(), day: currentDay(), ts: now(), total, ...(liters ? { liters } : {}) };
      await db().fuel.put(f);
      setData({ fuel: [...get().data.fuel, f] });
      return f.id;
    },
    async addPayout(amount, bonusId) {
      const p = { id: newId(), day: currentDay(), ts: now(), amount, ...(bonusId ? { bonusId } : {}) };
      await db().payouts.put(p);
      setData({ payouts: [...get().data.payouts, p] });
      return p.id;
    },
    async setDailyTotal(t) {
      await db().dailyTotals.put(t);
      setData({ dailyTotals: [...get().data.dailyTotals.filter((x) => x.day !== t.day), t] });
    },
    async deleteDailyTotal(day) {
      await db().dailyTotals.delete(day);
      setData({ dailyTotals: get().data.dailyTotals.filter((x) => x.day !== day) });
    },
    async deleteEntry(table, id) {
      await db().table(table).delete(id);
      const list = get().data[table] as { id: string }[];
      setData({ [table]: list.filter((x) => x.id !== id) } as Partial<LoggedData>);
    },
    async markSent(keys) {
      const sent = [...get().sent, ...keys].slice(-500);
      await kvPut('sent', sent);
      set({ sent });
    },

    async exportBackup() {
      const f = await exportAll(db());
      const at = Date.now();
      await kvPut('lastBackupAt', at);
      set({ lastBackupAt: at });
      return f;
    },
    async logNotices(sent, dropped) {
      const now = Date.now();
      const keys = [...get().sent, ...sent.map((n) => n.key), ...dropped.map((n) => n.key)].slice(-500);
      const sentLog = [...get().sentLog, ...sent.map((n) => ({ key: n.key, at: now, type: n.type }))].filter((e) => now - e.at < 3 * 86_400_000);
      await kvPut('sent', keys);
      await kvPut('sentLog', sentLog);
      set({ sent: keys, sentLog });
    },
    showBanner: (n) => set({ banner: n }),
    async importBackup(f) {
      await importAll(db(), f);
      await get().init();
    },

    openQuickLog: (m) => set({ quickLog: m }),
    openWizard: (w) => set({ wizardWeek: w }),
    showToast(text, actionLabel, action) {
      const id = ++toastSeq;
      set({ toast: { id, text, actionLabel, action } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 5000);
    },
    hideToast: () => set({ toast: null }),
    celebrate: (c) => set({ celebration: c }),
    clearCelebration: () => set({ celebration: null }),
    setShiftFull: (v) => set({ shiftFull: v }),
    openOnboarding: (v) => set({ onboardingOpen: v }),
  };
});
