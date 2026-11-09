// Motivational message library (Romanian). Warm and encouraging, never guilt-inducing.
// The same moment on the same day always shows the same message (no flicker), but days vary.
import { lei } from './money';
import { fmtDuration, fmtHM } from './time';

export type Moment =
  | 'beforeShift' | 'startShift' | 'behind' | 'onTrack' | 'ahead' | 'nearBonus'
  | 'breakTime' | 'goalReached' | 'endOfDay' | 'freeDay' | 'goodWeek' | 'toughWeek';

type Params = Partial<{ target: number; earned: number; remaining: number; ahead: number; rides: number; minutes: number; reward: number; start: number; net: number; pct: number; hours: number }>;

const L = (n?: number) => lei(n ?? 0);

export const MESSAGES: Record<Moment, ((p: Params) => string)[]> = {
  beforeShift: [
    (p) => `Azi ținta e ${L(p.target)}. Prima tură începe la ${fmtHM(p.start ?? 0)}.`,
    (p) => `Te așteaptă o zi bună: ${L(p.target)}, pas cu pas. Start la ${fmtHM(p.start ?? 0)}.`,
    () => 'Un plan bun e jumătate din drum. Restul îl facem împreună.',
  ],
  startShift: [
    (p) => `Spor la drum! Azi ținta e ${L(p.target)}, una câte una.`,
    () => 'Ești pe drum. Restul vine cursă cu cursă.',
    () => 'Tura a început. Condu liniștit, cifrele le țin eu.',
  ],
  behind: [
    () => 'Ritmul e mai lent azi, se mai întâmplă. Ziua nu s-a terminat.',
    (p) => `Câteva curse bune și recuperezi. Mai ai ${L(p.remaining)}, fără grabă.`,
    () => 'Nu toate orele sunt la fel. Urmează intervalele mai aglomerate.',
  ],
  onTrack: [
    (p) => `Încă ~${p.rides ?? 0} curse și ai ținta de azi. Ești pe drumul bun.`,
    (p) => `Mai ai ${L(p.remaining)}. Ritmul e bun, ține-o tot așa.`,
    () => 'Constanța face diferența. Merge bine.',
  ],
  ahead: [
    (p) => `Ești cu ${L(p.ahead)} înainte. Frumos!`,
    () => 'Merge foarte bine azi. Poți respira liniștit.',
    (p) => `Peste plan cu ${L(p.ahead)}. Săptămâna arată tot mai bine.`,
  ],
  nearBonus: [
    (p) => `Încă ${p.rides} ${p.rides === 1 ? 'cursă' : 'curse'} până la ${L(p.reward)}. Ești aproape!`,
    (p) => `Mai ai ${fmtDuration(p.minutes ?? 0)} și ${p.rides} ${p.rides === 1 ? 'cursă' : 'curse'}. Se poate.`,
    (p) => `Bonusul de ${L(p.reward)} e la îndemână.`,
  ],
  breakTime: [
    (p) => `Ai muncit bine. ${p.minutes ?? 40} de minute doar pentru tine.`,
    () => 'Apă, o gustare, întinde-te puțin. Revii mai odihnit.',
    () => 'Pauza face parte din plan. Bucură-te de ea.',
  ],
  goalReached: [
    () => 'Ținta de azi e atinsă. Orice cursă în plus e avans pentru săptămână.',
    (p) => `Ziua e făcută: ${L(p.earned)}. Bravo!`,
    () => 'Obiectiv atins. Restul zilei e bonus.',
  ],
  endOfDay: [
    (p) => `Gata pe azi. Ai încasat ${L(p.earned)}, drum bun acasă!`,
    () => 'Zi închisă. Mâine continuăm de aici.',
    (p) => `${L(p.earned)} în ${fmtDuration((p.hours ?? 0) * 60)}. Odihnește-te bine.`,
  ],
  freeDay: [
    () => 'Azi e zi liberă în plan. Odihnește-te, meriți!',
    () => 'Zi de pauză. Încarcă bateriile pentru mâine.',
  ],
  goodWeek: [
    (p) => `Săptămâna e în buzunar: ${L(p.net)} net. Bravo!`,
    () => 'Peste țintă. Meriți o duminică liniștită.',
    (p) => `${Math.round(p.pct ?? 100)}% din țintă. Săptămână foarte bună.`,
  ],
  toughWeek: [
    () => 'N-a fost săptămâna ta, dar ai rămas constant. Asta contează.',
    () => 'Săptămâna viitoare o luăm de la capăt, cu un plan bun.',
    (p) => `${L(p.net)} net, ${Math.round(p.pct ?? 0)}% din țintă. Fiecare săptămână te învață ceva.`,
  ],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Stable pick: same seed (e.g. day) + moment → same message. */
export function message(moment: Moment, seed: string, p: Params = {}): string {
  const pool = MESSAGES[moment];
  return pool[hash(`${seed}:${moment}`) % pool.length](p);
}

/** Which moment fits the home/shift screen right now. */
export function pickMoment(s: {
  shiftActive: boolean; paused: boolean; earned: number; target: number; expectedSoFar: number;
  freeDay: boolean; beforeFirstBlock: boolean; bonusRidesLeft?: number;
}): Moment {
  if (s.target > 0 && s.earned >= s.target) return 'goalReached';
  if (s.paused) return 'breakTime';
  if (s.bonusRidesLeft !== undefined && s.bonusRidesLeft > 0 && s.bonusRidesLeft <= 3) return 'nearBonus';
  if (!s.shiftActive) return s.freeDay ? 'freeDay' : s.beforeFirstBlock ? 'beforeShift' : s.earned > 0 ? 'endOfDay' : 'beforeShift';
  if (s.earned === 0) return 'startShift';
  const diff = s.earned - s.expectedSoFar;
  if (diff > Math.max(20, s.target * 0.08)) return 'ahead';
  if (diff < -Math.max(20, s.target * 0.12)) return 'behind';
  return 'onTrack';
}
