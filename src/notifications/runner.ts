// Browser side of notifications: permission, showing them (system notification or in-app banner),
// a loop that checks what is due and applies the anti-spam limits, and keeping the screen on during a shift.
//
// LIMITATION: a PWA cannot schedule exact notifications while it is fully closed
// (no server push). Notices are shown while the app is open or recently in the background.
// For guaranteed reminders use the calendar export (.ics).
import { useEffect, useRef } from 'react';
import { weeklyFixedCosts } from '../domain/finance';
import { applyLimits, dueNotices, nextNoticeAt, type Notice, type NoticeContext } from '../domain/notifications';
import { summarize } from '../domain/stats';
import { dayKeyOf, minuteOfDay, weekDays, weekdayOf } from '../domain/time';
import type { Derived } from '../store/derived';
import { useApp } from '../store/app';

export const MUTE_CACHE = 'tura-meta';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export async function showNotice(n: Pick<Notice, 'title' | 'body' | 'key'>): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const options: NotificationOptions & { vibrate?: number[]; actions?: { action: string; title: string }[] } = {
    body: n.body,
    tag: n.key,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [180, 80, 180],
    data: { url: location.href.split('#')[0] + '#/azi' },
    actions: [{ action: 'mute', title: 'Liniște 1h' }],
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(n.title, options);
      return true;
    }
    new Notification(n.title, options);
    return true;
  } catch {
    return false;
  }
}

/** "Liniște 1h" pressed on a notification: the service worker stores the time in a small cache. */
async function muteUntil(): Promise<number | undefined> {
  try {
    const c = await caches.open(MUTE_CACHE);
    const r = await c.match('/mute');
    return r ? Number(await r.text()) : undefined;
  } catch {
    return undefined;
  }
}

function contextFrom(d: Derived): NoticeContext {
  const st = useApp.getState();
  const { settings, heatmap } = st;
  const now = Date.now();
  // Day summary: last finished shift of today (no shift running).
  const ended = st.data.shifts.filter((s) => s.day === d.today && s.end !== null);
  const dayDone = !d.shift && ended.length
    ? { endedAt: Math.max(...ended.map((s) => s.end as number)), earned: d.todayAct.gross, hours: d.hoursToday }
    : undefined;
  // Week result, only needed on Sunday evening.
  let week: NoticeContext['week'];
  const cal = dayKeyOf(now);
  if (weekdayOf(cal) === 6 && minuteOfDay(now) >= 19 * 60) {
    const sum = summarize({ days: weekDays(d.weekStart), data: st.data, settings, model: d.model, fixedCosts: weeklyFixedCosts(settings), netTarget: d.weekNetTarget, now });
    if (sum.hours > 0) week = { id: d.weekId, net: sum.money.net, target: d.weekNetTarget };
  }
  return {
    now,
    today: d.today,
    settings,
    heat: heatmap,
    dayPlans: d.dayPlansForNotices,
    todayTarget: d.todayTarget,
    todayEarned: d.todayAct.gross,
    shiftActive: !!d.shift,
    paused: d.paused,
    bonuses: d.bonuses,
    nextWeekPlanned: d.nextWeekPlanned,
    nextWeekId: d.nextWeekId,
    dayDone,
    week,
    lastBackupAt: st.lastBackupAt,
  };
}

/** Checks every 30 s (and exactly at the next planned notice) what should be shown. */
export function useNotificationLoop(d: Derived) {
  const ref = useRef(d);
  ref.current = d;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const app = useApp.getState();
        const ctx = contextFrom(ref.current);
        const due = dueNotices(ctx, new Set(app.sent));
        if (due.length) {
          const s = app.settings;
          const { send, drop } = applyLimits(due, app.sentLog, {
            now: ctx.now, maxPerDay: s.notifyMaxPerDay, quietFrom: s.quietFrom, quietTo: s.quietTo,
            shiftActive: ctx.shiftActive, muteUntil: await muteUntil(),
          });
          await app.logNotices(send, drop);
          const visible = document.visibilityState === 'visible';
          for (const n of send) {
            if (visible) {
              // App on screen: a calm in-app banner instead of a system notification.
              if (n.type !== 'summary') app.showBanner(n);
            } else if (!(await showNotice(n))) {
              app.showBanner(n);
            }
          }
        }
        clearTimeout(timer);
        const next = nextNoticeAt(ctx, new Set(useApp.getState().sent));
        timer = setTimeout(tick, next ? Math.min(Math.max(1000, next - Date.now() + 500), 30_000) : 30_000);
      } finally {
        busy = false;
      }
    };
    tick();
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen on while a shift is active (helps the app stay alive for notifications). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!active || !nav.wakeLock) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await nav.wakeLock!.request('screen');
        if (cancelled) lock.release();
      } catch {
        /* battery saver or not visible */
      }
    };
    acquire();
    const vis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}
