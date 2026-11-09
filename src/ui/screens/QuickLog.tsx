// Quick logging sheet: big numeric keypad, minimal typing.
import { useMemo, useState } from 'react';
import { dayActuals } from '../../domain/actuals';
import { lei, num } from '../../domain/money';
import { addDays } from '../../domain/time';
import { shortDate } from '../../i18n/ro';
import { useApp, type QuickLogMode } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Chips, NumberField, NumPad, parseAmount, Sheet, Stepper } from '../components';

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
      <Chips
        options={[
          { value: 'ride', label: '🚕 Cursă' },
          { value: 'fuel', label: '⛽ GPL' },
          { value: 'payout', label: '🎁 Bonus' },
          { value: 'total', label: '🧾 Total' },
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
  const [v, setV] = useState('');
  const recent = useMemo(() => {
    const out: number[] = [];
    for (const r of [...rides].sort((a, b) => b.ts - a.ts)) {
      if (!out.includes(r.amount)) out.push(r.amount);
      if (out.length >= 6) break;
    }
    return out;
  }, [rides]);

  const add = async (amount: number) => {
    if (amount <= 0) return;
    const id = await addRide(amount);
    close(null);
    showToast(`Cursă de ${lei(amount, true)} adăugată 👍`, 'Anulează', () => deleteEntry('rides', id));
  };

  return (
    <>
      {recent.length > 0 && (
        <div className="chips">
          {recent.map((a) => <button key={a} className="chip" onClick={() => add(a)}>{num(a, 2)} lei</button>)}
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
        showToast(`Alimentare de ${lei(total)} salvată ⛽`, 'Anulează', () => deleteEntry('fuel', id));
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
        showToast(`Bonus de ${lei(amount)} înregistrat 🎉`, 'Anulează', () => deleteEntry('payouts', id));
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
        showToast('Totalul zilei a fost salvat 🧾');
      }}>Salvează totalul</button>
      <p className="muted small">Totalul din Bolt (doar curse, fără bonusuri) înlocuiește cursele adăugate una câte una pentru acea zi. Orele se iau din ture, dacă le-ai pornit.</p>
      {existing && <button className="btn danger" onClick={async () => { await deleteDailyTotal(day); close(null); showToast('Total șters'); }}>Șterge totalul acestei zile</button>}
    </>
  );
}
