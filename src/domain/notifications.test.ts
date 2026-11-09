import { describe, expect, it } from 'vitest';
import type { BonusProgress } from './bonus';
import { defaultHeatmap, defaultSettings } from './defaults';
import { buildIcs, googlePlanningReminderUrl, nextSunday } from './ics';
import { allNotices, dueNotices, nextNoticeAt, type NoticeContext } from './notifications';
import { emptyDay } from './scheduler';
import { zonedToTs } from './time';
import type { Bonus, DayPlan, WeekPlan } from './types';

const MON = '2026-11-09';

function monday(): DayPlan {
  return {
    ...emptyDay(MON),
    runs: [{ start: 16 * 60, end: 20 * 60 + 30 }],
    items: [
      { start: 16 * 60, end: 18 * 60, kind: 'work' },
      { start: 18 * 60, end: 18 * 60 + 10, kind: 'rest' },
      { start: 18 * 60 + 10, end: 20 * 60 + 30, kind: 'work' },
    ],
    workHours: 4.3,
    targetGross: 260,
  };
}

function ctx(over: Partial<NoticeContext> = {}): NoticeContext {
  return {
    now: zonedToTs(MON, 15 * 60 + 46),
    today: MON,
    settings: defaultSettings(),
    heat: defaultHeatmap(),
    dayPlans: [monday()],
    todayTarget: 260,
    todayEarned: 0,
    shiftActive: false,
    bonuses: [],
    nextWeekPlanned: true,
    nextWeekId: '2026-W47',
    ...over,
  };
}

const bonus: Bonus = { id: 'b', weekId: '2026-W46', kind: 'daily', days: [0], start: 15 * 60, end: 21 * 60, ridesRequired: 12, reward: 130, mode: 'auto' };

describe('notifications', () => {
  it('reminds to leave before a planned block', () => {
    const due = dueNotices(ctx(), new Set());
    expect(due.map((n) => n.type)).toContain('leave');
    expect(due[0].body).toContain('16:00');
  });

  it('never sends the same notice twice', () => {
    const first = dueNotices(ctx(), new Set());
    expect(dueNotices(ctx(), new Set(first.map((n) => n.key)))).toHaveLength(0);
  });

  it('skips old notices when the app is opened late', () => {
    const late = ctx({ now: zonedToTs(MON, 17 * 60) });
    expect(dueNotices(late, new Set()).some((n) => n.type === 'leave')).toBe(false);
  });

  it('announces breaks and going home', () => {
    const all = allNotices(ctx());
    expect(all.some((n) => n.type === 'breaks' && n.title.includes('Pauză scurtă'))).toBe(true);
    expect(all.some((n) => n.type === 'goHome')).toBe(true);
  });

  it('pushes for the last rides of a bonus', () => {
    const p: BonusProgress = { key: 'b@x', bonus, done: 9, required: 12, remaining: 3, state: 'active', minutesLeft: 80, startsInMin: 0, achieved: false };
    const due = dueNotices(ctx({ bonuses: [p] }), new Set());
    const n = due.find((x) => x.type === 'bonus')!;
    expect(n.title).toBe('Încă 3 curse pentru bonus 💪');
    expect(n.body).toContain('1h 20m');
  });

  it('respects the per-type switches', () => {
    const s = defaultSettings();
    s.notifications.leave = false;
    expect(dueNotices(ctx({ settings: s }), new Set()).some((n) => n.type === 'leave')).toBe(false);
  });

  it('reminds on Sunday at 09:00 to plan the next week', () => {
    const sun = '2026-11-15';
    const c = ctx({ today: sun, dayPlans: [], nextWeekPlanned: false, now: zonedToTs(sun, 9 * 60 + 1) });
    const due = dueNotices(c, new Set());
    expect(due.some((n) => n.type === 'planning')).toBe(true);
    expect(dueNotices({ ...c, nextWeekPlanned: true }, new Set()).some((n) => n.type === 'planning')).toBe(false);
  });

  it('celebrates when today’s target is reached', () => {
    const due = dueNotices(ctx({ todayEarned: 300 }), new Set());
    expect(due.some((n) => n.type === 'progress')).toBe(true);
  });

  it('finds the next notice time for scheduling', () => {
    const c = ctx({ now: zonedToTs(MON, 12 * 60) });
    expect(nextNoticeAt(c, new Set())).toBe(zonedToTs(MON, 15 * 60 + 45));
  });
});

describe('ics export', () => {
  const plan = { id: '2026-W46', days: [monday()] } as unknown as WeekPlan;

  it('creates events with alarms and a weekly Sunday reminder', () => {
    const ics = buildIcs({ plan, leadMin: 15, includeBreaks: true, planningReminderFrom: MON, now: 0 });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261109T140000Z'); // 16:00 Bucharest = 14:00 UTC in winter
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(ics).toContain('DTSTART;TZID=Europe/Bucharest:20261115T090000');
  });

  it('builds a Google Calendar link for the Sunday reminder', () => {
    expect(nextSunday('2026-11-15')).toBe('2026-11-15');
    const url = googlePlanningReminderUrl(MON);
    expect(url).toContain('calendar.google.com');
    expect(decodeURIComponent(url)).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
  });
});
