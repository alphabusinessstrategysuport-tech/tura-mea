import { useRef, useState } from 'react';
import { backupFileName, validateBackup } from '../../data/backup';
import { newId } from '../../data/db';
import { fuelPerHourEstimate, keepRate, monthlyNetTarget, weeklyFixedCosts, weeklyNetTarget } from '../../domain/finance';
import { lei, num } from '../../domain/money';
import { fmtHM } from '../../domain/time';
import type { CostItem, NotificationType, Settings } from '../../domain/types';
import { NOTIFICATION_LABELS } from '../../i18n/ro';
import { permission, requestPermission, showNotice } from '../../notifications/runner';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Card, Chips, download, NumberField, Stepper, TimeField, Toggle } from '../components';
import { HeatmapEditor } from './HeatmapEditor';
import { TemplateEditor } from './TemplateEditor';

export function SettingsScreen({ go }: { go: (route: string) => void }) {
  const [view, setView] = useState<'main' | 'template' | 'heatmap'>('main');
  const settings = useApp((x) => x.settings);
  const setSettings = useApp((x) => x.setSettings);
  const template = useApp((x) => x.template);
  const setTemplate = useApp((x) => x.setTemplate);
  const exportBackup = useApp((x) => x.exportBackup);
  const importBackup = useApp((x) => x.importBackup);
  const showToast = useApp((x) => x.showToast);
  const d = useDerived();
  const fileRef = useRef<HTMLInputElement>(null);
  const [perm, setPerm] = useState(permission());

  if (view === 'template') return <TemplateEditor onBack={() => setView('main')} />;
  if (view === 'heatmap') return <HeatmapEditor onBack={() => setView('main')} />;

  const s = settings;
  const save = (patch: Partial<Settings>) => setSettings({ ...s, ...patch });
  const setCost = (id: string, patch: Partial<CostItem>) => save({ costItems: s.costItems.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const onHomeBy = (m: number) => {
    save({ homeBy: m });
    setTemplate(template.map((t) => (t.respectHomeBy ? { ...t, windows: t.windows.map((w) => ({ ...w, end: m })) } : t)));
  };

  const onExport = async () => {
    const f = await exportBackup();
    download(backupFileName(), JSON.stringify(f, null, 1), 'application/json');
    showToast('Backup salvat în Descărcări 💾');
  };

  const onImport = async (file: File) => {
    try {
      const parsed = validateBackup(JSON.parse(await file.text()));
      const when = new Date(parsed.exportedAt).toLocaleString('ro-RO');
      if (!confirm(`Înlocuiești TOATE datele din aplicație cu backup-ul din ${when}? Datele actuale se pierd.`)) return;
      await importBackup(parsed);
      showToast('Backup restaurat ✅');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fișier invalid.');
    }
  };

  const fuelH = fuelPerHourEstimate(s);

  return (
    <div className="screen">
      <h1>Setări</h1>

      <Card title="Ținta de profit NET">
        <Chips
          options={[{ value: 'monthly', label: 'Lunar' }, { value: 'weekly', label: 'Săptămânal' }]}
          value={s.target.mode}
          onChange={(mode) => save({ target: { ...s.target, mode } })}
        />
        <NumberField label={s.target.mode === 'monthly' ? 'Țintă pe lună' : 'Țintă pe săptămână'} suffix="lei" value={s.target.amount}
          onChange={(v) => save({ target: { ...s.target, amount: v ?? 0 } })} />
        <p className="muted">
          ≈ {lei(weeklyNetTarget(s))} pe săptămână · {lei(monthlyNetTarget(s))} pe lună (o lună = {s.weeksPerMonth} săptămâni)
        </p>
      </Card>

      <Card title="Costuri fixe" right={<span className="muted">{lei(weeklyFixedCosts(s))}/săpt.</span>}>
        {s.costItems.map((c) => (
          <div key={c.id} className="cost-row">
            <input className="text-input" value={c.name} onChange={(e) => setCost(c.id, { name: e.target.value })} aria-label="Denumire cost" />
            <input className="text-input amount" type="number" inputMode="decimal" value={c.amount}
              onChange={(e) => setCost(c.id, { amount: Number(e.target.value) || 0 })} aria-label="Sumă" />
            <Chips options={[{ value: 'week', label: '/săpt' }, { value: 'month', label: '/lună' }]} value={c.period} onChange={(period) => setCost(c.id, { period })} />
            <button className="icon-btn danger" aria-label="Șterge costul" onClick={() => confirm(`Ștergi „${c.name}”?`) && save({ costItems: s.costItems.filter((x) => x.id !== c.id) })}>🗑</button>
          </div>
        ))}
        <button className="btn ghost" onClick={() => save({ costItems: [...s.costItems, { id: newId(), name: 'Cost nou', amount: 0, period: 'week' }] })}>+ Adaugă cost</button>
      </Card>

      <Card title="Comision și taxe">
        <NumberField label="Comision Bolt (din curse și bonusuri)" suffix="%" value={s.commissionPct} onChange={(v) => save({ commissionPct: v ?? 0 })} />
        <NumberField label="Taxe / alte rețineri (opțional)" suffix="%" value={s.taxPct} onChange={(v) => save({ taxPct: v ?? 0 })} />
        <p className="muted">Din fiecare 100 lei brut îți rămân {num(keepRate(s) * 100, 1)} lei.</p>
      </Card>

      <Card title="Combustibil (GPL)">
        <NumberField label="Consum" suffix="L/100 km" value={s.fuel.consumptionL100} onChange={(v) => save({ fuel: { ...s.fuel, consumptionL100: v ?? 0 } })} />
        <NumberField label="Preț GPL" suffix="lei/L" value={s.fuel.pricePerL} onChange={(v) => save({ fuel: { ...s.fuel, pricePerL: v } })} />
        {!s.fuel.pricePerL && <p className="warn-text">⚠️ Completează prețul GPL, altfel combustibilul nu intră în calcul.</p>}
        {fuelH > 0 && <p className="muted">Estimat: {num(fuelH, 1)} lei combustibil pe oră de condus.</p>}
        {d.model.fuelPerHour !== fuelH && d.model.fuelPerHour > 0 && <p className="muted">Din alimentările tale: {num(d.model.fuelPerHour, 1)} lei/oră.</p>}
      </Card>

      <Card title="Estimări de pornire">
        <NumberField label="Câștig mediu brut pe oră" suffix="lei/h" value={s.estimates.grossPerHour} onChange={(v) => save({ estimates: { ...s.estimates, grossPerHour: v ?? 0 } })} />
        <NumberField label="Valoare medie cursă" suffix="lei" value={s.estimates.avgFare} onChange={(v) => save({ estimates: { ...s.estimates, avgFare: v || 1 } })} />
        <NumberField label="Km pe oră de condus" suffix="km/h" value={s.estimates.kmPerHour} onChange={(v) => save({ estimates: { ...s.estimates, kmPerHour: v ?? 0 } })} />
        <Toggle label="Învață din datele mele" hint={`Folosește orele reale (${num(d.model.learnedHours, 0)} h până acum). Încredere deplină după ${s.learning.fullTrustHours} h.`}
          checked={s.learning.enabled} onChange={(enabled) => save({ learning: { ...s.learning, enabled } })} />
        {d.model.learnedHours > 0 && (
          <p className="muted">Acum: ~{num(d.model.baseGrossPerHour, 0)} lei/h în medie, ~{num(d.model.avgFare, 1)} lei/cursă.</p>
        )}
      </Card>

      <Card title="Programul meu">
        <button className="btn ghost row-btn" onClick={() => setView('template')}>🗓️ Șablonul săptămânii (ore și intervale) ›</button>
        <button className="btn ghost row-btn" onClick={() => setView('heatmap')}>🔥 Cererea în București pe ore ›</button>
        <TimeField label="Acasă până la (zile fără bonus)" value={s.homeBy} onChange={onHomeBy} />
        <p className="muted">Zilele marcate „acasă până la {fmtHM(s.homeBy)}” se termină la această oră, în afară de bonusurile care merită.</p>
      </Card>

      <Card title="Pauze">
        <Stepper label="Masă după" value={s.breaks.mealAfterMin / 60} step={0.5} min={2} max={8} format={(v) => `${num(v)} h`} onChange={(v) => save({ breaks: { ...s.breaks, mealAfterMin: v * 60 } })} />
        <Stepper label="Durata mesei" value={s.breaks.mealMin} step={5} min={15} max={90} format={(v) => `${v} min`} onChange={(v) => save({ breaks: { ...s.breaks, mealMin: v } })} />
        <Stepper label="Pauză scurtă la" value={s.breaks.restEveryMin / 60} step={0.5} min={1} max={4} format={(v) => `${num(v)} h`} onChange={(v) => save({ breaks: { ...s.breaks, restEveryMin: v * 60 } })} />
        <Stepper label="Durata pauzei" value={s.breaks.restMin} step={5} min={5} max={30} format={(v) => `${v} min`} onChange={(v) => save({ breaks: { ...s.breaks, restMin: v } })} />
      </Card>

      <Card title="Notificări">
        {perm !== 'granted' ? (
          <button className="btn primary" onClick={async () => setPerm(await requestPermission())}>
            🔔 Permite notificările
          </button>
        ) : (
          <button className="btn ghost" onClick={() => showNotice({ key: `test-${Date.now()}`, title: 'Totul e pregătit 👍', body: 'Așa vor arăta notificările Tura Mea.' })}>
            Trimite o notificare de test
          </button>
        )}
        {perm === 'denied' && <p className="warn-text">Notificările sunt blocate. Activează-le din setările Chrome pentru acest site.</p>}
        {perm === 'unsupported' && <p className="warn-text">Browserul nu suportă notificări. Instalează aplicația pe ecranul principal din Chrome.</p>}
        {(Object.keys(NOTIFICATION_LABELS) as NotificationType[]).map((k) => (
          <Toggle key={k} label={NOTIFICATION_LABELS[k].label} hint={NOTIFICATION_LABELS[k].example} checked={s.notifications[k]}
            onChange={(v) => save({ notifications: { ...s.notifications, [k]: v } })} />
        ))}
        <Stepper label="Anunță plecarea cu" value={s.notifyLeadMin} step={5} min={0} max={60} format={(v) => `${v} min`} onChange={(v) => save({ notifyLeadMin: v })} />
        <Toggle label="Ține ecranul aprins în tură" hint="Ajută aplicația să rămână activă pentru notificări." checked={s.keepScreenOn} onChange={(keepScreenOn) => save({ keepScreenOn })} />
        <p className="muted small">
          Important: o aplicație web nu poate trimite notificări sigure când e complet închisă. Pentru mementouri garantate, exportă planul în calendar (ecranul Plan).
        </p>
      </Card>

      <Card title="Date și backup">
        <button className="btn ghost row-btn" onClick={() => go('istoric')}>📜 Istoric înregistrări ›</button>
        <button className="btn ghost row-btn" onClick={onExport}>💾 Exportă toate datele (JSON)</button>
        <button className="btn ghost row-btn" onClick={() => fileRef.current?.click()}>📂 Importă din backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        <p className="muted small">Datele stau doar pe telefonul tău. Fă un backup săptămânal (de exemplu duminica, după planificare).</p>
      </Card>

      <p className="muted small center">Tura Mea · v{import.meta.env.VITE_APP_VERSION ?? '0.1'}</p>
    </div>
  );
}
