// Shown when the app is opened with a bonus link (#/import/<code>): confirm, add, re-plan.
import { useMemo, useState } from 'react';
import { newId } from '../../data/db';
import { decodeBonuses, newOnly } from '../../domain/bonusImport';
import { lei } from '../../domain/money';
import { fmtHM, weekStartOf } from '../../domain/time';
import { WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { planWeek } from '../../store/derived';
import { Card } from '../components';
import { weekLabel } from './PlanningWizard';

export function ImportBonuses({ code, onDone }: { code: string; onDone: (route: string) => void }) {
  const bonuses = useApp((x) => x.bonuses);
  const upsertBonus = useApp((x) => x.upsertBonus);
  const savePlan = useApp((x) => x.savePlan);
  const showToast = useApp((x) => x.showToast);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, ...decodeBonuses(code) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Link invalid.' };
    }
  }, [code]);

  if (!parsed.ok) {
    return (
      <div className="overlay"><div className="screen">
        <h1>Import bonusuri</h1>
        <p className="warn-text">{parsed.error}</p>
        <button className="btn primary" onClick={() => onDone('azi')}>Înapoi</button>
      </div></div>
    );
  }

  const fresh = newOnly(parsed.bonuses, bonuses);
  const weekStart = weekStartOf(parsed.weekId);

  const add = async () => {
    setBusy(true);
    for (const b of fresh) await upsertBonus({ ...b, id: newId(), mode: 'auto' });
    const st = useApp.getState();
    const hadPlan = !!st.plans[parsed.weekId];
    await savePlan(planWeek(st, weekStart, Date.now(), { netTarget: st.plans[parsed.weekId]?.netTarget }));
    showToast(`${fresh.length} bonusuri adăugate, ${hadPlan ? 'programul a fost refăcut' : 'planul săptămânii e gata'} ✅`);
    onDone('plan');
  };

  return (
    <div className="overlay">
      <div className="screen">
        <h1>Bonusuri de adăugat 🎁</h1>
        <span className="muted">{weekLabel(weekStart)}</span>
        <Card>
          <div className="list">
            {parsed.bonuses.map((b, i) => {
              const dup = !fresh.includes(b);
              return (
                <div key={i} className="list-row" style={dup ? { opacity: 0.5 } : undefined}>
                  <span>
                    <b>{b.days.map((d) => WEEKDAY_NAMES[d]).join(', ')}</b> {fmtHM(b.start)}–{fmtHM(b.end)}
                    {b.end > 1440 && <span className="muted small"> (+1 zi)</span>}
                    <span className="hint">{b.ridesRequired} curse{b.kind === 'weekly' ? ' · săptămânal' : ''}{dup ? ' · există deja' : ''}</span>
                  </span>
                  <b>{lei(b.reward)}</b>
                </div>
              );
            })}
          </div>
        </Card>
        <p className="muted small">După adăugare refac programul săptămânii, ca să prindă bonusurile care merită.</p>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => onDone('azi')}>Renunță</button>
          <button className="btn primary" disabled={busy || fresh.length === 0} onClick={add}>
            {fresh.length === 0 ? 'Toate există deja' : `Adaugă ${fresh.length} bonusuri`}
          </button>
        </div>
      </div>
    </div>
  );
}
