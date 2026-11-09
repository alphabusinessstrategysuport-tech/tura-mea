// Core data types shared by the business logic and the UI.
// Conventions:
//  - Weekday: 0 = Monday ... 6 = Sunday (Romanian week).
//  - DayKey: 'YYYY-MM-DD' in Europe/Bucharest.
//  - "Day minutes": minutes from 00:00 of a work day. They may exceed 1440,
//    e.g. Saturday 26:30 = Sunday 02:30 but still belongs to Saturday's work day.
//  - Timestamps (ts) are epoch milliseconds.
//  - All money is in lei (RON). "Gross" = amount shown in the Bolt app before
//    the commission. Commission applies to rides AND bonuses.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DayKey = string;
export type WeekId = string; // 'YYYY-Www' (ISO week)

export interface CostItem {
  id: string;
  name: string;
  amount: number;
  period: 'week' | 'month';
}

export type NotificationType = 'leave' | 'breaks' | 'bonus' | 'goHome' | 'planning' | 'progress';

export interface BreakRules {
  mealAfterMin: number; // continuous work before a meal break
  mealMin: number;
  restEveryMin: number; // continuous work before a short rest
  restMin: number;
}

export interface Settings {
  target: { mode: 'monthly' | 'weekly'; amount: number }; // NET profit target
  weeksPerMonth: number;
  costItems: CostItem[];
  commissionPct: number;
  taxPct: number;
  fuel: { consumptionL100: number; pricePerL: number | null };
  estimates: { grossPerHour: number; kmPerHour: number; avgFare: number };
  learning: { enabled: boolean; fullTrustHours: number };
  homeBy: number; // day minutes, default 21:00
  dayCutoffHour: number; // rides before this hour (outside a shift) count for the previous day
  breaks: BreakRules;
  notifications: Record<NotificationType, boolean>;
  notifyLeadMin: number; // "leave now" lead time
  keepScreenOn: boolean;
  theme: 'dark' | 'light';
  haptics: boolean;
  largeText: boolean;
  /** first-launch setup done (existing users: true) */
  onboarded: boolean;
  /** notification limits */
  notifyMaxPerDay: number;
  quietFrom: number; // day minutes, e.g. 0 = 00:00
  quietTo: number; // e.g. 420 = 07:00
}

export interface TimeWindow {
  start: number; // day minutes
  end: number; // day minutes (> start, may exceed 1440)
  minHours?: number; // minimum work inside this window (e.g. Saturday day part)
}

export interface DayTemplate {
  weekday: Weekday;
  enabled: boolean;
  minHours: number;
  maxHours: number;
  windows: TimeWindow[];
  respectHomeBy: boolean; // informational: windows already end by homeBy; bonuses may relax it
}

export type WeekTemplate = DayTemplate[]; // index = weekday

/** Demand per [weekday][hour], 0..100. 50 = average. */
export type Heatmap = number[][];

export interface Bonus {
  id: string;
  weekId: WeekId;
  kind: 'daily' | 'weekly';
  days: Weekday[];
  start: number; // day minutes
  end: number; // day minutes (> start)
  ridesRequired: number;
  reward: number; // gross lei
  mode: 'auto' | 'on' | 'off'; // auto = the app decides if it is worth it
  label?: string;
}

export type PlanItemKind = 'work' | 'meal' | 'rest';

export interface PlanItem {
  start: number;
  end: number;
  kind: PlanItemKind;
}

export interface Run {
  start: number;
  end: number;
}

export interface DayPlan {
  day: DayKey;
  weekday: Weekday;
  runs: Run[]; // continuous on-the-road periods (breaks are inside)
  items: PlanItem[]; // runs split into work/meal/rest
  workHours: number;
  gross: number; // expected ride gross
  bonusGross: number; // expected bonus gross attributed to this day
  rides: number;
  fuel: number;
  net: number; // contribution after commission, tax, fuel and share of fixed costs
  targetGross: number; // ride gross this day should bring (target split)
}

export type BonusStatus = 'sigur' | 'strans' | 'neplanificat' | 'imposibil' | 'ignorat';

export interface BonusEval {
  bonusId: string;
  key: string; // bonusId or bonusId@day for daily bonuses
  day?: DayKey;
  accepted: boolean;
  worth: boolean;
  status: BonusStatus;
  required: number;
  expectedRides: number;
  maxRides: number;
  hoursNeeded: number;
  effectiveNetPerHour: number;
  reason: string;
}

export interface WeekPlan {
  id: WeekId;
  weekStart: DayKey;
  createdAt: number;
  updatedAt: number;
  netTarget: number;
  fixedCosts: number;
  days: DayPlan[];
  bonusEvals: BonusEval[];
  totals: {
    workHours: number;
    gross: number;
    bonusGross: number;
    fuel: number;
    net: number;
    grossNeeded: number;
  };
  shortfall: number; // net lei the plan cannot reach within limits
}

// ---- Logged data ----

export interface Pause {
  start: number;
  end: number | null;
}

export interface Shift {
  id: string;
  day: DayKey;
  start: number;
  end: number | null;
  pauses: Pause[];
}

export interface Ride {
  id: string;
  day: DayKey;
  ts: number;
  amount: number; // gross
}

export interface FuelEntry {
  id: string;
  day: DayKey;
  ts: number;
  total: number; // lei paid
  liters?: number;
}

export interface BonusPayout {
  id: string;
  day: DayKey;
  ts: number;
  amount: number; // gross
  bonusId?: string;
}

/** Daily total copied from the Bolt app (rides only, no bonuses). Overrides individual rides for that day. */
export interface DailyTotal {
  day: DayKey;
  gross: number;
  rides: number;
  hours?: number;
}

export interface LoggedData {
  shifts: Shift[];
  rides: Ride[];
  fuel: FuelEntry[];
  payouts: BonusPayout[];
  dailyTotals: DailyTotal[];
}

/** Expected earnings per [weekday][hour] plus global rates. */
export interface EarningModel {
  grossPerHour: number[][];
  ridesPerHour: number[][];
  fuelPerHour: number;
  avgFare: number;
  baseGrossPerHour: number;
  learnedHours: number; // hours of real data behind the model
}
