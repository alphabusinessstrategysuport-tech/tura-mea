import { useState } from 'react';
import { newId } from '../../data/db';
import { lei } from '../../domain/money';
import { fmtHM } from '../../domain/time';
import type { Bonus, Weekday } from '../../domain/types';
import { WEEKDAY_SHORT, WEEKDAY_NAMES } from '../../i18n/ro';
import { Chips, Stepper, TimeField } from '../components';

export function bonusSummary(b: Bonus): string {
  const days = b.days.length === 7 ? 'în fiecare zi' : [...b.days].sort().map((d) => WEEKDAY_SHORT[d]).join(', ');
  const kind = b.kind === 'weekly' ? 'săptămânal' : 'zilnic';
  return `${lei(b.reward)} pentru ${b.ridesRequired} curse · ${fmtHM(b.start)}–${fmtHM(b.end)} · ${days} (${kind})`;
}

export function BonusForm({ weekId, initial, onSave, onCancel }: { weekId: string; initial?: Bonus; onSave: (b: Bonus) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Bonus['kind']>(initial?.kind ?? 'daily');
  const [days, setDays] = useState<Weekday[]>(initial?.days ?? [0]);
  const [start, setStart] = useState(initial?.start ?? 15 * 60);
  const [end, setEnd] = useState(initial?.end ?? 21 * 60);
  const [rides, setRides] = useState(initial?.ridesRequired ?? 12);
  const [reward, setReward] = useState(initial?.reward ?? 130);

  const toggleDay = (d: Weekday) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  const normEnd = end <= start ? end + 1440 : end > start + 1440 ? end - 1440 : end;
  const hours = (normEnd - start) / 60;

  const save = () => {
    if (!days.length) return alert('Alege cel puțin o zi.');
    onSave({
      id: initial?.id ?? newId(),
      weekId,
      kind,
      days: [...days].sort() as Weekday[],
      start,
      end: normEnd,
      ridesRequired: rides,
      reward,
      mode: initial?.mode ?? 'auto',
    });
  };

  return (
    <>
      <Chips options={[{ value: 'daily', label: 'Zilnic' }, { value: 'weekly', label: 'Săptămânal' }]} value={kind} onChange={setKind} />
      <p className="muted small">
        {kind === 'daily' ? 'Se poate câștiga separat în fiecare zi aleasă.' : 'Cursele se adună din toate zilele alese, o singură recompensă.'}
      </p>
      <div>
        <div className="muted small">Zile</div>
        <Chips options={WEEKDAY_SHORT.map((l, i) => ({ value: i as Weekday, label: l }))} value={days} onChange={toggleDay} />
        {days.length > 0 && <p className="muted small">{[...days].sort().map((d) => WEEKDAY_NAMES[d]).join(', ')}</p>}
      </div>
      <div className="btn-row">
        <TimeField label="De la" value={start} onChange={setStart} />
        <TimeField label="Până la" value={end % 1440} onChange={setEnd} />
      </div>
      <p className="muted small">Fereastră de {hours.toFixed(hours % 1 ? 1 : 0)} ore{normEnd > 1440 ? ' (se termină după miezul nopții)' : ''}.</p>
      <Stepper label="Curse necesare" value={rides} step={1} min={1} max={200} onChange={setRides} />
      <Stepper label="Recompensă" value={reward} step={5} min={0} max={5000} format={(v) => lei(v)} onChange={setReward} />
      <div className="btn-row">
        <button className="btn ghost" onClick={onCancel}>Renunță</button>
        <button className="btn primary" onClick={save}>Salvează bonusul</button>
      </div>
    </>
  );
}
