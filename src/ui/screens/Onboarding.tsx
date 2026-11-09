// First-launch setup (~1 min): target → costs → commission & LPG → work pattern → notifications & install.
// Every step saves immediately; existing values are pre-filled, so it is safe to re-run from Settings.
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Car, Check, ChevronLeft, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { newId } from '../../data/db';
import { templatePresets } from '../../domain/defaults';
import { fuelPerHourEstimate, monthlyNetTarget, weeklyFixedCosts, weeklyNetTarget } from '../../domain/finance';
import { lei, num } from '../../domain/money';
import type { CostItem, Settings } from '../../domain/types';
import { WEEKDAY_SHORT } from '../../i18n/ro';
import { permission, requestPermission } from '../../notifications/runner';
import { useApp } from '../../store/app';
import { Card, Chips, NumberField, Segmented, Stepper } from '../components';
import { haptic } from '../haptics';

type InstallEvent = Event & { prompt: () => Promise<void> };

export function Onboarding() {
  const settings = useApp((x) => x.settings);
  const setSettings = useApp((x) => x.setSettings);
  const template = useApp((x) => x.template);
  const setTemplate = useApp((x) => x.setTemplate);
  const openOnboarding = useApp((x) => x.openOnboarding);
  const [step, setStep] = useState(0);
  const [perm, setPerm] = useState(permission());
  const [preset, setPreset] = useState<string | null>(null);
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const s = settings;
  const save = (patch: Partial<Settings>) => setSettings({ ...s, ...patch });
  const setCost = (id: string, patch: Partial<CostItem>) => save({ costItems: s.costItems.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const presets = templatePresets();
  const STEPS = 6;

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const finish = async () => {
    await setSettings({ ...useApp.getState().settings, onboarded: true });
    haptic('success');
    openOnboarding(false);
  };
  const next = () => { haptic('tap'); setStep(Math.min(STEPS - 1, step + 1)); window.scrollTo(0, 0); };

  return (
    <div className="overlay" style={{ zIndex: 35 }}>
      <div className="screen">
        <div className="spread">
          {step > 0 ? <button className="back" onClick={() => setStep(step - 1)}><ChevronLeft size={20} /> Înapoi</button> : <span />}
          <button className="btn small ghost" onClick={finish}>{settings.onboarded ? 'Închide' : 'Sari peste'}</button>
        </div>
        <div className="steps">{Array.from({ length: STEPS }, (_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {step === 0 && (
              <>
                <div style={{ display: 'grid', placeItems: 'center', margin: '20px 0 4px' }}>
                  <div style={{ width: 88, height: 88, borderRadius: 26, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', boxShadow: '0 12px 40px color-mix(in srgb, var(--accent) 40%, transparent)' }}><Car size={46} /></div>
                </div>
                <h1 className="center">Bun venit în Tura Mea</h1>
                <p className="center muted">Îți spun cât să lucrezi ca să atingi profitul dorit, îți fac programul săptămânii și te țin motivat în tură.</p>
                <Card>
                  {['Ținta ta de profit NET', 'Costurile fixe și combustibilul', 'Programul tău obișnuit'].map((t) => (
                    <div key={t} className="row"><Check size={20} className="accent-text" />{t}</div>
                  ))}
                  <p className="muted small">Durează cam un minut. Totul se poate schimba oricând din Setări.</p>
                </Card>
              </>
            )}

            {step === 1 && (
              <>
                <h1>Cât vrei să câștigi?</h1>
                <p className="muted">Profitul NET: ce îți rămâne după comision, combustibil și costuri.</p>
                <Card>
                  <Segmented options={[{ value: 'monthly', label: 'Pe lună' }, { value: 'weekly', label: 'Pe săptămână' }]} value={s.target.mode} onChange={(mode) => save({ target: { ...s.target, mode } })} />
                  <Stepper label="Ținta NET" value={s.target.amount} step={100} min={0} max={50000} format={(v) => lei(v)} onChange={(amount) => save({ target: { ...s.target, amount } })} />
                  <p className="muted small">≈ {lei(weeklyNetTarget(s))} pe săptămână · {lei(monthlyNetTarget(s))} pe lună</p>
                </Card>
              </>
            )}

            {step === 2 && (
              <>
                <h1>Costuri fixe</h1>
                <p className="muted">Chiria mașinii, contractul și orice altceva plătești regulat.</p>
                <Card>
                  {s.costItems.map((c) => (
                    <div key={c.id} className="cost-row">
                      <input className="text-input" value={c.name} onChange={(e) => setCost(c.id, { name: e.target.value })} aria-label="Denumire cost" />
                      <input className="text-input amount" type="number" inputMode="decimal" value={c.amount} onChange={(e) => setCost(c.id, { amount: Number(e.target.value) || 0 })} aria-label="Sumă" />
                      <Chips options={[{ value: 'week', label: '/săpt' }, { value: 'month', label: '/lună' }]} value={c.period} onChange={(period) => setCost(c.id, { period })} />
                      <button className="icon-btn danger" aria-label="Șterge costul" onClick={() => save({ costItems: s.costItems.filter((x) => x.id !== c.id) })}><Trash2 size={18} /></button>
                    </div>
                  ))}
                  <button className="btn ghost small" onClick={() => save({ costItems: [...s.costItems, { id: newId(), name: 'Cost nou', amount: 0, period: 'week' }] })}><Plus size={16} /> Adaugă cost</button>
                  <b>Total: {lei(weeklyFixedCosts(s))} pe săptămână</b>
                </Card>
              </>
            )}

            {step === 3 && (
              <>
                <h1>Comision și combustibil</h1>
                <Card>
                  <Stepper label="Comision Bolt" value={s.commissionPct} step={1} min={0} max={50} format={(v) => `${num(v)}%`} onChange={(commissionPct) => save({ commissionPct })} />
                  <Stepper label="Consum GPL (L/100 km)" value={s.fuel.consumptionL100} step={0.5} min={1} max={30} format={(v) => num(v)} onChange={(consumptionL100) => save({ fuel: { ...s.fuel, consumptionL100 } })} />
                  <NumberField label="Preț GPL" suffix="lei/L" value={s.fuel.pricePerL} onChange={(v) => save({ fuel: { ...s.fuel, pricePerL: v } })} />
                  {fuelPerHourEstimate(s) > 0 && <p className="muted small">≈ {num(fuelPerHourEstimate(s), 1)} lei combustibil pe oră de condus.</p>}
                </Card>
              </>
            )}

            {step === 4 && (
              <>
                <h1>Cum lucrezi de obicei?</h1>
                <p className="muted">Alege ce se potrivește cel mai bine. Ajustezi detaliile în Setări → Șablonul săptămânii.</p>
                {presets.map((p) => {
                  const on = preset === p.id;
                  return (
                    <button key={p.id} className={`day-row ${on ? 'today' : ''}`} onClick={() => { setPreset(p.id); setTemplate(p.template); haptic('tap'); }}>
                      <div className="day-top"><b>{p.label}</b>{on && <Check size={20} className="accent-text" />}</div>
                      <span className="muted small">{p.description}</span>
                      <div className="day-meta">{p.template.map((t, i) => <span key={i}>{WEEKDAY_SHORT[i]} <b>{t.enabled ? `${num(t.maxHours)}h` : '–'}</b></span>)}</div>
                    </button>
                  );
                })}
                {!preset && <p className="muted small">Programul actual: {template.map((t, i) => `${WEEKDAY_SHORT[i]} ${t.enabled ? num(t.maxHours) + 'h' : '–'}`).join(' · ')}</p>}
              </>
            )}

            {step === 5 && (
              <>
                <h1>Ultimul pas</h1>
                <Card>
                  <div className="row"><Bell className="accent-text" /><b>Notificări</b></div>
                  <p className="muted small">Te anunț când să pleci, la pauze, când ești aproape de bonus și duminică dimineața pentru plan. Maximum {s.notifyMaxPerDay} pe zi, fără notificări noaptea.</p>
                  {perm === 'granted'
                    ? <span className="good-text row"><Check size={18} /> Notificările sunt pornite</span>
                    : <button className="btn primary" onClick={async () => setPerm(await requestPermission())}>Permite notificările</button>}
                </Card>
                <Card>
                  <div className="row"><Smartphone className="accent-text" /><b>Pune aplicația pe ecranul principal</b></div>
                  {installEvt
                    ? <button className="btn primary" onClick={async () => { await installEvt.prompt(); setInstallEvt(null); }}>Instalează aplicația</button>
                    : <p className="muted small">În Chrome: meniul ⋮ → „Adaugă pe ecranul de pornire”. Pornește pe tot ecranul, ca o aplicație normală.</p>}
                </Card>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="sticky-actions">
        <div className="btn-row">
          {step < STEPS - 1
            ? <button className="btn primary" style={{ minHeight: 64 }} onClick={next}>{step === 0 ? 'Să începem' : 'Continuă'}</button>
            : <button className="btn primary" style={{ minHeight: 64 }} onClick={finish}><Check size={20} /> Gata</button>}
        </div>
      </div>
    </div>
  );
}
