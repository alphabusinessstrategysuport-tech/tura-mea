// Quick logging sheet: big numeric keypad, minimal typing.
import { useMemo, useState } from 'react';
import { Car, Fuel, Gift, Receipt } from 'lucide-react';
import { dayActuals, frequentAmounts } from '../../domain/actuals';
import { lei, num } from '../../domain/money';
import { addDays } from '../../domain/time';
import { shortDate } from '../../i18n/ro';
import { useApp, type QuickLogMode } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Chips, NumberField, NumPad, parseAmount, Segmented, Sheet, Stepper } from '../components';
import { haptic } from '../haptics';

const TITLES: Record<QuickLogMode, string> = {
  ride: 'Adaugă cursă',
  fuel: 'Alimentare',
  payout: 'Bonus încasat',
  total: 'Total zi din Bolt',
};

export function QuickLog() {
  const mode = useApp((x) => x.quickLog);
  const open = useApp((x) => x.openQuickLog);
  if (!mode) return null;
  return (
    <Sheet open onClose={() => open(null)} title={TITLES[mode]}>
      <Segmented
        options={[
          { value: 'ride', label: <span className="row" style={{ gap: 4, justifyContent: 'center' }}><Car size={16} />Cursă</span> },
          { value: 'fuel', label: <span className="row" style={{ gap: 4, justifyContent: 'center' }}><Fuel size={16} />GPL</span> },
          { value: 'payout', label: <span className="row" style={{ gap: 4, justifyContent: 'center' }}><Gift size={16} />Bonus</span> },
          { value: 'total', label: <span className="row" style={{ gap: 4, justifyContent: 'center' }}><Receipt size={16} />Total</span> },
        ]}
        value={mode}
        onChange={(m) => open(m as QuickLogMode)}
      />
      {mode === 'ride' && <RideForm />}
      {mode === 'fuel' && <FuelForm />}
      {mode === 'payout' && <PayoutForm />}
      {mode === 'total' && <TotalForm />}
    </Sheet>
  );
}

function RideForm() {
  const rides = useApp((x) => x.data.rides);
  const addRide = useApp((x) => x.addRide);
  const deleteEntry = useApp((x) => x.deleteEntry);
  const showToast = useApp((x) => x.showToast);
  const close = useApp((x) => x.openQuickLog);
  const d = useDerived();
  const [v, setV] = useState('');
  const recent = useMemo(() => frequentAmounts(rides, Date.now()), [rides]);

  const add = async (amount: number) => {
    if (amount <= 0) return;
    const id = await addRide(amount);
    haptic('ride');
    close(null);
    const b = d.bonuses.find((x) => x.state === 'active' && !x.achieved);
    const extra = b ? ` · bonus ${Math.min(b.required, b.done + 1)}/${b.required}` : ` · azi ${lei(d.todayAct.gross + amount)}`;
    showToast(`✓ Cursă de ${lei(amount, true)} adăugată${extra}`, 'Anulează', () => deleteEntry('rides', id));
  };

  return (
    <>
      {recent.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Sumele tale frecvente</div>
          <div className="chips">
            {recent.map((a) => <button key={a} className="chip" style={{ minHeight: 52, minWidth: 76, justifyContent: 'center', fontSize: '1.05rem' }} onClick={() => add(a)}>{num(a, 2)}</button>)}
          </div>
        </div>
      )}
      <NumPad value={v} onChange={setV} />
      <button className="btn primary huge" disabled={parseAmount(v) <= 0} onClick={() => add(parseAmount(v))}>Adaugă cursa</button>
      <p className="muted small">Suma brută, cum apare în Bolt. Comisionul îl scad eu.</p>
    </>
  );
}

function FuelForm() {
  const addFuel = useApp((x) => x.addFuel);
  const deleteEntry = useApp((x) => x.deleteEntry);
  const showToast = useApp((x) => x.showToast);
  const close = useApp((x) => x.openQuickLog);
  const price = useApp((x) => x.settings.fuel.pricePerL);
  const [v, setV] = useState('');
  const [liters, setLiters] = useState<number | null>(null);
  const total = parseAmount(v);
  return (
    <>
      <NumPad value={v} onChange={setV} />
      <NumberField label="Litri (opțional)" suffix="L" value={liters} onChange={setLiters} />
      {total > 0 && price && !liters && <p className="muted small">≈ {num(total / price, 1)} L la {num(price, 2)} lei/L</p>}
      <button className="btn primary huge" disabled={total <= 0} onClick={async () => {
        const id = await addFuel(total, liters ?? undefined);
        close(null);
        haptic('success'); showToast(`✓ Alimentare de ${lei(total)} salvată`, 'Anulează', () => deleteEntry('fuel', id));
      }}>Salvează alimentarea</button>
      <p className="muted small">Din alimentări învăț cât te costă de fapt combustibilul pe oră.</p>
    </>
  );
}

function PayoutForm() {
  const addPayout = useApp((x) => x.addPayout);
  const deleteEntry = useApp((x) => x.deleteEntry);
  const showToast = useApp((x) => x.showToast);
  const close = useApp((x) => x.openQuickLog);
  const bonuses = useApp((x) => x.bonuses);
  const d = useDerived();
  const weekBonuses = bonuses.filter((b) => b.weekId === d.weekId);
  const [v, setV] = useState('');
  const [bonusId, setBonusId] = useState<string | undefined>();
  const amount = parseAmount(v);
  return (
    <>
      {weekBonuses.length > 0 && (
        <div className="chips">
          {weekBonuses.map((b) => (
            <button key={b.id} className={`chip ${bonusId === b.id ? 'on' : ''}`} onClick={() => { setBonusId(b.id); setV(String(b.reward)); }}>
              {lei(b.reward)} · {b.ridesRequired} curse
            </button>
          ))}
        </div>
      )}
      <NumPad value={v} onChange={setV} />
      <button className="btn primary huge" disabled={amount <= 0} onClick={async () => {
        const id = await addPayout(amount, bonusId);
        close(null);
        haptic('success'); showToast(`✓ Bonus de ${lei(amount)} înregistrat`, 'Anulează', () => deleteEntry('payouts', id));
      }}>Salvează bonusul</button>
    </>
  );
}

function TotalForm() {
  const d = useDerived();
  const data = useApp((x) => x.data);
  const setDailyTotal = useApp((x) => x.setDailyTotal);
  const deleteDailyTotal = useApp((x) => x.deleteDailyTotal);
  const showToast = useApp((x) => x.showToast);
  const close = useApp((x) => x.openQuickLog);
  const [day, setDay] = useState(d.today);
  const existing = data.dailyTotals.find((t) => t.day === day);
  const act = dayActuals(day, { ...data, dailyTotals: [] }, d.now);
  const [v, setV] = useState(existing ? String(existing.gross).replace('.', ',') : '');
  const [rides, setRides] = useState(existing?.rides ?? act.rideCount);
  const [hours, setHours] = useState(existing?.hours ?? Math.round(act.hours * 2) / 2);

  const pickDay = (k: string) => {
    setDay(k);
    const e = data.dailyTotals.find((t) => t.day === k);
    const a = dayActuals(k, { ...data, dailyTotals: [] }, d.now);
    setV(e ? String(e.gross).replace('.', ',') : '');
    setRides(e?.rides ?? a.rideCount);
    setHours(e?.hours ?? Math.round(a.hours * 2) / 2);
  };

  return (
    <>
      <Chips options={[{ value: d.today, label: `Azi (${shortDate(d.today)})` }, { value: addDays(d.today, -1), label: `Ieri (${shortDate(addDays(d.today, -1))})` }]} value={day} onChange={pickDay} />
      <NumPad value={v} onChange={setV} />
      <Stepper label="Număr de curse" value={rides} step={1} min={0} max={200} onChange={setRides} />
      <Stepper label="Ore lucrate" value={hours} step={0.5} min={0} max={24} format={(h) => `${num(h)} h`} onChange={setHours} />
      <button className="btn primary huge" disabled={parseAmount(v) <= 0} onClick={async () => {
        await setDailyTotal({ day, gross: parseAmount(v), rides, ...(hours > 0 && act.hours === 0 ? { hours } : {}) });
        close(null);
        haptic('success'); showToast('✓ Totalul zilei a fost salvat');
      }}>Salvează totalul</button>
      <p className="muted small">Totalul din Bolt (doar curse, fără bonusuri) înlocuiește cursele adăugate una câte una pentru acea zi. Orele se iau din ture, dacă le-ai pornit.</p>
      {existing && <button className="btn danger" onClick={async () => { await deleteDailyTotal(day); close(null); showToast('Total șters'); }}>Șterge totalul acestei zile</button>}
    </>
  );
}
