// Sunday planning flow: target → bonuses → generated schedule → done (calendar + notifications).
import { AlarmClock, Bell, CalendarPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { newId } from '../../data/db';
import { fuelPerHourEstimate, weeklyFixedCosts, weeklyNetTarget } from '../../domain/finance';
import { buildIcs, googlePlanningReminderUrl } from '../../domain/ics';
import { lei, num } from '../../domain/money';
import { addDays, weekIdOf } from '../../domain/time';
import type { Bonus, BonusEval } from '../../domain/types';
import { BONUS_STATUS, shortDate } from '../../i18n/ro';
import { permission, requestPermission } from '../../notifications/runner';
import { useApp } from '../../store/app';
import { planWeek, useSource } from '../../store/derived';
import { Badge, Card, download, NumberField, Segmented, Sheet, Stepper } from '../components';
import { BonusForm, bonusSummary } from './BonusForm';
import { DayList } from './PlanScreen';

export function weekLabel(weekStart: string): string {
  return `Săptămâna ${Number(weekIdOf(weekStart).split('W')[1])} · ${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;
}

export function PlanningWizard({ weekStart }: { weekStart: string }) {
  const src = useSource();
  const { settings, bonuses: allBonuses } = src;
  const setSettings = useApp((x) => x.setSettings);
  const upsertBonus = useApp((x) => x.upsertBonus);
  const deleteBonus = useApp((x) => x.deleteBonus);
  const savePlan = useApp((x) => x.savePlan);
  const openWizard = useApp((x) => x.openWizard);
  const showToast = useApp((x) => x.showToast);
  const weekId = weekIdOf(weekStart);
  const existing = src.plans[weekId];

  const [step, setStep] = useState(0);
  const [netTarget, setNetTarget] = useState(Math.round(existing?.netTarget ?? weeklyNetTarget(settings)));
  const [editing, setEditing] = useState<Bonus | 'new' | null>(null);
  const [perm, setPerm] = useState(permission());
  const [now] = useState(() => Date.now());

  const bonuses = allBonuses.filter((b) => b.weekId === weekId);
  const prevWeekBonuses = allBonuses.filter((b) => b.weekId === weekIdOf(addDays(weekStart, -7)));
  const plan = useMemo(() => (step >= 2 ? planWeek(src, weekStart, now, { netTarget }) : null), [src, weekStart, now, netTarget, step]);
  const close = () => openWizard(null);

  const copyPrev = async () => {
    for (const b of prevWeekBonuses) await upsertBonus({ ...b, id: newId(), weekId, mode: 'auto' });
    showToast(`Am copiat ${prevWeekBonuses.length} bonusuri. Verifică dacă sunt la fel.`);
  };

  const finish = async () => {
    if (!plan) return;
    await savePlan(plan);
    setStep(3);
  };

  const exportIcs = () => {
    if (!plan) return;
    const ics = buildIcs({ plan, leadMin: settings.notifyLeadMin, includeBreaks: true, planningReminderFrom: addDays(weekStart, 6), now: Date.now() });
    download(`tura-mea-${weekId}.ics`, ics, 'text/calendar');
  };

  return (
    <div className="overlay">
      <div className="screen">
        <div className="card-head">
          <button className="back" onClick={close}>✕ Închide</button>
          <span className="muted small">{weekLabel(weekStart)}</span>
        </div>
        <div className="steps">{[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && (
          <>
            <h1>Ținta săptămânii</h1>
            <Card>
              <Stepper label="Profit NET dorit" value={netTarget} step={50} min={0} max={20000} format={(v) => lei(v)} onChange={setNetTarget} />
              <p className="muted small">Din setări: {lei(weeklyNetTarget(settings))}. Poți pune altă țintă doar pentru această săptămână.</p>
              <div className="kv"><span>Costuri fixe</span><b>{lei(weeklyFixedCosts(settings))}</b></div>
              <div className="kv"><span>Comision</span><b>{settings.commissionPct}% din curse și bonusuri</b></div>
            </Card>
            <Card title="Preț GPL azi">
              <NumberField label="lei pe litru" value={settings.fuel.pricePerL} onChange={(v) => setSettings({ ...settings, fuel: { ...settings.fuel, pricePerL: v } })} />
              <p className="muted small">
                {settings.fuel.pricePerL ? `≈ ${num(fuelPerHourEstimate(settings), 1)} lei combustibil pe oră.` : 'Completează prețul ca să includ combustibilul în calcul.'}
              </p>
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Bonusurile săptămânii</h1>
            <p className="muted">Introdu bonusurile din aplicația Bolt. Eu calculez dacă merită și unde să lucrezi ca să le iei.</p>
            {bonuses.length === 0 && <p className="muted">Niciun bonus încă.</p>}
            {bonuses.map((b) => (
              <div key={b.id} className="bonus-card">
                <div className="bonus-top">
                  <b>{bonusSummary(b)}</b>
                </div>
                <div className="btn-row">
                  <button className="btn small ghost" onClick={() => setEditing(b)}>Modifică</button>
                  <button className="btn small danger" onClick={() => deleteBonus(b.id)}>Șterge</button>
                </div>
              </div>
            ))}
            <button className="btn primary huge" onClick={() => setEditing('new')}>+ Adaugă bonus</button>
            {prevWeekBonuses.length > 0 && bonuses.length === 0 && (
              <button className="btn ghost" onClick={copyPrev}>Copiază bonusurile de săptămâna trecută ({prevWeekBonuses.length})</button>
            )}
          </>
        )}

        {step === 2 && plan && (
          <>
            <h1>Programul propus</h1>
            <PlanSummary plan={plan} />
            {plan.bonusEvals.length > 0 && (
              <Card title="Bonusuri">
                {plan.bonusEvals.map((ev) => <BonusEvalRow key={ev.key} ev={ev} bonus={bonuses.find((b) => b.id === ev.bonusId)} onMode={(mode) => {
                  const b = bonuses.find((x) => x.id === ev.bonusId);
                  if (b) upsertBonus({ ...b, mode });
                }} />)}
              </Card>
            )}
            <DayList plan={plan} />
            <p className="muted small">După ce salvezi, poți modifica orice zi din ecranul Plan.</p>
          </>
        )}

        {step === 3 && plan && (
          <>
            <h1>Gata, săptămâna e planificată</h1>
            <Card className="highlight">
              <p className="motivation">
                {plan.shortfall > 0
                  ? `Cu limitele tale ajungi la ~${lei(plan.totals.net)} net. Lipsesc ~${lei(plan.shortfall)}; dacă vrei, mărește orele maxime într-o zi.`
                  : `${num(plan.totals.workHours, 1)} ore planificate pentru ~${lei(plan.totals.net)} net. Hai să le facem!`}
              </p>
            </Card>
            <Card title="Mementouri sigure">
              <p className="muted small">Notificările aplicației merg cât timp e deschisă. Pentru alarme garantate, pune programul în calendar:</p>
              <button className="btn primary" onClick={exportIcs}><CalendarPlus size={20} /> Descarcă programul (.ics)</button>
              <p className="muted small">Pe Android: deschide fișierul cu aplicația Calendar. Dacă Google Calendar nu îl deschide, importă-l de pe laptop din calendar.google.com → Setări → Import.</p>
              <a className="btn ghost" href={googlePlanningReminderUrl(addDays(weekStart, 6))} target="_blank" rel="noreferrer"><AlarmClock size={20} /> Memento duminică 09:00 în Google Calendar</a>
            </Card>
            {perm !== 'granted' && perm !== 'unsupported' && (
              <button className="btn ghost" onClick={async () => setPerm(await requestPermission())}><Bell size={20} /> Permite notificările</button>
            )}
          </>
        )}
      </div>

      <div className="sticky-actions">
        <div className="btn-row">
          {step > 0 && step < 3 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Înapoi</button>}
          {step < 2 && <button className="btn primary" onClick={() => setStep(step + 1)}>Continuă</button>}
          {step === 2 && <button className="btn primary" onClick={finish}>Salvează planul</button>}
          {step === 3 && <button className="btn primary" onClick={close}>Închide</button>}
        </div>
      </div>

      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing === 'new' ? 'Bonus nou' : 'Modifică bonusul'}>
          <BonusForm
            weekId={weekId}
            initial={editing === 'new' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSave={async (b) => {
              await upsertBonus(b);
              setEditing(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

export function PlanSummary({ plan }: { plan: NonNullable<ReturnType<typeof planWeek>> }) {
  return (
    <Card>
      <div className="stat-grid">
        <div className="stat"><div className="label">Ținta NET</div><div className="value">{lei(plan.netTarget)}</div></div>
        <div className="stat"><div className="label">Net estimat</div><div className={`value ${plan.shortfall > 0 ? 'warn' : 'good'}`}>{lei(plan.totals.net)}</div></div>
        <div className="stat"><div className="label">Brut necesar</div><div className="value">{lei(plan.totals.grossNeeded)}</div></div>
        <div className="stat"><div className="label">Ore planificate</div><div className="value">{num(plan.totals.workHours, 1)} h</div></div>
      </div>
      <p className="muted small">
        Brut necesar = (țintă {lei(plan.netTarget)} + costuri {lei(plan.fixedCosts)} + combustibil ~{lei(plan.totals.fuel)}) ÷ ce rămâne după comision.
        {plan.totals.bonusGross > 0 && ` Include ~${lei(plan.totals.bonusGross)} din bonusuri.`}
      </p>
      {plan.shortfall > 0 && <p className="warn-text">Cu orele maxime din șablon lipsesc ~{lei(plan.shortfall)} net.</p>}
    </Card>
  );
}

export function BonusEvalRow({ ev, bonus, onMode }: { ev: BonusEval; bonus?: Bonus; onMode?: (m: Bonus['mode']) => void }) {
  const st = BONUS_STATUS[ev.status];
  return (
    <div className="bonus-card">
      <div className="bonus-top">
        <b>{bonus ? `${lei(bonus.reward)} · ${bonus.ridesRequired} curse` : 'Bonus'}{ev.day ? ` · ${shortDate(ev.day)}` : ''}</b>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <span className="muted small">{ev.reason}</span>
      {onMode && bonus && (
        <Segmented
          options={[{ value: 'auto', label: 'Decide tu' }, { value: 'on', label: 'Îl vreau' }, { value: 'off', label: 'Nu' }]}
          value={bonus.mode}
          onChange={onMode}
        />
      )}
    </div>
  );
}
