// Home screen: today's plan, shift buttons, live progress (day / week / month), bonuses, quick logging.
import { shiftMinutes } from '../../domain/actuals';
import { lei, num } from '../../domain/money';
import { dayKeyOf, fmtDuration, fmtHM, weekdayOf, zonedParts } from '../../domain/time';
import { greeting, longDate, ridesWord, WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived, type Derived } from '../../store/derived';
import { Bar, Card, Ring } from '../components';
import { Timeline } from '../Timeline';

function motivation(d: Derived): string {
  const fare = d.model.avgFare || 25;
  if (d.todayTarget > 0 && d.todayAct.gross >= d.todayTarget) return 'Ținta de azi e atinsă 🎉 Orice cursă în plus e avans pentru săptămână.';
  if (d.shift && d.remainingToday > 0) {
    const n = Math.max(1, Math.ceil(d.remainingToday / fare));
    return `Încă ~${n} ${ridesWord(n)} și ai ținta de azi. Poți! 💪`;
  }
  const first = d.todayPlan?.runs[0];
  if (!d.shift && first && d.nowMin < first.start) {
    return `Azi ai ${num(d.todayPlan!.workHours, 1)} h în plan, ținta ${lei(d.todayTarget)}. Prima tură începe la ${fmtHM(first.start)}.`;
  }
  if (d.rb && d.rb.deltaVsPlan > 20) return `Ești cu ${lei(d.rb.deltaVsPlan)} înainte pe săptămână. Bravo! 💪`;
  if (d.todayPlan && d.todayPlan.workHours === 0) return 'Azi e zi liberă în plan. Odihnește-te, meriți! 😌';
  return 'Fiecare cursă te apropie de țintă. Hai la drum! 🚗';
}

function nowLine(d: Derived): string | null {
  const c = d.currentItem;
  const n = d.nextItem;
  if (c?.kind === 'meal') return `Acum: pauză de masă până la ${fmtHM(c.end)} 🍽️`;
  if (c?.kind === 'rest') return `Acum: pauză scurtă până la ${fmtHM(c.end)} ☕`;
  if (c?.kind === 'work') {
    const runEnd = d.todayPlan?.runs.find((r) => r.start <= d.nowMin && d.nowMin < r.end)?.end;
    const nextBreak = d.todayPlan?.items.find((i) => i.start >= c.end && i.kind !== 'work');
    if (nextBreak && runEnd && nextBreak.start < runEnd) return `În program. Urmează ${nextBreak.kind === 'meal' ? 'masa' : 'o pauză'} la ${fmtHM(nextBreak.start)}.`;
    return runEnd ? `În program până la ${fmtHM(runEnd)}.` : null;
  }
  if (n) {
    const run = d.todayPlan?.runs.find((r) => r.start >= d.nowMin);
    if (run) return `Următoarea tură: ${fmtHM(run.start)}–${fmtHM(run.end)} (în ${fmtDuration(run.start - d.nowMin)}).`;
  }
  if (d.todayPlan?.runs.length) return 'Programul de azi s-a încheiat. Drum bun acasă! 🏠';
  return null;
}

export function TodayScreen({ go }: { go: (r: string) => void }) {
  const d = useDerived();
  const startShift = useApp((x) => x.startShift);
  const pauseShift = useApp((x) => x.pauseShift);
  const resumeShift = useApp((x) => x.resumeShift);
  const endShift = useApp((x) => x.endShift);
  const openQuickLog = useApp((x) => x.openQuickLog);
  const openWizard = useApp((x) => x.openWizard);
  const showToast = useApp((x) => x.showToast);
  const bonuses = useApp((x) => x.bonuses);

  const calendarToday = dayKeyOf(d.now);
  const isSunday = weekdayOf(calendarToday) === 6;
  const hour = zonedParts(d.now).h;
  const shiftMin = d.shift ? shiftMinutes(d.shift, d.now) : 0;
  const plannedRides = d.todayPlan && d.todayPlan.gross > 0 ? Math.round((d.todayPlan.rides * d.todayTarget) / (d.todayPlan.gross + d.todayPlan.bonusGross || 1)) : 0;
  const rateTone = d.perHourNow === 0 ? '' : d.perHourNow >= d.neededPerHour ? 'good' : 'warn';
  const line = nowLine(d);
  const bonusWindows = bonuses
    .filter((b) => b.weekId === d.weekId && b.days.includes(weekdayOf(d.today)))
    .map((b) => ({ start: b.start, end: b.end }));

  const onEnd = async () => {
    if (!confirm('Închei tura?')) return;
    await endShift();
    showToast(d.todayAct.gross >= d.todayTarget && d.todayTarget > 0 ? 'Tură încheiată, ținta atinsă 🎉' : 'Tură încheiată. Odihnește-te bine! 🏠');
  };

  return (
    <div className="screen">
      <div>
        <div className="muted">{greeting(hour)} 👋</div>
        <h1 style={{ margin: 0 }}>{longDate(d.today, WEEKDAY_NAMES[weekdayOf(d.today)])}</h1>
      </div>

      {isSunday && !d.nextWeekPlanned && (
        <div className="banner">
          <b>📅 E duminică: planifică săptămâna viitoare</b>
          <span className="muted small">Introdu bonusurile și îți fac programul. Gata până la 10:00.</span>
          <button className="btn primary" onClick={() => openWizard(d.nextWeekStart)}>Planifică acum</button>
        </div>
      )}

      {!d.plan && (
        <Card className="alert">
          <b>Nu ai încă un plan pentru săptămâna asta.</b>
          <span className="muted small">Până atunci folosesc o țintă estimată: {lei(d.todayTarget)} pe zi.</span>
          <button className="btn primary" onClick={() => openWizard(d.weekStart)}>Fă planul săptămânii</button>
        </Card>
      )}

      <Card>
        <div className="rings">
          <Ring value={d.todayAct.gross} max={d.todayTarget} label="Azi" sub={`${lei(d.todayAct.gross)} / ${lei(d.todayTarget)}`} />
          <Ring value={d.weekEarned} max={d.weekNeeded} label="Săptămâna" sub={`${lei(d.weekEarned)} / ${lei(d.weekNeeded)}`} color="var(--info)" />
          <Ring value={d.monthEarned} max={d.monthNeeded} label="Luna" sub={`${lei(d.monthEarned)} / ${lei(d.monthNeeded)}`} color="#a78bfa" />
        </div>
        <p className="muted small center">Sume brute (cum apar în Bolt). Ținta NET: {lei(d.weekNetTarget)}/săpt · {lei(d.monthNetTarget)}/lună.</p>
      </Card>

      {!d.shift ? (
        <button className="btn primary huge" onClick={startShift}>▶ Începe tura</button>
      ) : (
        <>
          <div className="shift-clock">{d.paused ? '⏸ În pauză' : '🟢 În tură'} · <b>{fmtDuration(shiftMin)}</b></div>
          <div className="btn-row">
            {d.paused ? (
              <button className="btn primary huge" onClick={resumeShift}>▶ Reia</button>
            ) : (
              <button className="btn warn huge" onClick={pauseShift}>⏸ Pauză</button>
            )}
            <button className="btn danger huge" onClick={onEnd}>⏹ Termină</button>
          </div>
        </>
      )}

      <p className="motivation">{motivation(d)}</p>

      <div className="stat-grid">
        <div className="stat"><div className="label">Încasat azi</div><div className="value good">{lei(d.todayAct.gross)}</div></div>
        <div className="stat"><div className="label">Rămas azi</div><div className="value">{lei(d.remainingToday)}</div></div>
        <div className="stat">
          <div className="label">Lei/oră acum · necesar</div>
          <div className={`value ${rateTone}`}>{num(d.perHourNow, 0)} <span className="muted small">/ {num(d.neededPerHour, 0)}</span></div>
        </div>
        <div className="stat"><div className="label">Curse azi</div><div className="value">{d.todayAct.rideCount}{plannedRides > 0 && <span className="muted small"> / ~{plannedRides}</span>}</div></div>
      </div>

      {d.bonuses.map((b) => (
        <div key={b.key} className="bonus-card">
          <div className="bonus-top">
            <b>🎁 Bonus {lei(b.bonus.reward)}</b>
            <span className={b.achieved ? 'good-text' : 'muted'}>
              {b.achieved ? 'Realizat ✓' : b.state === 'active' ? `${fmtDuration(b.minutesLeft)} rămase` : b.state === 'before' ? `începe la ${fmtHM(b.bonus.start)}` : 'încheiat'}
            </span>
          </div>
          <Bar value={b.done} max={b.required} tone={b.achieved ? 'gold' : b.state === 'after' ? 'bad' : 'good'} />
          <span className="muted small">
            {b.done}/{b.required} curse · {fmtHM(b.bonus.start)}–{fmtHM(b.bonus.end)}
            {b.state === 'active' && !b.achieved && b.minutesLeft > 0 && ` · ~${num(b.remaining / (b.minutesLeft / 60), 1)} curse/oră necesare`}
          </span>
        </div>
      ))}

      {d.todayPlan && d.todayPlan.items.length > 0 && (
        <Card title="Programul de azi" right={<button className="btn small ghost" onClick={() => go('plan')}>Plan ›</button>}>
          <Timeline items={d.todayPlan.items} bonusWindows={bonusWindows} nowMin={d.nowMin} />
          {line && <span>{line}</span>}
        </Card>
      )}

      <div className="quick-grid">
        <button className="btn" onClick={() => openQuickLog('ride')}><span className="ico">🚕</span>+ Cursă</button>
        <button className="btn" onClick={() => openQuickLog('fuel')}><span className="ico">⛽</span>Combustibil</button>
        <button className="btn" onClick={() => openQuickLog('payout')}><span className="ico">🎁</span>Bonus încasat</button>
        <button className="btn" onClick={() => openQuickLog('total')}><span className="ico">🧾</span>Total zi din Bolt</button>
      </div>

      <button className="btn ghost" onClick={() => go('istoric')}>📜 Istoric înregistrări</button>
    </div>
  );
}
