// Weekly and monthly summary: target vs. actual, net profit, hours, average per hour, best hours and days.
import { useMemo, useState } from 'react';
import { monthlyFixedCosts, monthlyNetTarget, weeklyFixedCosts, weeklyNetTarget } from '../../domain/finance';
import { lei, num } from '../../domain/money';
import { perWeekday, summarize } from '../../domain/stats';
import { addDays, daysInMonth, monthKeyOf, weekDays, weekIdOf, weekdayOf } from '../../domain/time';
import { MONTHS, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Card, Chips, Ring } from '../components';
import { weekLabel } from './PlanningWizard';

function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function StatsScreen() {
  const d = useDerived();
  const settings = useApp((x) => x.settings);
  const data = useApp((x) => x.data);
  const plans = useApp((x) => x.plans);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(d.weekStart);
  const [month, setMonth] = useState(monthKeyOf(d.today));

  const days = period === 'week' ? weekDays(weekStart) : daysInMonth(month);
  const elapsed = days.filter((x) => x <= d.today).length;
  const full = period === 'week' ? weeklyFixedCosts(settings) : monthlyFixedCosts(settings) * (days.length / (7 * settings.weeksPerMonth));
  const fixed = (full * elapsed) / days.length;
  const plan = period === 'week' ? plans[weekIdOf(weekStart)] : undefined;
  const netTarget = period === 'week' ? plan?.netTarget ?? weeklyNetTarget(settings) : monthlyNetTarget(settings);
  const partial = elapsed < days.length && elapsed > 0;

  const sum = useMemo(
    () => summarize({ days, data, settings, model: d.model, fixedCosts: fixed, netTarget, now: d.now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days.join(), data, settings, d.model, fixed, netTarget, d.now],
  );
  const byWeekday = perWeekday(sum.days).filter((x) => x.hours > 0).sort((a, b) => b.gross / b.hours - a.gross / a.hours);
  const maxGross = Math.max(1, ...sum.days.map((x) => x.gross), ...(plan?.days.map((p) => p.targetGross + p.bonusGross) ?? []));
  const [, mm] = month.split('-').map(Number);

  return (
    <div className="screen">
      <h1>Statistici</h1>
      <Chips options={[{ value: 'week', label: 'Săptămâna' }, { value: 'month', label: 'Luna' }]} value={period} onChange={setPeriod} />
      <div className="card-head">
        <button className="icon-btn" aria-label="Perioada anterioară" onClick={() => (period === 'week' ? setWeekStart(addDays(weekStart, -7)) : setMonth(shiftMonth(month, -1)))}>‹</button>
        <b>{period === 'week' ? weekLabel(weekStart) : `${MONTHS[mm - 1]} ${month.slice(0, 4)}`}</b>
        <button className="icon-btn" aria-label="Perioada următoare" onClick={() => (period === 'week' ? setWeekStart(addDays(weekStart, 7)) : setMonth(shiftMonth(month, 1)))}>›</button>
      </div>

      <Card className={sum.money.net >= netTarget ? 'highlight' : ''}>
        <div className="rings">
          <Ring value={Math.max(0, sum.money.net)} max={netTarget} size={120} label="Profit NET" sub={`${lei(sum.money.net)} / ${lei(netTarget)}`} />
          <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
            <div className="stat"><div className="label">Ore lucrate</div><div className="value">{num(sum.hours, 1)} h</div></div>
            <div className="stat"><div className="label">Medie brut / net pe oră</div><div className="value">{num(sum.grossPerHour, 0)} <span className="muted small">/ {num(sum.netPerHour, 0)} lei</span></div></div>
          </div>
        </div>
        {partial && <p className="muted small center">Perioadă în curs: costurile fixe sunt socotite pentru {elapsed} din {days.length} zile.</p>}
      </Card>

      <Card title="Bani">
        <div className="kv"><span>Curse ({sum.rides})</span><b>{lei(sum.rideGross)}</b></div>
        <div className="kv"><span>Bonusuri</span><b>{lei(sum.bonusGross)}</b></div>
        <div className="kv"><span>Comision {settings.commissionPct}%</span><b className="bad-text">−{lei(sum.money.commission)}</b></div>
        {sum.money.tax > 0 && <div className="kv"><span>Taxe {settings.taxPct}%</span><b className="bad-text">−{lei(sum.money.tax)}</b></div>}
        <div className="kv"><span>Combustibil {sum.fuelIsEstimate ? '(estimat)' : '(alimentări)'}</span><b className="bad-text">−{lei(sum.fuelUsed)}</b></div>
        <div className="kv"><span>Costuri fixe</span><b className="bad-text">−{lei(sum.money.fixed)}</b></div>
        <div className="kv total"><span>Profit NET</span><span className={sum.money.net >= 0 ? 'good-text' : 'bad-text'}>{lei(sum.money.net)}</span></div>
      </Card>

      <Card title="Pe zile">
        <div className="bars">
          {sum.days.map((x) => {
            const t = plan?.days.find((p) => p.day === x.day);
            const target = t ? t.targetGross + t.bonusGross : 0;
            return (
              <div key={x.day} className="col" title={`${x.day}: ${lei(x.gross)}`}>
                {target > 0 && <div className="target" style={{ bottom: `calc(${(target / maxGross) * 100}% * 0.85 + 18px)` }} />}
                <div className="fill" style={{ height: `${(x.gross / maxGross) * 85}%`, background: target > 0 && x.gross >= target ? 'var(--gold)' : undefined }} />
                <span className="lbl">{period === 'week' ? WEEKDAY_SHORT[weekdayOf(x.day)] : Number(x.day.slice(8)) % 5 === 1 ? Number(x.day.slice(8)) : ''}</span>
              </div>
            );
          })}
        </div>
        {plan && <p className="muted small">Linia punctată = ținta zilei din plan. Auriu = țintă atinsă.</p>}
        {sum.bestDay && <p>🏆 Cea mai bună zi: <b>{WEEKDAY_NAMES[weekdayOf(sum.bestDay.day)]} {Number(sum.bestDay.day.slice(8))}</b> cu {lei(sum.bestDay.gross)} ({num(sum.bestDay.perHour, 0)} lei/h)</p>}
      </Card>

      <Card title="Cele mai bune ore">
        {sum.bestHours.length === 0 ? (
          <p className="muted">Pornește tura și adaugă cursele una câte una ca să văd ce ore îți aduc cei mai mulți bani.</p>
        ) : (
          <div className="list">
            {sum.bestHours.map((h) => (
              <div key={`${h.weekday}-${h.hour}`} className="list-row">
                <span>{WEEKDAY_NAMES[h.weekday]} {String(h.hour).padStart(2, '0')}:00–{String((h.hour + 1) % 24).padStart(2, '0')}:00</span>
                <b>{num(h.perHour, 0)} lei/h</b>
              </div>
            ))}
          </div>
        )}
        {byWeekday.length > 1 && (
          <p className="muted small">Pe zile: {byWeekday.map((w) => `${WEEKDAY_SHORT[w.weekday]} ${num(w.gross / w.hours, 0)}`).join(' · ')} lei/h</p>
        )}
      </Card>

      <Card title="Ce am învățat din datele tale">
        {d.model.learnedHours < 1 ? (
          <p className="muted">Încă folosesc estimările din Setări. După câteva ture înregistrate, calculele se adaptează automat la tine.</p>
        ) : (
          <>
            <div className="kv"><span>Ore înregistrate</span><b>{num(d.model.learnedHours, 1)} h</b></div>
            <div className="kv"><span>Câștig mediu (normalizat)</span><b>{num(d.model.baseGrossPerHour, 0)} lei/h</b></div>
            <div className="kv"><span>Valoare medie cursă</span><b>{num(d.model.avgFare, 1)} lei</b></div>
            <div className="kv"><span>Combustibil pe oră</span><b>{d.model.fuelPerHour > 0 ? `${num(d.model.fuelPerHour, 1)} lei` : 'completează prețul GPL'}</b></div>
            <p className="muted small">Încredere: {Math.round(Math.min(1, d.model.learnedHours / settings.learning.fullTrustHours) * 100)}% (deplină după {settings.learning.fullTrustHours} h).</p>
          </>
        )}
      </Card>
    </div>
  );
}
