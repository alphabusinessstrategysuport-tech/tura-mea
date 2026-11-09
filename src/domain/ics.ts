// Calendar export (.ics) with alarms: the most reliable way to get reminders
// on Android without a server. Import the file in Google Calendar.
import { lei } from './money';
import { addDays, fmtHM, weekdayOf, zonedToTs } from './time';
import type { DayKey, WeekPlan } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

function utcStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Bucharest',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:EEST',
  'DTSTART:19700329T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:EET',
  'DTSTART:19701025T040000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function alarm(minutesBefore: number, text: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:-PT${minutesBefore}M`, 'END:VALARM'];
}

export function nextSunday(from: DayKey): DayKey {
  const wd = weekdayOf(from);
  return addDays(from, wd === 6 ? 0 : 6 - wd);
}

export function buildIcs(opts: { plan?: WeekPlan; leadMin: number; includeBreaks: boolean; planningReminderFrom?: DayKey; now: number }): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tura Mea//RO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTIMEZONE];
  const stamp = utcStamp(opts.now);
  const plan = opts.plan;
  if (plan) {
    for (const d of plan.days) {
      d.runs.forEach((r, i) => {
        lines.push(
          'BEGIN:VEVENT',
          `UID:tura-${plan.id}-${d.day}-${i}@tura-mea`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${utcStamp(zonedToTs(d.day, r.start))}`,
          `DTEND:${utcStamp(zonedToTs(d.day, r.end))}`,
          `SUMMARY:${esc(`🚗 Tură ${fmtHM(r.start)}–${fmtHM(r.end)}`)}`,
          `DESCRIPTION:${esc(`Ținta zilei: ${lei(d.targetGross + d.bonusGross)} brut, ~${Math.round(d.rides)} curse.`)}`,
          ...alarm(opts.leadMin, 'E timpul să pleci. Spor la drum!'),
          'END:VEVENT',
        );
      });
      if (opts.includeBreaks) {
        d.items.filter((it) => it.kind === 'meal').forEach((it, i) => {
          lines.push(
            'BEGIN:VEVENT',
            `UID:masa-${plan.id}-${d.day}-${i}@tura-mea`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${utcStamp(zonedToTs(d.day, it.start))}`,
            `DTEND:${utcStamp(zonedToTs(d.day, it.end))}`,
            `SUMMARY:${esc('🍽️ Pauză de masă')}`,
            ...alarm(0, 'Pauză de masă. Mănâncă liniștit!'),
            'END:VEVENT',
          );
        });
      }
    }
  }
  if (opts.planningReminderFrom) {
    const sun = nextSunday(opts.planningReminderFrom).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      'UID:planificare-duminica@tura-mea',
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Bucharest:${sun}T090000`,
      `DTEND;TZID=Europe/Bucharest:${sun}T093000`,
      'RRULE:FREQ=WEEKLY;BYDAY=SU',
      `SUMMARY:${esc('📅 Planifică săptămâna (Tura Mea)')}`,
      `DESCRIPTION:${esc('Introdu bonusurile și generează programul. Gata până la 10:00.')}`,
      ...alarm(0, 'Hai să planificăm săptămâna!'),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** One-tap link that opens Google Calendar with a weekly Sunday 09:00 reminder pre-filled. */
export function googlePlanningReminderUrl(from: DayKey): string {
  const sun = nextSunday(from).replace(/-/g, '');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: '📅 Planifică săptămâna (Tura Mea)',
    details: 'Introdu bonusurile și generează programul. Gata până la 10:00.',
    dates: `${sun}T090000/${sun}T093000`,
    ctz: 'Europe/Bucharest',
    recur: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
