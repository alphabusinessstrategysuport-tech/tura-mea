import { useState } from 'react';
import { buildIcs } from '../../domain/ics';
import { lei, num } from '../../domain/money';
import type { RebalancedDay } from '../../domain/rebalance';
import { addDays, weekIdOf } from '../../domain/time';
import type { DayPlan, WeekPlan } from '../../domain/types';
import { shortDate, WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { planWeek, useDerived, useSource } from '../../store/derived';
import { Card, download } from '../components';
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
                <span className={r && r.actualGross >= r.plannedGross ? 'good-text' : 'warn-text'}>
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
                {d.bonusGross > 0 && <span>🎁 <b>{lei(d.bonusGross)}</b></span>}
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
  const [editing, setEditing] = useState<DayPlan | null>(null);

  const plan = plans[weekIdOf(weekStart)];
  const isCurrent = weekStart === d.weekStart;
  const rb = isCurrent ? d.rb : null;

  const replanRest = async () => {
    if (!plan) return;
    const p = planWeek(src, weekStart, Date.now(), { netTarget: plan.netTarget });
    await savePlan(p);
    showToast('Am refăcut programul pentru zilele rămase ✅');
  };

  const exportIcs = () => {
    if (!plan) return;
    download(`tura-mea-${plan.id}.ics`, buildIcs({ plan, leadMin: settings.notifyLeadMin, includeBreaks: true, planningReminderFrom: addDays(weekStart, 6), now: Date.now() }), 'text/calendar');
  };

  return (
    <div className="screen">
      <div className="card-head">
        <button className="icon-btn" aria-label="Săptămâna anterioară" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
        <div className="center">
          <h2>{isCurrent ? 'Săptămâna asta' : weekStart > d.weekStart ? 'Săptămâna viitoare' : 'Săptămână trecută'}</h2>
          <span className="muted small">{weekLabel(weekStart)}</span>
        </div>
        <button className="icon-btn" aria-label="Săptămâna următoare" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
      </div>

      {!plan ? (
        <Card className="alert">
          <p className="motivation">Încă nu există un plan pentru această săptămână.</p>
          <button className="btn primary huge" onClick={() => openWizard(weekStart)}>Planifică săptămâna</button>
        </Card>
      ) : (
        <>
          <PlanSummary plan={plan} />
          {rb && rb.days.some((x) => x.status === 'past') && (
            <Card className={rb.deltaVsPlan >= 0 ? 'highlight' : 'alert'}>
              <p className="motivation">
                {rb.deltaVsPlan >= 0
                  ? `Ești cu ${lei(rb.deltaVsPlan)} peste plan 💪 Zilele rămase devin mai ușoare.`
                  : `Ești cu ${lei(-rb.deltaVsPlan)} sub plan. Am împărțit diferența pe zilele rămase.`}
              </p>
              {rb.shortfallGross > 1 && <p className="warn-text">Nici la orele maxime nu încap ~{lei(rb.shortfallGross)} brut. Poți refăce zilele rămase sau accepta o țintă mai mică.</p>}
              <button className="btn ghost" onClick={replanRest}>🔄 Refă programul zilelor rămase</button>
            </Card>
          )}
          <DayList plan={plan} rb={rb?.days} today={isCurrent ? d.today : undefined} onEdit={setEditing} />
          {plan.bonusEvals.length > 0 && (
            <Card title="Bonusuri">
              {plan.bonusEvals.map((ev) => <BonusEvalRow key={ev.key} ev={ev} bonus={bonuses.find((b) => b.id === ev.bonusId)} />)}
            </Card>
          )}
          <div className="btn-row">
            <button className="btn ghost" onClick={() => openWizard(weekStart)}>✏️ Planifică din nou</button>
            <button className="btn ghost" onClick={exportIcs}>📅 Calendar</button>
          </div>
          <div className="legend"><span><i style={{ background: 'var(--good)' }} />lucru</span><span><i style={{ background: 'var(--warn)' }} />masă</span><span><i style={{ background: 'var(--rest)' }} />pauză</span><span><i style={{ border: '2px dashed var(--gold)' }} />fereastră bonus</span></div>
        </>
      )}
      {editing && plan && <DayEditor plan={plan} day={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
