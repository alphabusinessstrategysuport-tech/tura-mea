// Browser side of notifications: permission, showing them through the service worker,
// a loop that checks what is due, and keeping the screen on during a shift.
//
// LIMITATION: a PWA cannot schedule exact notifications while it is fully closed
// (no server push). Notices are shown while the app is open or recently in the background.
// For guaranteed reminders use the calendar export (.ics).
import { useEffect, useRef } from 'react';
import { dueNotices, nextNoticeAt, type Notice, type NoticeContext } from '../domain/notifications';
import type { Derived } from '../store/derived';
import { useApp } from '../store/app';

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
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: n.body,
    tag: n.key,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [180, 80, 180],
    data: { url: location.href.split('#')[0] + '#/azi' },
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

function contextFrom(d: Derived): NoticeContext {
  const { settings, heatmap } = useApp.getState();
  return {
    now: Date.now(),
    today: d.today,
    settings,
    heat: heatmap,
    dayPlans: d.dayPlansForNotices,
    todayTarget: d.todayTarget,
    todayEarned: d.todayAct.gross,
    shiftActive: !!d.shift,
    bonuses: d.bonuses,
    nextWeekPlanned: d.nextWeekPlanned,
    nextWeekId: d.nextWeekId,
  };
}

/** Checks every 30 s (and exactly at the next planned notice) what should be shown. */
export function useNotificationLoop(d: Derived) {
  const ref = useRef(d);
  ref.current = d;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const app = useApp.getState();
      const ctx = contextFrom(ref.current);
      const sent = new Set(app.sent);
      const due = dueNotices(ctx, sent);
      if (due.length) {
        await app.markSent(due.map((n) => n.key));
        for (const n of due) {
          const shown = await showNotice(n);
          if (!shown && document.visibilityState === 'visible') app.showToast(`${n.title} — ${n.body}`);
        }
      }
      clearTimeout(timer);
      const next = nextNoticeAt(ctx, new Set(useApp.getState().sent));
      if (next) timer = setTimeout(tick, Math.min(Math.max(1000, next - Date.now() + 500), 30_000));
      else timer = setTimeout(tick, 30_000);
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
