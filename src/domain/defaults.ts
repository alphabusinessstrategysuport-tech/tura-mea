// Default settings, weekly template and Bucharest demand heatmap.
import type { DayTemplate, Heatmap, Settings, WeekTemplate } from './types';

const h = (x: number) => x * 60;

export function defaultSettings(): Settings {
  return {
    target: { mode: 'monthly', amount: 5500 },
    weeksPerMonth: 4.33,
    costItems: [
      { id: 'rent', name: 'Chirie mașină', amount: 500, period: 'week' },
      { id: 'contract', name: 'Contract de muncă', amount: 420, period: 'week' },
    ],
    commissionPct: 10,
    taxPct: 0,
    fuel: { consumptionL100: 10, pricePerL: null },
    // Starting estimates for Bucharest; the app learns real values from your data.
    estimates: { grossPerHour: 55, kmPerHour: 22, avgFare: 25 },
    learning: { enabled: true, fullTrustHours: 40 },
    homeBy: h(21),
    dayCutoffHour: 5,
    breaks: { mealAfterMin: 240, mealMin: 40, restEveryMin: 120, restMin: 10 },
    notifications: { leave: true, breaks: true, bonus: true, goHome: true, planning: true, progress: true },
    notifyLeadMin: 15,
    keepScreenOn: true,
  };
}

function day(weekday: number, minHours: number, maxHours: number, windows: DayTemplate['windows'], respectHomeBy: boolean): DayTemplate {
  return { weekday: weekday as DayTemplate['weekday'], enabled: true, minHours, maxHours, windows, respectHomeBy };
}

/**
 * Your habits: hours ramp up towards the weekend.
 *  Mon/Tue 4–5h, Wed ~6h, Thu 7–8h — home by 21:00.
 *  Fri afternoon/evening until ~midnight.
 *  Sat day + long evening break + night until morning.
 *  Sun all day.
 */
export function defaultTemplate(): WeekTemplate {
  return [
    day(0, 4, 5, [{ start: h(6.5), end: h(21) }], true),
    day(1, 4, 5, [{ start: h(6.5), end: h(21) }], true),
    day(2, 6, 6.5, [{ start: h(6.5), end: h(21) }], true),
    day(3, 7, 8, [{ start: h(6.5), end: h(21) }], true),
    day(4, 7, 9, [{ start: h(13), end: h(24.5) }], false),
    day(5, 10, 12, [
      { start: h(9), end: h(18), minHours: 4 },
      { start: h(21), end: h(29), minHours: 4 }, // until 05:00 Sunday morning
    ], false),
    day(6, 10, 12, [{ start: h(8), end: h(23) }], false),
  ];
}

/**
 * Default demand for ride sharing in Bucharest, 0..100 per hour (50 = average).
 * Assumptions (edit them in Setări → Cerere):
 *  - Weekdays: morning commute 7–10 (peak 8–9) towards offices (Pipera, Floreasca, Centru),
 *    moderate midday, strongest peak 17–20 (offices out, traffic, surge), low after 22.
 *  - Airport (Otopeni): early flights 04–07, evening arrivals 21–01.
 *  - Thursday evening slightly stronger (after-work).
 *  - Friday 19–03 and Saturday 20–05: nightlife (Centrul Vechi, Floreasca, Herăstrău, clubs),
 *    rides home 02–05.
 *  - Saturday daytime: shopping/malls, moderate.
 *  - Sunday: quiet morning, moderate day, returns in the evening 17–22 (Gara de Nord, airport).
 */
export function defaultHeatmap(): Heatmap {
  const weekday = [
    // 0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23
    [15, 10, 8, 8, 25, 35, 55, 80, 95, 80, 55, 45, 50, 50, 45, 50, 65, 90, 100, 85, 65, 55, 40, 25],
  ][0];
  const thursday = weekday.map((v, i) => (i >= 19 ? Math.min(100, v + 10) : v));
  const friday = [20, 15, 10, 10, 25, 35, 55, 80, 90, 75, 55, 45, 50, 50, 50, 55, 70, 90, 100, 90, 80, 80, 85, 90];
  const saturday = [85, 80, 75, 65, 40, 30, 25, 25, 30, 40, 50, 55, 60, 60, 60, 60, 60, 65, 70, 70, 75, 80, 90, 95];
  const sunday = [90, 85, 80, 70, 45, 30, 20, 20, 25, 35, 45, 50, 55, 55, 55, 55, 60, 70, 75, 75, 70, 60, 45, 30];
  return [weekday, [...weekday], [...weekday], thursday, friday, saturday, sunday];
}

export const WEEKDAY_NAMES = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];
export const WEEKDAY_SHORT = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
