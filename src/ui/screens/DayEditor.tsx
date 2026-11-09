import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { lei, num } from '../../domain/money';
import { recomputeDay, retotal } from '../../domain/scheduler';
import type { DayPlan, Run, WeekPlan } from '../../domain/types';
import { WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Sheet, TimeField } from '../components';
import { Timeline } from '../Timeline';

export function DayEditor({ plan, day, onClose }: { plan: WeekPlan; day: DayPlan; onClose: () => void }) {
  const settings = useApp((x) => x.settings);
  const heatmap = useApp((x) => x.heatmap);
  const savePlan = useApp((x) => x.savePlan);
  const { model } = useDerived();
  const [runs, setRuns] = useState<Run[]>(day.runs.map((r) => ({ ...r })));

  const preview = useMemo(() => recomputeDay(day, runs, settings, heatmap, model), [day, runs, settings, heatmap, model]);

  const setRun = (i: number, patch: Partial<Run>) =>
    setRuns(runs.map((r, j) => {
      if (j !== i) return r;
      const n = { ...r, ...patch };
      if (n.end <= n.start) n.end += 1440;
      if (n.end - n.start > 1440) n.end -= 1440;
      return n;
    }));

  const addRun = () => {
    const last = runs[runs.length - 1];
    const start = last ? last.end + 60 : 17 * 60;
    setRuns([...runs, { start, end: start + 120 }]);
  };

  const save = async () => {
    const days = plan.days.map((d) => (d.day === day.day ? preview : d));
    await savePlan(retotal({ ...plan, days }, settings, model));
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={`Editează ${WEEKDAY_NAMES[day.weekday]}`}>
      <Timeline items={preview.items} />
      <div className="legend"><span><i style={{ background: 'var(--teal)' }} />lucru</span><span><i style={{ background: 'var(--accent)' }} />masă</span><span><i style={{ background: 'var(--rest)' }} />pauză</span></div>
      {runs.map((r, i) => (
        <div key={i} className="window-row">
          <TimeField label="Start" value={r.start} onChange={(v) => setRun(i, { start: v })} />
          <TimeField label="Stop" value={r.end % 1440} onChange={(v) => setRun(i, { end: v })} />
          <button className="icon-btn danger" aria-label="Șterge blocul" onClick={() => setRuns(runs.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
        </div>
      ))}
      <button className="btn ghost" onClick={addRun}>+ Adaugă un bloc</button>
      <p className="muted">
        {num(preview.workHours, 1)} h de condus · ~{lei(preview.gross)} brut · ~{Math.round(preview.rides)} curse. Pauzele se pun automat.
      </p>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>Renunță</button>
        <button className="btn primary" onClick={save}>Salvează ziua</button>
      </div>
    </Sheet>
  );
}
