// Home screen: hero "left to earn today" with day/week/month rings, motivation, next block,
// bonus carousel, slide-to-start, quick logging.
import { CalendarCheck, Car, ChevronRight, Clock3, Coffee, Fuel, Gift, History, Maximize2, Receipt, Sparkles, Utensils } from 'lucide-react';
import type { BonusProgress } from '../../domain/bonus';
import { message, pickMoment } from '../../domain/messages';
import { lei, num } from '../../domain/money';
import { dayKeyOf, fmtDuration, fmtHM, weekdayOf, zonedParts } from '../../domain/time';
import { greeting, longDate, WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived, type Derived } from '../../store/derived';
import { AnimatedNumber, Bar, Card, SlideToConfirm, TripleRing } from '../components';
import { haptic } from '../haptics';
import { Timeline } from '../Timeline';

const L = (v: number) => lei(v);

export function motivationFor(d: Derived): string {
  const near = d.bonuses.find((b) => b.state === 'active' && !b.achieved);
  const moment = pickMoment({
    shiftActive: !!d.shift, paused: d.paused, earned: d.todayAct.gross, target: d.todayTarget,
    expectedSoFar: d.expectedSoFar, freeDay: d.freeDay, beforeFirstBlock: d.beforeFirstBlock, bonusRidesLeft: near?.remaining,
  });
  const fare = d.model.avgFare || 25;
  return message(moment, d.today, {
    target: d.todayTarget, earned: d.todayAct.gross, remaining: d.remainingToday,
    ahead: Math.max(0, d.todayAct.gross - d.expectedSoFar), rides: near && moment === 'nearBonus' ? near.remaining : Math.max(1, Math.ceil(d.remainingToday / fare)),
    minutes: near?.minutesLeft ?? (d.currentItem ? d.currentItem.end - d.currentItem.start : 40), reward: near?.bonus.reward,
    start: d.todayPlan?.runs[0]?.start, hours: d.hoursToday,
  });
}

export function NextLine({ d }: { d: Derived }) {
  const c = d.currentItem;
  let icon = <Clock3 size={20} />;
  let text: string | null = null;
  if (c?.kind === 'meal') { icon = <Utensils size={20} />; text = `Pauză de masă până la ${fmtHM(c.end)}`; }
  else if (c?.kind === 'rest') { icon = <Coffee size={20} />; text = `Pauză scurtă până la ${fmtHM(c.end)}`; }
  else if (c?.kind === 'work') {
    const runEnd = d.todayPlan?.runs.find((r) => r.start <= d.nowMin && d.nowMin < r.end)?.end;
    const nextBreak = d.todayPlan?.items.find((i) => i.start >= c.end && i.kind !== 'work');
    text = nextBreak && runEnd && nextBreak.start < runEnd
      ? `În program · ${nextBreak.kind === 'meal' ? 'masa' : 'pauză'} la ${fmtHM(nextBreak.start)}`
      : runEnd ? `În program până la ${fmtHM(runEnd)}` : null;
  } else {
    const run = d.todayPlan?.runs.find((r) => r.start >= d.nowMin);
    if (run) text = `Următoarea tură ${fmtHM(run.start)}–${fmtHM(run.end)} · în ${fmtDuration(run.start - d.nowMin)}`;
    else if (d.todayPlan?.runs.length) text = 'Programul de azi s-a încheiat';
  }
  if (!text) return null;
  return <div className="row" style={{ fontWeight: 600 }}><span className="accent-text">{icon}</span>{text}</div>;
}

export function BonusCard({ b }: { b: BonusProgress }) {
  const status = b.achieved ? 'Realizat ✓' : b.state === 'active' ? `${fmtDuration(b.minutesLeft)} rămase` : b.state === 'before' ? `începe la ${fmtHM(b.bonus.start)}` : 'încheiat';
  return (
    <div className="bonus-card" style={b.achieved ? { borderLeftColor: 'var(--gold)' } : undefined}>
      <div className="bonus-top">
        <span className="row" style={{ gap: 8 }}><Gift size={18} className="accent-text" /><b>{L(b.bonus.reward)}</b></span>
        <span className={b.achieved ? 'good-text small' : 'muted small'} style={{ fontWeight: 700 }}>{status}</span>
      </div>
      <Bar value={b.done} max={b.required} tone={b.achieved ? 'gold' : b.state === 'after' ? 'bad' : 'good'} />
      <span className="muted small">
        <b style={{ color: 'var(--text)' }}>{b.done}/{b.required}</b> curse · {fmtHM(b.bonus.start)}–{fmtHM(b.bonus.end)}
        {b.state === 'active' && !b.achieved && b.minutesLeft > 0 && ` · ~${num(b.remaining / (b.minutesLeft / 60), 1)}/h necesare`}
      </span>
    </div>
  );
}

export function TodayScreen({ go }: { go: (r: string) => void }) {
  const d = useDerived();
  const startShift = useApp((x) => x.startShift);
  const openQuickLog = useApp((x) => x.openQuickLog);
  const openWizard = useApp((x) => x.openWizard);
  const setShiftFull = useApp((x) => x.setShiftFull);
  const bonuses = useApp((x) => x.bonuses);

  const calendarToday = dayKeyOf(d.now);
  const isSunday = weekdayOf(calendarToday) === 6;
  const hour = zonedParts(d.now).h;
  const reached = d.todayTarget > 0 && d.todayAct.gross >= d.todayTarget;
  const bonusWindows = bonuses
    .filter((b) => b.weekId === d.weekId && b.days.includes(weekdayOf(d.today)))
    .map((b) => ({ start: b.start, end: b.end }));
  const shownBonuses = d.bonuses.filter((b) => b.state !== 'after' || b.achieved);

  return (
    <div className="screen">
      <div className="spread">
        <div>
          <div className="muted">{greeting(hour)}</div>
          <h1 style={{ margin: 0 }}>{longDate(d.today, WEEKDAY_NAMES[weekdayOf(d.today)])}</h1>
        </div>
        <button className="icon-btn" aria-label="Istoric" onClick={() => go('istoric')}><History size={22} /></button>
      </div>

      {d.shift && (
        <button className="btn soft" onClick={() => setShiftFull(false)}><Maximize2 size={18} /> Înapoi la modul tură</button>
      )}

      {isSunday && !d.nextWeekPlanned && (
        <div className="banner">
          <div className="row"><CalendarCheck className="accent-text" /><b>E duminică: planifică săptămâna viitoare</b></div>
          <span className="muted small">Introdu bonusurile și îți fac programul. Gata până la 10:00.</span>
          <button className="btn primary" onClick={() => openWizard(d.nextWeekStart)}>Planifică acum</button>
        </div>
      )}

      {!d.plan && (
        <Card className="alert">
          <b>Nu ai încă un plan pentru săptămâna asta.</b>
          <span className="muted small">Până atunci folosesc o țintă estimată: {L(d.todayTarget)} pe zi.</span>
          <button className="btn primary" onClick={() => openWizard(d.weekStart)}>Fă planul săptămânii</button>
        </Card>
      )}

      <Card className={`hero ${reached ? 'highlight' : ''}`}>
        <div className="eyebrow">{reached ? 'Ținta de azi e atinsă' : 'Mai ai de încasat azi'}</div>
        <div className="big-num">
          {reached ? <span className="accent-text"><AnimatedNumber value={d.todayAct.gross} format={L} /></span> : <AnimatedNumber value={d.remainingToday} format={L} />}
        </div>
        <div className="triple">
          <TripleRing size={136} rings={[
            { label: 'Azi', value: d.todayAct.gross, max: d.todayTarget, color: 'var(--accent)' },
            { label: 'Săptămâna', value: d.weekEarned, max: d.weekNeeded, color: 'var(--teal)' },
            { label: 'Luna', value: d.monthEarned, max: d.monthNeeded, color: 'var(--violet)' },
          ]} center={<b style={{ fontSize: '1.15rem' }}>{d.todayTarget > 0 ? Math.min(999, Math.round((d.todayAct.gross / d.todayTarget) * 100)) : 0}%</b>} />
          <div className="legend-rows">
            <div className="legend-row"><i style={{ background: 'var(--accent)' }} /><span>Azi</span><b>{L(d.todayAct.gross)} <span className="muted small">/ {L(d.todayTarget)}</span></b></div>
            <div className="legend-row"><i style={{ background: 'var(--teal)' }} /><span>Săpt.</span><b>{L(d.weekEarned)} <span className="muted small">/ {L(d.weekNeeded)}</span></b></div>
            <div className="legend-row"><i style={{ background: 'var(--violet)' }} /><span>Luna</span><b>{L(d.monthEarned)} <span className="muted small">/ {L(d.monthNeeded)}</span></b></div>
          </div>
        </div>
        <span className="muted small">Sume brute, ca în Bolt. Ținta NET: {L(d.weekNetTarget)}/săpt · {L(d.monthNetTarget)}/lună.</span>
      </Card>

      <div className="row motivation"><Sparkles size={20} className="accent-text" /> <span>{motivationFor(d)}</span></div>

      {!d.shift && <SlideToConfirm label="Glisează ca să pornești tura" icon={<Car size={28} />} onConfirm={startShift} />}

      {(d.todayPlan?.items.length ?? 0) > 0 && (
        <Card title="Programul de azi" right={<button className="btn small ghost" onClick={() => go('plan')}>Plan <ChevronRight size={16} /></button>}>
          <Timeline items={d.todayPlan!.items} bonusWindows={bonusWindows} nowMin={d.nowMin} />
          <NextLine d={d} />
        </Card>
      )}

      {shownBonuses.length > 0 && (
        <div>
          <div className="eyebrow" style={{ margin: '0 4px 8px' }}>Bonusuri azi</div>
          <div className="carousel">{shownBonuses.map((b) => <BonusCard key={b.key} b={b} />)}</div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat"><div className="label">Încasat azi</div><div className="value accent"><AnimatedNumber value={d.todayAct.gross} format={L} /></div></div>
        <div className="stat"><div className="label">Curse azi</div><div className="value">{d.todayAct.rideCount}</div></div>
        <div className="stat"><div className="label">Lei/oră acum</div><div className={`value ${d.perHourNow === 0 ? '' : d.perHourNow >= d.neededPerHour ? 'good' : 'warn'}`}>{num(d.perHourNow, 0)}</div></div>
        <div className="stat"><div className="label">Lei/oră necesar</div><div className="value">{num(d.neededPerHour, 0)}</div></div>
      </div>

      <div className="quick-grid">
        <button className="btn" onClick={() => { haptic('tap'); openQuickLog('ride'); }}><Car size={26} />Adaugă cursă</button>
        <button className="btn" onClick={() => { haptic('tap'); openQuickLog('fuel'); }}><Fuel size={26} />Combustibil</button>
        <button className="btn" onClick={() => { haptic('tap'); openQuickLog('payout'); }}><Gift size={26} />Bonus încasat</button>
        <button className="btn" onClick={() => { haptic('tap'); openQuickLog('total'); }}><Receipt size={26} />Total zi din Bolt</button>
      </div>
    </div>
  );
}
