// Romanian UI texts used in several places. Screen-specific texts live next to their screen.
import type { BonusStatus, NotificationType } from '../domain/types';

export { WEEKDAY_NAMES, WEEKDAY_SHORT } from '../domain/defaults';

export const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export const NAV = {
  today: 'Azi',
  plan: 'Plan',
  stats: 'Statistici',
  settings: 'Setări',
};

export const BONUS_STATUS: Record<BonusStatus, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' }> = {
  sigur: { label: 'Realizabil', tone: 'good' },
  strans: { label: 'La limită', tone: 'warn' },
  neplanificat: { label: 'Neplanificat', tone: 'muted' },
  imposibil: { label: 'Imposibil', tone: 'bad' },
  ignorat: { label: 'Ignorat', tone: 'muted' },
};

export const NOTIFICATION_LABELS: Record<NotificationType, { label: string; example: string }> = {
  leave: { label: 'Plecare la drum', example: '„Pleacă acum: vine ora de vârf”' },
  breaks: { label: 'Pauze și masă', example: '„Pauză de masă 🍽️”' },
  bonus: { label: 'Progres bonus', example: '„Încă 3 curse pentru bonus, mai ai 1h 20m”' },
  goHome: { label: 'Timpul de mers acasă', example: '„Gata pe azi 🏠”' },
  planning: { label: 'Planificarea de duminică', example: '„Hai să planificăm săptămâna” (09:00)' },
  progress: { label: 'Ținta zilei atinsă', example: '„Ținta de azi e atinsă 🎉”' },
};

export function greeting(hour: number): string {
  if (hour < 5) return 'Noapte bună de lucru';
  if (hour < 11) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

/** "luni, 9 noiembrie" */
export function longDate(day: string, weekdayName: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${weekdayName}, ${d} ${MONTHS[m - 1]}`;
}

/** "9 nov" */
export function shortDate(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

export function ridesWord(n: number): string {
  const r = Math.round(n);
  if (r === 1) return 'cursă';
  return r % 100 >= 20 || r === 0 ? 'de curse' : 'curse';
}
