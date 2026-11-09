// Settings as a grouped list: tap a row to open its section.
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, Calculator, CalendarRange, ChevronDown, ChevronRight, Coffee, Database, Download, Flame, Fuel, Gauge, History, Palette, Percent, Plus, RotateCcw, Target, Trash2, Upload, Wallet,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
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
import { Card, Chips, download, NumberField, Segmented, Stepper, TimeField, Toggle } from '../components';
import { HeatmapEditor } from './HeatmapEditor';
import { TemplateEditor } from './TemplateEditor';

function Section({ icon, title, value, children, defaultOpen = false }: { icon: ReactNode; title: string; value?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button className="group-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ico">{icon}</span>
        <span className="txt"><b>{title}</b></span>
        {value && <span className="val">{value}</span>}
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="muted"><ChevronDown size={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', borderBottom: '1px solid var(--line)' }}>
            <div className="group-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LinkRow({ icon, title, value, onClick }: { icon: ReactNode; title: string; value?: ReactNode; onClick: () => void }) {
  return (
    <button className="group-row" onClick={onClick}>
      <span className="ico">{icon}</span>
      <span className="txt"><b>{title}</b></span>
      {value && <span className="val">{value}</span>}
      <ChevronRight size={18} className="muted" />
    </button>
  );
}

export function SettingsScreen({ go }: { go: (route: string) => void }) {
  const [view, setView] = useState<'main' | 'template' | 'heatmap'>('main');
  const settings = useApp((x) => x.settings);
  const setSettings = useApp((x) => x.setSettings);
  const template = useApp((x) => x.template);
  const setTemplate = useApp((x) => x.setTemplate);
  const exportBackup = useApp((x) => x.exportBackup);
  const importBackup = useApp((x) => x.importBackup);
  const showToast = useApp((x) => x.showToast);
  const openOnboarding = useApp((x) => x.openOnboarding);
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
    showToast('✓ Backup salvat în Descărcări');
  };

  const onImport = async (file: File) => {
    try {
      const parsed = validateBackup(JSON.parse(await file.text()));
      const when = new Date(parsed.exportedAt).toLocaleString('ro-RO');
      if (!confirm(`Înlocuiești TOATE datele din aplicație cu backup-ul din ${when}? Datele actuale se pierd.`)) return;
      await importBackup(parsed);
      showToast('✓ Backup restaurat');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fișier invalid.');
    }
  };

  const fuelH = fuelPerHourEstimate(s);
  const activeNotifs = (Object.keys(s.notifications) as NotificationType[]).filter((k) => s.notifications[k]).length;

  return (
    <div className="screen">
      <h1>Setări</h1>

      <Card className="highlight">
        <div className="row">
          <span className="ico" style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--on-accent)' }}><Target size={26} /></span>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Ținta ta NET</div>
            <b style={{ fontSize: '1.3rem' }}>{lei(s.target.amount)} / {s.target.mode === 'monthly' ? 'lună' : 'săptămână'}</b>
            <div className="muted small">≈ {lei(weeklyNetTarget(s))}/săpt · {lei(monthlyNetTarget(s))}/lună</div>
          </div>
        </div>
        <button className="btn ghost small" onClick={() => openOnboarding(true)}><RotateCcw size={16} /> Reia configurarea</button>
      </Card>

      <div className="group-title">Aspect</div>
      <div className="group">
        <div className="group-body" style={{ paddingTop: 14 }}>
          <div className="row"><Palette size={18} className="accent-text" /><b style={{ flex: 1 }}>Temă</b></div>
          <Segmented options={[{ value: 'dark', label: 'Întunecat' }, { value: 'light', label: 'Luminos' }]} value={s.theme} onChange={(theme) => save({ theme })} />
          <Toggle label="Text mare" hint="Cifre și texte mai mari, pentru suportul de telefon." checked={s.largeText} onChange={(largeText) => save({ largeText })} />
          <Toggle label="Vibrații" hint="Scurt la cursă, dublu la bonus, lung la ținta zilei." checked={s.haptics} onChange={(haptics) => save({ haptics })} />
        </div>
      </div>

      <div className="group-title">Bani</div>
      <div className="group">
        <Section icon={<Target size={20} />} title="Ținta de profit" value={`${lei(s.target.amount)}/${s.target.mode === 'monthly' ? 'lună' : 'săpt'}`}>
          <Segmented options={[{ value: 'monthly', label: 'Lunar' }, { value: 'weekly', label: 'Săptămânal' }]} value={s.target.mode} onChange={(mode) => save({ target: { ...s.target, mode } })} />
          <Stepper label={s.target.mode === 'monthly' ? 'NET pe lună' : 'NET pe săptămână'} value={s.target.amount} step={100} min={0} max={50000} format={(v) => lei(v)} onChange={(amount) => save({ target: { ...s.target, amount } })} />
          <p className="muted small">O lună = {s.weeksPerMonth} săptămâni.</p>
        </Section>
        <Section icon={<Wallet size={20} />} title="Costuri fixe" value={`${lei(weeklyFixedCosts(s))}/săpt`}>
          {s.costItems.map((c) => (
            <div key={c.id} className="cost-row">
              <input className="text-input" value={c.name} onChange={(e) => setCost(c.id, { name: e.target.value })} aria-label="Denumire cost" />
              <input className="text-input amount" type="number" inputMode="decimal" value={c.amount} onChange={(e) => setCost(c.id, { amount: Number(e.target.value) || 0 })} aria-label="Sumă" />
              <Chips options={[{ value: 'week', label: '/săpt' }, { value: 'month', label: '/lună' }]} value={c.period} onChange={(period) => setCost(c.id, { period })} />
              <button className="icon-btn danger" aria-label="Șterge costul" onClick={() => confirm(`Ștergi „${c.name}”?`) && save({ costItems: s.costItems.filter((x) => x.id !== c.id) })}><Trash2 size={18} /></button>
            </div>
          ))}
          <button className="btn ghost small" onClick={() => save({ costItems: [...s.costItems, { id: newId(), name: 'Cost nou', amount: 0, period: 'week' }] })}><Plus size={16} /> Adaugă cost</button>
        </Section>
        <Section icon={<Percent size={20} />} title="Comision și taxe" value={`${s.commissionPct}%${s.taxPct ? ` + ${s.taxPct}%` : ''}`}>
          <Stepper label="Comision Bolt" value={s.commissionPct} step={1} min={0} max={50} format={(v) => `${num(v)}%`} onChange={(commissionPct) => save({ commissionPct })} />
          <Stepper label="Taxe (opțional)" value={s.taxPct} step={1} min={0} max={50} format={(v) => `${num(v)}%`} onChange={(taxPct) => save({ taxPct })} />
          <p className="muted small">Comisionul se scade din curse și din bonusuri. Din 100 lei brut îți rămân {num(keepRate(s) * 100, 1)} lei.</p>
        </Section>
        <Section icon={<Fuel size={20} />} title="Combustibil (GPL)" value={s.fuel.pricePerL ? `${num(s.fuel.pricePerL, 2)} lei/L` : <span className="warn-text">completează</span>}>
          <NumberField label="Preț GPL" suffix="lei/L" value={s.fuel.pricePerL} onChange={(v) => save({ fuel: { ...s.fuel, pricePerL: v } })} />
          <Stepper label="Consum (L/100 km)" value={s.fuel.consumptionL100} step={0.5} min={1} max={30} format={(v) => num(v)} onChange={(consumptionL100) => save({ fuel: { ...s.fuel, consumptionL100 } })} />
          {fuelH > 0 && <p className="muted small">Estimat: {num(fuelH, 1)} lei pe oră de condus.</p>}
          {d.model.fuelPerHour !== fuelH && d.model.fuelPerHour > 0 && <p className="muted small">Din alimentările tale: {num(d.model.fuelPerHour, 1)} lei/oră.</p>}
        </Section>
        <Section icon={<Calculator size={20} />} title="Estimări și învățare" value={`${num(d.model.baseGrossPerHour, 0)} lei/h`}>
          <Stepper label="Câștig brut / oră" value={s.estimates.grossPerHour} step={5} min={10} max={300} format={(v) => `${num(v)} lei`} onChange={(grossPerHour) => save({ estimates: { ...s.estimates, grossPerHour } })} />
          <Stepper label="Valoare medie cursă" value={s.estimates.avgFare} step={1} min={5} max={200} format={(v) => `${num(v)} lei`} onChange={(avgFare) => save({ estimates: { ...s.estimates, avgFare } })} />
          <Stepper label="Km pe oră" value={s.estimates.kmPerHour} step={1} min={5} max={80} format={(v) => `${num(v)} km`} onChange={(kmPerHour) => save({ estimates: { ...s.estimates, kmPerHour } })} />
          <Toggle label="Învață din datele mele" hint={`${num(d.model.learnedHours, 0)} h înregistrate. Încredere deplină după ${s.learning.fullTrustHours} h.`}
            checked={s.learning.enabled} onChange={(enabled) => save({ learning: { ...s.learning, enabled } })} />
        </Section>
      </div>

      <div className="group-title">Program</div>
      <div className="group">
        <LinkRow icon={<CalendarRange size={20} />} title="Șablonul săptămânii" value="ore și intervale" onClick={() => setView('template')} />
        <LinkRow icon={<Flame size={20} />} title="Cererea în București" value="pe ore" onClick={() => setView('heatmap')} />
        <Section icon={<Gauge size={20} />} title="Acasă până la" value={fmtHM(s.homeBy)}>
          <TimeField label="Ora" value={s.homeBy} onChange={onHomeBy} />
          <p className="muted small">În zilele marcate astfel termini la această oră, în afară de bonusurile care merită.</p>
        </Section>
        <Section icon={<Coffee size={20} />} title="Pauze" value={`masă ${s.breaks.mealMin} min`}>
          <Stepper label="Masă după" value={s.breaks.mealAfterMin / 60} step={0.5} min={2} max={8} format={(v) => `${num(v)} h`} onChange={(v) => save({ breaks: { ...s.breaks, mealAfterMin: v * 60 } })} />
          <Stepper label="Durata mesei" value={s.breaks.mealMin} step={5} min={15} max={90} format={(v) => `${v} min`} onChange={(v) => save({ breaks: { ...s.breaks, mealMin: v } })} />
          <Stepper label="Pauză scurtă la" value={s.breaks.restEveryMin / 60} step={0.5} min={1} max={4} format={(v) => `${num(v)} h`} onChange={(v) => save({ breaks: { ...s.breaks, restEveryMin: v * 60 } })} />
          <Stepper label="Durata pauzei" value={s.breaks.restMin} step={5} min={5} max={30} format={(v) => `${v} min`} onChange={(v) => save({ breaks: { ...s.breaks, restMin: v } })} />
        </Section>
      </div>

      <div className="group-title">Notificări</div>
      <div className="group">
        <Section icon={<Bell size={20} />} title="Notificări" value={perm === 'granted' ? `${activeNotifs} active` : 'oprite'} defaultOpen={perm !== 'granted'}>
          {perm !== 'granted' ? (
            <button className="btn primary" onClick={async () => setPerm(await requestPermission())}><Bell size={18} /> Permite notificările</button>
          ) : (
            <button className="btn ghost small" onClick={() => showNotice({ key: `test-${Date.now()}`, title: 'Totul e pregătit', body: 'Așa vor arăta notificările Tura Mea.' })}>Trimite o notificare de test</button>
          )}
          {perm === 'denied' && <p className="warn-text small">Notificările sunt blocate. Activează-le din setările Chrome pentru acest site.</p>}
          {(Object.keys(NOTIFICATION_LABELS) as NotificationType[]).map((k) => (
            <Toggle key={k} label={NOTIFICATION_LABELS[k].label} hint={NOTIFICATION_LABELS[k].example} checked={s.notifications[k]}
              onChange={(v) => save({ notifications: { ...s.notifications, [k]: v } })} />
          ))}
          <Stepper label="Anunță plecarea cu" value={s.notifyLeadMin} step={5} min={0} max={60} format={(v) => `${v} min`} onChange={(notifyLeadMin) => save({ notifyLeadMin })} />
          <Stepper label="Maximum pe zi" value={s.notifyMaxPerDay} step={1} min={1} max={30} onChange={(notifyMaxPerDay) => save({ notifyMaxPerDay })} />
          <div className="btn-row">
            <TimeField label="Liniște de la" value={s.quietFrom} onChange={(quietFrom) => save({ quietFrom })} />
            <TimeField label="până la" value={s.quietTo} onChange={(quietTo) => save({ quietTo })} />
          </div>
          <p className="muted small">În orele de liniște nu primești notificări, în afară de cele din timpul turei.</p>
          <Toggle label="Ține ecranul aprins în tură" hint="Ajută aplicația să rămână activă pentru notificări." checked={s.keepScreenOn} onChange={(keepScreenOn) => save({ keepScreenOn })} />
          <p className="muted small">O aplicație web nu poate trimite notificări sigure când e complet închisă. Pentru mementouri garantate, exportă planul în calendar (ecranul Plan).</p>
        </Section>
      </div>

      <div className="group-title">Date</div>
      <div className="group">
        <LinkRow icon={<History size={20} />} title="Istoric înregistrări" onClick={() => go('istoric')} />
        <LinkRow icon={<Download size={20} />} title="Exportă backup (JSON)" onClick={onExport} />
        <LinkRow icon={<Upload size={20} />} title="Importă din backup" onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </div>
      <p className="muted small row" style={{ gap: 6 }}><Database size={14} /> Datele stau doar pe telefonul tău. Fă un backup săptămânal.</p>

      <p className="muted small center">Tura Mea · v{import.meta.env.VITE_APP_VERSION ?? '0.2'}</p>
    </div>
  );
}
