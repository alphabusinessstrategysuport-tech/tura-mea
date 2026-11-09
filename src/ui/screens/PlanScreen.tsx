// Weekly plan: week strip (L–D) with mini progress, swipeable day detail, week overview, bonuses.
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, ChevronLeft, ChevronRight, Gift, Pencil, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { buildIcs } from '../../domain/ics';
import { lei, num } from '../../domain/money';
import type { RebalancedDay } from '../../domain/rebalance';
import { addDays, weekIdOf } from '../../domain/time';
import type { DayPlan, WeekPlan } from '../../domain/types';
import { shortDate, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { planWeek, useDerived, useSource } from '../../store/derived';
import { Card, download } from '../components';
import { haptic } from '../haptics';
import { runsLabel, Timeline } from '../Timeline';
import { DayEditor } from './DayEditor';
import { BonusEvalRow, PlanSummary, weekLabel } from './PlanningWizard';

export function DayList({ plan, rb, today, onEdit }: { plan: WeekPlan; rb?: RebalancedDay[]; today?: string; onEdit?: (d: DayPlan) => void }) {
  const bonuses = useApp((x) => x.bonuses);
  return (
    <div className="list" style={{ gap: 10 }}>
      {plan.days.map((d) => {
        const r = rb?.find((x) => x.day === d.day);
        const status = r?.status;
        const target = r ? r.targetGross : d.targetGross + d.bonusGross;
        const windows = bonuses
          .filter((b) => b.weekId === plan.id && b.days.includes(d.weekday))
          .map((b) => ({ start: b.start, end: b.end }));
        const content = (
          <>
            <div className="day-top">
              <span className="day-name">{WEEKDAY_NAMES[d.weekday]} <span className="muted small">{shortDate(d.day)}</span></span>
              {status === 'past' ? (
                <span className={r && r.actualGross >= r.plannedGross ? 'good-text' : 'warn-text'} style={{ fontWeight: 700 }}>
                  {lei(r!.actualGross)} {r && r.actualGross >= r.plannedGross ? '✓' : `/ ${lei(r!.plannedGross)}`}
                </span>
              ) : (
                <b>{d.workHours > 0 ? lei(target) : 'Liber'}</b>
              )}
            </div>
            {d.items.length > 0 && <Timeline items={d.items} bonusWindows={windows} compact />}
            {d.workHours > 0 && (
              <div className="day-meta">
                <span><b>{num(d.workHours, 1)} h</b> condus</span>
                {r && status !== 'past' && r.suggestedHours > d.workHours + 0.25 && (
                  <span className="warn-text">recomandat {num(r.suggestedHours, 1)} h</span>
                )}
                <span>~<b>{Math.round(d.rides * Math.max(1, r && status !== 'past' && d.gross > 0 ? r.targetGross / (d.gross + d.bonusGross) : 1))}</b> curse</span>
                <span>net ~<b>{lei(d.net)}</b></span>
                {d.bonusGross > 0 && <span className="row" style={{ gap: 4 }}><Gift size={14} className="accent-text" /><b>{lei(d.bonusGross)}</b></span>}
                {r?.capped && <span className="warn-text">la maxim</span>}
              </div>
            )}
            {d.runs.length > 0 && <span className="muted small">{runsLabel(d.runs)}</span>}
          </>
        );
        const cls = `day-row ${d.day === today ? 'today' : ''} ${status === 'past' ? 'past' : ''}`;
        return onEdit && status !== 'past' ? (
          <button key={d.day} className={cls} onClick={() => onEdit(d)}>{content}</button>
        ) : (
          <div key={d.day} className={cls}>{content}</div>
        );
      })}
    </div>
  );
}

function DayDetail({ plan, day, r, isToday, onEdit, nowMin }: { plan: WeekPlan; day: DayPlan; r?: RebalancedDay; isToday: boolean; onEdit?: () => void; nowMin?: number }) {
  const bonuses = useApp((x) => x.bonuses);
  const windows = bonuses.filter((b) => b.weekId === plan.id && b.days.includes(day.weekday)).map((b) => ({ start: b.start, end: b.end }));
  const evals = plan.bonusEvals.filter((e) => e.day === day.day);
  const past = r?.status === 'past';
  const target = r ? r.targetGross : day.targetGross + day.bonusGross;
  return (
    <Card className={isToday ? 'highlight' : ''} title={<>{WEEKDAY_NAMES[day.weekday]} <span className="muted small">{shortDate(day.day)}</span></>}
      right={onEdit && !past && <button className="btn small ghost" onClick={onEdit}><Pencil size={16} /> Editează</button>}>
      {day.workHours === 0 && !past ? (
        <p className="muted">Zi liberă în plan. Odihnește-te!</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="label">{past ? 'Încasat' : 'Țintă brut'}</div><div className="value accent">{lei(past ? r!.actualGross : target)}</div></div>
            <div className="stat"><div className="label">Ore condus</div><div className="value">{num(past ? r!.suggestedHours : day.workHours, 1)} h</div></div>
            <div className="stat"><div className="label">Curse estimate</div><div className="value">~{Math.round(day.rides)}</div></div>
            <div className="stat"><div className="label">Net estimat</div><div className="value">{lei(day.net)}</div></div>
          </div>
          {day.items.length > 0 && <Timeline items={day.items} bonusWindows={windows} nowMin={isToday ? nowMin : undefined} />}
          {day.runs.length > 0 && <span className="muted small">{runsLabel(day.runs)}</span>}
        </>
      )}
      {evals.map((ev) => <BonusEvalRow key={ev.key} ev={ev} bonus={bonuses.find((b) => b.id === ev.bonusId)} />)}
    </Card>
  );
}

export function PlanScreen() {
  const d = useDerived();
  const src = useSource();
  const plans = useApp((x) => x.plans);
  const bonuses = useApp((x) => x.bonuses);
  const savePlan = useApp((x) => x.savePlan);
  const openWizard = useApp((x) => x.openWizard);
  const showToast = useApp((x) => x.showToast);
  const settings = useApp((x) => x.settings);
  const [weekStart, setWeekStart] = useState(d.weekStart);
  const [sel, setSel] = useState(() => Math.max(0, Math.min(6, Math.round((Date.parse(d.today) - Date.parse(d.weekStart)) / 86_400_000))));
  const [dir, setDir] = useState(0);
  const [editing, setEditing] = useState<DayPlan | null>(null);

  const plan = plans[weekIdOf(weekStart)];
  const isCurrent = weekStart === d.weekStart;
  const rb = isCurrent ? d.rb : null;

  const changeWeek = (delta: number) => {
    haptic('tap');
    setWeekStart(addDays(weekStart, delta * 7));
    setSel(delta > 0 ? 0 : 6);
  };
  const pick = (i: number) => {
    if (i < 0) return changeWeek(-1);
    if (i > 6) return changeWeek(1);
    haptic('tap');
    setDir(i > sel ? 1 : -1);
    setSel(i);
  };

  const replanRest = async () => {
    if (!plan) return;
    await savePlan(planWeek(src, weekStart, Date.now(), { netTarget: plan.netTarget }));
    haptic('success');
    showToast('✓ Am refăcut programul pentru zilele rămase');
  };

  const exportIcs = () => {
    if (!plan) return;
    download(`tura-mea-${plan.id}.ics`, buildIcs({ plan, leadMin: settings.notifyLeadMin, includeBreaks: true, planningReminderFrom: addDays(weekStart, 6), now: Date.now() }), 'text/calendar');
  };

  const day = plan?.days[sel];
  const weekBonusEvals = plan?.bonusEvals.filter((e) => !e.day) ?? [];

  return (
    <div className="screen">
      <div className="spread">
        <button className="icon-btn" aria-label="Săptămâna anterioară" onClick={() => changeWeek(-1)}><ChevronLeft size={22} /></button>
        <div className="center">
          <h2>{isCurrent ? 'Săptămâna asta' : weekStart > d.weekStart ? 'Săptămâna viitoare' : 'Săptămână trecută'}</h2>
          <span className="muted small">{weekLabel(weekStart)}</span>
        </div>
        <button className="icon-btn" aria-label="Săptămâna următoare" onClick={() => changeWeek(1)}><ChevronRight size={22} /></button>
      </div>

      {!plan ? (
        <Card className="alert">
          <p className="motivation">Încă nu există un plan pentru această săptămână.</p>
          <button className="btn primary huge" onClick={() => openWizard(weekStart)}><CalendarPlus size={24} /> Planifică săptămâna</button>
        </Card>
      ) : (
        <>
          <div className="week-strip">
            {plan.days.map((p, i) => {
              const r = rb?.days.find((x) => x.day === p.day);
              const pct = r?.status === 'past' || r?.status === 'today'
                ? (r.plannedGross > 0 ? r.actualGross / r.plannedGross : 0)
                : 0;
              const hasBonus = plan.bonusEvals.some((e) => e.day === p.day && (e.status === 'sigur' || e.status === 'strans'));
              return (
                <button key={p.day} className={`${i === sel ? 'on' : ''} ${p.day === d.today ? 'today' : ''}`} onClick={() => pick(i)} aria-label={`${WEEKDAY_NAMES[i]} ${shortDate(p.day)}`}>
                  <span>{WEEKDAY_SHORT[i]}</span>
                  <span className="d">{Number(p.day.slice(8))}{hasBonus ? ' ·' : ''}</span>
                  <span className="mini-bar"><span style={{ width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? 'var(--gold)' : undefined }} /></span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait" initial={false} custom={dir}>
            {day && (
              <motion.div key={`${plan.id}-${sel}`} custom={dir}
                initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }} transition={{ duration: 0.18 }}
                drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25}
                onDragEnd={(_, info) => { if (info.offset.x < -70) pick(sel + 1); else if (info.offset.x > 70) pick(sel - 1); }}>
                <DayDetail plan={plan} day={day} r={rb?.days.find((x) => x.day === day.day)} isToday={day.day === d.today} nowMin={d.nowMin} onEdit={() => setEditing(day)} />
              </motion.div>
            )}
          </AnimatePresence>
          <p className="muted small center" style={{ marginTop: -6 }}>Glisează stânga/dreapta ca să schimbi ziua</p>

          {rb && rb.days.some((x) => x.status === 'past') && (
            <Card className={rb.deltaVsPlan >= 0 ? 'highlight' : 'alert'}>
              <div className="row motivation">
                {rb.deltaVsPlan >= 0 ? <TrendingUp className="good-text" /> : <TrendingDown className="warn-text" />}
                <span>{rb.deltaVsPlan >= 0
                  ? `Ești cu ${lei(rb.deltaVsPlan)} peste plan. Zilele rămase devin mai ușoare.`
                  : `Ești cu ${lei(-rb.deltaVsPlan)} sub plan. Am împărțit diferența pe zilele rămase.`}</span>
              </div>
              {rb.shortfallGross > 1 && <p className="warn-text small">Nici la orele maxime nu încap ~{lei(rb.shortfallGross)} brut. Poți refăce zilele rămase sau accepta o țintă mai mică.</p>}
              <button className="btn ghost" onClick={replanRest}><RefreshCw size={18} /> Refă programul zilelor rămase</button>
            </Card>
          )}

          <PlanSummary plan={plan} />

          {weekBonusEvals.length > 0 && (
            <Card title="Bonusuri săptămânale">
              {weekBonusEvals.map((ev) => <BonusEvalRow key={ev.key} ev={ev} bonus={bonuses.find((b) => b.id === ev.bonusId)} />)}
            </Card>
          )}

          <div className="eyebrow" style={{ margin: '4px 4px -4px' }}>Săptămâna pe scurt</div>
          <DayList plan={plan} rb={rb?.days} today={isCurrent ? d.today : undefined} onEdit={setEditing} />

          <div className="btn-row">
            <button className="btn ghost" onClick={() => openWizard(weekStart)}><Pencil size={18} /> Planifică din nou</button>
            <button className="btn ghost" onClick={exportIcs}><CalendarPlus size={18} /> Calendar</button>
          </div>
          <div className="legend"><span><i style={{ background: 'var(--teal)' }} />lucru</span><span><i style={{ background: 'var(--accent)' }} />masă</span><span><i style={{ background: 'var(--rest)' }} />pauză</span><span><i style={{ border: '2px dashed var(--gold)' }} />fereastră bonus</span></div>
        </>
      )}
      {editing && plan && <DayEditor plan={plan} day={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
