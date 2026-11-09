// Weekly / monthly summary: net profit vs target, breakdown, animated day chart,
// your personal hour heatmap, insights and what the app has learned.
import { motion } from 'framer-motion';
import { Brain, ChevronLeft, ChevronRight, Lightbulb, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { monthlyFixedCosts, monthlyNetTarget, weeklyFixedCosts, weeklyNetTarget } from '../../domain/finance';
import { cellStats } from '../../domain/learning';
import { message } from '../../domain/messages';
import { lei, num } from '../../domain/money';
import { insights, summarize } from '../../domain/stats';
import { addDays, daysInMonth, monthKeyOf, weekDays, weekIdOf, weekdayOf } from '../../domain/time';
import { MONTHS, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { AnimatedNumber, Card, Ring, Segmented } from '../components';
import { weekLabel } from './PlanningWizard';

const L = (v: number) => lei(v);

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
  const finished = elapsed === days.length;

  const key = days.join();
  const sum = useMemo(
    () => summarize({ days, data, settings, model: d.model, fixedCosts: fixed, netTarget, now: d.now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, data, settings, d.model, fixed, netTarget, d.now],
  );
  // Personal heatmap + insights use the last 8 weeks for enough data.
  const recentDays = useMemo(() => Array.from({ length: 56 }, (_, i) => addDays(d.today, -i)), [d.today]);
  const recentCells = useMemo(() => cellStats(data, d.now, new Set(recentDays)), [data, d.now, recentDays]);
  const tips = useMemo(
    () => insights(recentDays.map((x) => summarize({ days: [x], data, settings, model: d.model, fixedCosts: 0, netTarget: 0, now: d.now }).days[0]), recentCells),
    [recentDays, data, settings, d.model, d.now, recentCells],
  );

  const maxGross = Math.max(1, ...sum.days.map((x) => x.gross), ...(plan?.days.map((p) => p.targetGross + p.bonusGross) ?? []));
  const pct = netTarget > 0 ? (sum.money.net / netTarget) * 100 : 0;
  const [, mm] = month.split('-').map(Number);
  const closing = finished && sum.hours > 0 ? message(sum.money.net >= netTarget ? 'goodWeek' : 'toughWeek', key, { net: sum.money.net, pct }) : null;

  let maxRate = 0;
  for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) if (recentCells.hours[wd][h] >= 0.5) maxRate = Math.max(maxRate, recentCells.gross[wd][h] / recentCells.hours[wd][h]);

  return (
    <div className="screen">
      <h1>Statistici</h1>
      <Segmented options={[{ value: 'week', label: 'Săptămâna' }, { value: 'month', label: 'Luna' }]} value={period} onChange={setPeriod} />
      <div className="spread">
        <button className="icon-btn" aria-label="Perioada anterioară" onClick={() => (period === 'week' ? setWeekStart(addDays(weekStart, -7)) : setMonth(shiftMonth(month, -1)))}><ChevronLeft size={22} /></button>
        <b className="center">{period === 'week' ? weekLabel(weekStart) : `${MONTHS[mm - 1]} ${month.slice(0, 4)}`}</b>
        <button className="icon-btn" aria-label="Perioada următoare" onClick={() => (period === 'week' ? setWeekStart(addDays(weekStart, 7)) : setMonth(shiftMonth(month, 1)))}><ChevronRight size={22} /></button>
      </div>

      <Card className={`hero ${sum.money.net >= netTarget ? 'highlight' : ''}`}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div>
            <div className="eyebrow">Profit NET</div>
            <div className={`big-num ${sum.money.net < 0 ? 'bad-text' : ''}`}><AnimatedNumber value={sum.money.net} format={L} /></div>
            <div className="muted small">din ținta de {L(netTarget)}</div>
          </div>
          <Ring value={Math.max(0, sum.money.net)} max={netTarget} size={96} label="" color="var(--accent)" />
        </div>
        {partial && <span className="muted small">Perioadă în curs: costurile fixe sunt socotite pentru {elapsed} din {days.length} zile.</span>}
        {closing && <div className="row motivation"><Trophy size={20} className="accent-text" />{closing}</div>}
      </Card>

      <div className="stat-grid">
        <div className="stat"><div className="label">Ore lucrate</div><div className="value">{num(sum.hours, 1)} h</div></div>
        <div className="stat"><div className="label">Curse</div><div className="value">{sum.rides}</div></div>
        <div className="stat"><div className="label">Brut / oră</div><div className="value accent">{num(sum.grossPerHour, 0)} lei</div></div>
        <div className="stat"><div className="label">Net / oră</div><div className="value">{num(sum.netPerHour, 0)} lei</div></div>
      </div>

      <Card title="Pe zile">
        <div className="bars">
          {sum.days.map((x, i) => {
            const t = plan?.days.find((p) => p.day === x.day);
            const target = t ? t.targetGross + t.bonusGross : 0;
            const hit = target > 0 && x.gross >= target;
            return (
              <div key={x.day} className="col" title={`${x.day}: ${lei(x.gross)}`}>
                {target > 0 && <div className="target" style={{ bottom: `calc(${(target / maxGross) * 100}% * 0.85 + 18px)` }} />}
                <motion.div className={`fill ${hit ? 'hit' : ''}`} style={{ height: `${(x.gross / maxGross) * 85}%` }}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: Math.min(i, 10) * 0.03 }} />
                <span className="lbl">{period === 'week' ? WEEKDAY_SHORT[weekdayOf(x.day)] : Number(x.day.slice(8)) % 5 === 1 ? Number(x.day.slice(8)) : ''}</span>
              </div>
            );
          })}
        </div>
        {plan && <p className="muted small">Linia punctată = ținta zilei. Auriu = țintă atinsă.</p>}
        {sum.bestDay && <p className="row"><Trophy size={18} className="accent-text" /> Cea mai bună zi: <b>{WEEKDAY_NAMES[weekdayOf(sum.bestDay.day)]} {Number(sum.bestDay.day.slice(8))}</b> · {L(sum.bestDay.gross)}</p>}
      </Card>

      <Card title="Bani">
        <div className="kv"><span>Curse ({sum.rides})</span><b>{L(sum.rideGross)}</b></div>
        <div className="kv"><span>Bonusuri</span><b>{L(sum.bonusGross)}</b></div>
        <div className="kv"><span>Comision {settings.commissionPct}%</span><b className="bad-text">−{L(sum.money.commission)}</b></div>
        {sum.money.tax > 0 && <div className="kv"><span>Taxe {settings.taxPct}%</span><b className="bad-text">−{L(sum.money.tax)}</b></div>}
        <div className="kv"><span>Combustibil {sum.fuelIsEstimate ? '(estimat)' : '(alimentări)'}</span><b className="bad-text">−{L(sum.fuelUsed)}</b></div>
        <div className="kv"><span>Costuri fixe</span><b className="bad-text">−{L(sum.money.fixed)}</b></div>
        <div className="kv total"><span>Profit NET</span><span className={sum.money.net >= 0 ? 'good-text' : 'bad-text'}>{L(sum.money.net)}</span></div>
      </Card>

      <Card title="Harta orelor tale" right={<span className="muted small">ultimele 8 săpt.</span>}>
        {maxRate === 0 ? (
          <p className="muted">Pornește tura și adaugă cursele una câte una ca să văd ce ore îți aduc cei mai mulți bani.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '22px repeat(24, 1fr)', gap: 2 }}>
              {WEEKDAY_SHORT.map((wdName, wd) => (
                <div key={wd} style={{ display: 'contents' }}>
                  <span className="muted" style={{ fontSize: '.68rem' }}>{wdName}</span>
                  {Array.from({ length: 24 }, (_, h) => {
                    const hrs = recentCells.hours[wd][h];
                    const rate = hrs >= 0.5 ? recentCells.gross[wd][h] / hrs : 0;
                    return <span key={h} title={rate ? `${WEEKDAY_NAMES[wd]} ${h}:00 · ${Math.round(rate)} lei/h` : ''}
                      style={{ height: 14, borderRadius: 3, background: rate ? `color-mix(in srgb, var(--accent) ${Math.round(20 + 80 * (rate / maxRate))}%, var(--track))` : 'var(--track)' }} />;
                  })}
                </div>
              ))}
            </div>
            <div className="spread muted" style={{ fontSize: '.7rem', paddingLeft: 24 }}><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          </>
        )}
        {sum.bestHours.length > 0 && (
          <div className="list">
            {sum.bestHours.slice(0, 3).map((h) => (
              <div key={`${h.weekday}-${h.hour}`} className="list-row">
                <span>{WEEKDAY_NAMES[h.weekday]} {String(h.hour).padStart(2, '0')}:00</span>
                <b className="accent-text">{num(h.perHour, 0)} lei/h</b>
              </div>
            ))}
          </div>
        )}
      </Card>

      {tips.length > 0 && (
        <Card title={<span className="row"><Lightbulb size={18} className="accent-text" /> Observații</span>}>
          {tips.map((t) => <p key={t} style={{ margin: 0 }}>{t}</p>)}
        </Card>
      )}

      <Card title={<span className="row"><Brain size={18} className="accent-text" /> Ce am învățat din datele tale</span>}>
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
