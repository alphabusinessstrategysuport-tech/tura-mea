import { defaultTemplate } from '../../domain/defaults';
import { num } from '../../domain/money';
import type { DayTemplate, TimeWindow } from '../../domain/types';
import { WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { Card, Stepper, TimeField, Toggle } from '../components';

export function TemplateEditor({ onBack }: { onBack: () => void }) {
  const template = useApp((x) => x.template);
  const setTemplate = useApp((x) => x.setTemplate);
  const homeBy = useApp((x) => x.settings.homeBy);

  const setDay = (i: number, patch: Partial<DayTemplate>) => setTemplate(template.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const setWin = (i: number, wi: number, patch: Partial<TimeWindow>) => {
    const d = template[i];
    const windows = d.windows.map((w, k) => {
      if (k !== wi) return w;
      const n = { ...w, ...patch };
      if (n.end <= n.start) n.end += 1440; // end after midnight
      if (n.end - n.start > 1440) n.end -= 1440;
      return n;
    });
    setDay(i, { windows });
  };

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>‹ Setări</button>
      <h1>Șablonul săptămânii</h1>
      <p className="muted">Orele minime și maxime pe zi și intervalele în care accepți să lucrezi. Planificatorul alege orele cele mai bune din aceste intervale.</p>
      {template.map((d, i) => (
        <Card key={i} title={WEEKDAY_NAMES[i]} right={<input type="checkbox" className="switch" checked={d.enabled} onChange={(e) => setDay(i, { enabled: e.target.checked })} aria-label={`Lucrez ${WEEKDAY_NAMES[i]}`} />}>
          {d.enabled ? (
            <>
              <Stepper label="Minim" value={d.minHours} step={0.5} min={0} max={d.maxHours} format={(v) => `${num(v)} h`} onChange={(v) => setDay(i, { minHours: v })} />
              <Stepper label="Maxim" value={d.maxHours} step={0.5} min={d.minHours} max={16} format={(v) => `${num(v)} h`} onChange={(v) => setDay(i, { maxHours: v })} />
              {d.windows.map((w, wi) => (
                <div key={wi} className="window-row">
                  <TimeField label="De la" value={w.start} onChange={(v) => setWin(i, wi, { start: v })} />
                  <TimeField label="Până la" value={w.end} onChange={(v) => setWin(i, wi, { end: v })} />
                  {d.windows.length > 1 && (
                    <>
                      <Stepper label="min" value={w.minHours ?? 0} step={0.5} min={0} max={12} format={(v) => `${num(v)}h`} onChange={(v) => setWin(i, wi, { minHours: v || undefined })} />
                      <button className="icon-btn danger" aria-label="Șterge intervalul" onClick={() => setDay(i, { windows: d.windows.filter((_, k) => k !== wi) })}>🗑</button>
                    </>
                  )}
                </div>
              ))}
              <button className="btn ghost small" onClick={() => setDay(i, { windows: [...d.windows, { start: 21 * 60, end: 24 * 60 }] })}>+ Interval</button>
              <Toggle label="Acasă până la ora stabilită" hint="Bonusurile care merită pot prelungi ziua." checked={d.respectHomeBy}
                onChange={(v) => setDay(i, { respectHomeBy: v, windows: v ? d.windows.map((w) => ({ ...w, end: Math.min(w.end, homeBy) })) : d.windows })} />
            </>
          ) : (
            <p className="muted">Zi liberă 😌</p>
          )}
        </Card>
      ))}
      <button className="btn ghost" onClick={() => confirm('Revii la programul implicit?') && setTemplate(defaultTemplate())}>Resetează la implicit</button>
    </div>
  );
}
