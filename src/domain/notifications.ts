// Decides WHAT to notify and WHEN, and how to avoid sending too many.
// Pure logic; the browser side lives in src/notifications/runner.ts.
// Tone: warm and encouraging, never pushy.
import type { BonusProgress } from './bonus';
import { message } from './messages';
import { lei } from './money';
import { demandAt } from './model';
import { addDays, dayKeyOf, fmtDuration, fmtHM, minuteOfDay, weekdayOf, zonedToTs } from './time';
import type { DayKey, DayPlan, Heatmap, NotificationType, Settings } from './types';

export interface Notice {
  key: string; // unique; used to never send the same notice twice
  type: NotificationType;
  title: string;
  body: string;
  at: number;
}

export interface NoticeContext {
  now: number;
  today: DayKey; // current work day
  settings: Settings;
  heat: Heatmap;
  dayPlans: DayPlan[]; // plans of today and yesterday (late night runs)
  todayTarget: number;
  todayEarned: number;
  shiftActive: boolean;
  paused?: boolean;
  bonuses: BonusProgress[];
  nextWeekPlanned: boolean;
  nextWeekId: string;
  /** last finished shift today (for the day summary) */
  dayDone?: { endedAt: number; earned: number; hours: number };
  /** current week result, used on Sunday evening */
  week?: { id: string; net: number; target: number };
  lastBackupAt?: number;
}

/** Every notice that can happen today, ordered by time. */
export function allNotices(ctx: NoticeContext): Notice[] {
  const { settings: s, heat } = ctx;
  const out: Notice[] = [];

  for (const dp of ctx.dayPlans) {
    const at = (m: number) => zonedToTs(dp.day, m);
    dp.runs.forEach((r, idx) => {
      const busy = demandAt(heat, dp.weekday, r.start) >= 75;
      if (!ctx.shiftActive || idx > 0) {
        out.push({
          key: `leave:${dp.day}:${r.start}`,
          type: 'leave',
          at: at(r.start - s.notifyLeadMin),
          title: busy ? 'Pleacă acum: vine ora de vârf 🚗' : 'E aproape ora de plecare 🚗',
          body: busy
            ? `La ${fmtHM(r.start)} începe o perioadă aglomerată. Ținta de azi: ${lei(ctx.todayTarget)}.`
            : `Programul tău începe la ${fmtHM(r.start)}. Ținta de azi: ${lei(ctx.todayTarget)}.`,
        });
      }
    });
    for (const it of dp.items) {
      if (it.kind === 'meal') {
        out.push({
          key: `meal:${dp.day}:${it.start}`, type: 'breaks', at: at(it.start),
          title: 'Pauză de masă 🍽️',
          body: message('breakTime', `${dp.day}:${it.start}`, { minutes: it.end - it.start }),
        });
      } else if (it.kind === 'rest') {
        out.push({
          key: `rest:${dp.day}:${it.start}`, type: 'breaks', at: at(it.start),
          title: 'Pauză scurtă ☕',
          body: `${it.end - it.start} minute de respiro: întinde-te, bea apă.`,
        });
      }
      if (it.kind !== 'work' && ctx.shiftActive) {
        out.push({
          key: `breakend:${dp.day}:${it.end}`, type: 'breaks', at: at(it.end),
          title: 'Pauza s-a terminat',
          body: 'Spor la drum! Restul zilei vine cursă cu cursă.',
        });
      }
    }
    const last = dp.runs[dp.runs.length - 1];
    if (last) {
      const reached = ctx.todayEarned >= ctx.todayTarget && ctx.todayTarget > 0;
      out.push({
        key: `home:${dp.day}`, type: 'goHome', at: at(last.end),
        title: 'Gata pe azi 🏠',
        body: reached
          ? `Ai atins ținta zilei: ${lei(ctx.todayEarned)}. Drum bun spre casă!`
          : `Ai încasat ${lei(ctx.todayEarned)} din ${lei(ctx.todayTarget)}. Restul îl împart pe zilele următoare. Odihnește-te!`,
      });
    }
  }

  // Rush hour coming while you are on a break
  if (ctx.shiftActive && ctx.paused) {
    const nextHour = (Math.floor(minuteOfDay(ctx.now) / 60) + 1) * 60;
    const minutesTo = nextHour - minuteOfDay(ctx.now);
    if (minutesTo <= 15 && demandAt(heat, weekdayOf(dayKeyOf(ctx.now)), nextHour) >= 75) {
      out.push({
        key: `rush:${dayKeyOf(ctx.now)}:${nextHour}`, type: 'leave', at: ctx.now,
        title: 'Începe aglomerația',
        body: `De la ${fmtHM(nextHour)} cererea crește. Bun moment să revii la drum.`,
      });
    }
  }

  for (const b of ctx.bonuses) {
    if (b.achieved) continue;
    if (b.state === 'active') {
      const left = fmtDuration(b.minutesLeft);
      if (b.remaining <= 3) {
        out.push({
          key: `bonus:${b.key}:r${b.remaining}`, type: 'bonus', at: ctx.now,
          title: `Încă ${b.remaining} ${b.remaining === 1 ? 'cursă' : 'curse'} pentru bonus 💪`,
          body: `Bonusul de ${lei(b.bonus.reward)} e aproape. Mai ai ${left}. Poți!`,
        });
      }
      if (b.minutesLeft <= 60) {
        out.push({
          key: `bonus:${b.key}:t60`, type: 'bonus', at: ctx.now,
          title: 'Ultima oră pentru bonus ⏳',
          body: `${b.done}/${b.required} curse, mai ai ${left} pentru ${lei(b.bonus.reward)}.`,
        });
      }
      if (b.minutesLeft <= 30) {
        out.push({
          key: `bonus:${b.key}:t30`, type: 'bonus', at: ctx.now,
          title: 'Ultimele 30 de minute ⏳',
          body: `${b.done}/${b.required} curse. Încă ${b.remaining} pentru ${lei(b.bonus.reward)}.`,
        });
      }
    } else if (b.state === 'before' && b.startsInMin <= 15) {
      out.push({
        key: `bonus:${b.key}:start`, type: 'bonus', at: ctx.now,
        title: 'Începe fereastra de bonus 🎯',
        body: `${b.required} curse până la ${fmtHM(b.bonus.end)} pentru ${lei(b.bonus.reward)}.`,
      });
    }
  }

  if (ctx.todayTarget > 0 && ctx.todayEarned >= ctx.todayTarget) {
    out.push({
      key: `progress:${ctx.today}`, type: 'progress', at: ctx.now,
      title: 'Ținta de azi e atinsă 🎉',
      body: `Ai încasat ${lei(ctx.todayEarned)}. Tot ce faci de acum e în avans pentru săptămână.`,
    });
  }

  if (ctx.dayDone && !ctx.shiftActive) {
    const { earned, hours, endedAt } = ctx.dayDone;
    out.push({
      key: `sum:${ctx.today}`, type: 'summary', at: endedAt,
      title: 'Rezumatul zilei',
      body: `Azi: ${lei(earned)}, ${fmtDuration(hours * 60)}${hours > 0 ? `, ${Math.round(earned / hours)} lei/h` : ''}. ${message('endOfDay', ctx.today, { earned, hours }).split('.')[0]}.`,
    });
  }

  // Sunday (calendar day): planning in the morning, week summary + backup in the evening
  const calendarDay = dayKeyOf(ctx.now);
  const sunday = weekdayOf(calendarDay) === 6 ? calendarDay : weekdayOf(addDays(calendarDay, 1)) === 6 ? addDays(calendarDay, 1) : null;
  if (sunday && !ctx.nextWeekPlanned) {
    out.push({
      key: `plan:${ctx.nextWeekId}:9`, type: 'planning', at: zonedToTs(sunday, 9 * 60),
      title: 'Planificarea săptămânii 📅',
      body: 'Bună dimineața! Introdu bonusurile săptămânii și îți fac programul. Gata până la 10:00.',
    });
    out.push({
      key: `plan:${ctx.nextWeekId}:945`, type: 'planning', at: zonedToTs(sunday, 9 * 60 + 45),
      title: 'Mai sunt 15 minute până la 10:00 ⏰',
      body: 'Planul săptămânii durează doar două minute. Hai să-l facem!',
    });
  }
  if (sunday && ctx.week && ctx.week.target > 0) {
    const pct = (ctx.week.net / ctx.week.target) * 100;
    out.push({
      key: `week:${ctx.week.id}`, type: 'summary', at: zonedToTs(sunday, 20 * 60),
      title: pct >= 100 ? 'Săptămână reușită 🏆' : 'Rezumatul săptămânii',
      body: message(pct >= 100 ? 'goodWeek' : 'toughWeek', ctx.week.id, { net: ctx.week.net, pct }),
    });
  }
  if (sunday && (!ctx.lastBackupAt || ctx.now - ctx.lastBackupAt > 6 * 86_400_000)) {
    out.push({
      key: `backup:${sunday}`, type: 'backup', at: zonedToTs(sunday, 20 * 60 + 30),
      title: 'Un backup rapid?',
      body: 'Setări → Exportă backup. Durează 5 secunde și îți păstrează istoricul în siguranță.',
    });
  }

  return out.filter((n) => s.notifications[n.type] !== false).sort((a, b) => a.at - b.at);
}

/** Notices due now (not older than `graceMin`, so old ones are not spammed when the app opens). */
export function dueNotices(ctx: NoticeContext, sent: Set<string>, graceMin = 20): Notice[] {
  return allNotices(ctx).filter((n) => n.at <= ctx.now && n.at > ctx.now - graceMin * 60_000 && !sent.has(n.key));
}

export function nextNoticeAt(ctx: NoticeContext, sent: Set<string>): number | null {
  const n = allNotices(ctx).find((x) => x.at > ctx.now && !sent.has(x.key));
  return n ? n.at : null;
}

// ---------------- Anti-spam ----------------

export interface SentEntry { key: string; at: number; type?: NotificationType }

const PRIORITY: NotificationType[] = ['bonus', 'goHome', 'leave', 'breaks', 'progress', 'planning', 'summary', 'backup'];
const URGENT: NotificationType[] = ['bonus']; // may break the minimum gap

export function inQuietHours(now: number, from: number, to: number): boolean {
  if (from === to) return false;
  const m = minuteOfDay(now);
  return from < to ? m >= from && m < to : m >= from || m < to; // window may wrap midnight
}

/**
 * Picks what may actually be sent now:
 *  - nothing while muted ("Liniște 1h") or in quiet hours (unless you are in a shift),
 *  - at most `maxPerDay` per calendar day,
 *  - at least `minGapMin` minutes between notices (bonus countdowns excepted),
 *  - at most one non-urgent notice per check (the most important one).
 * Everything else that is due is dropped (marked as handled), so nothing arrives late.
 */
export function applyLimits(due: Notice[], log: SentEntry[], o: {
  now: number; maxPerDay: number; quietFrom: number; quietTo: number; shiftActive: boolean; muteUntil?: number; minGapMin?: number;
}): { send: Notice[]; drop: Notice[] } {
  if (!due.length) return { send: [], drop: [] };
  if ((o.muteUntil && o.now < o.muteUntil) || (!o.shiftActive && inQuietHours(o.now, o.quietFrom, o.quietTo))) return { send: [], drop: due };
  const today = dayKeyOf(o.now);
  const sentToday = log.filter((e) => e.type && dayKeyOf(e.at) === today);
  let budget = Math.max(0, o.maxPerDay - sentToday.length);
  const lastAt = sentToday.reduce((a, e) => Math.max(a, e.at), 0);
  const gapOk = o.now - lastAt >= (o.minGapMin ?? 20) * 60_000;

  const sorted = [...due].sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  const send: Notice[] = [];
  let nonUrgentSent = false;
  for (const n of sorted) {
    if (budget <= 0) break;
    const urgent = URGENT.includes(n.type);
    if (!urgent && (!gapOk || nonUrgentSent)) continue;
    if (urgent && send.some((x) => URGENT.includes(x.type))) continue; // one bonus notice at a time
    send.push(n);
    budget--;
    if (!urgent) nonUrgentSent = true;
  }
  return { send, drop: due.filter((n) => !send.includes(n)) };
}
