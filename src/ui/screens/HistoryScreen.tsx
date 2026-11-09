// History of everything logged, grouped by work day. Swipe a row left to delete it.
import { Car, ChevronLeft, Clock3, Fuel, Gift, Receipt } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { dayActuals, shiftMinutes } from '../../domain/actuals';
import { lei, num } from '../../domain/money';
import { addDays, dayMinutesOf, fmtDuration, fmtHM, weekdayOf } from '../../domain/time';
import { longDate, WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Card, SwipeToDelete } from '../components';

function Row({ icon, children, onDelete }: { icon: ReactNode; children: ReactNode; onDelete: () => void }) {
  return (
    <SwipeToDelete onDelete={onDelete}>
      <div className="list-row" style={{ padding: '10px 4px' }}>
        <span className="row"><span className="accent-text">{icon}</span><span>{children}</span></span>
      </div>
    </SwipeToDelete>
  );
}

export function HistoryScreen({ go }: { go: (r: string) => void }) {
  const d = useDerived();
  const data = useApp((x) => x.data);
  const deleteEntry = useApp((x) => x.deleteEntry);
  const deleteDailyTotal = useApp((x) => x.deleteDailyTotal);
  const showToast = useApp((x) => x.showToast);
  const [daysBack, setDaysBack] = useState(14);

  const days = Array.from({ length: daysBack }, (_, i) => addDays(d.today, -i));
  const t = (day: string, ts: number) => fmtHM(dayMinutesOf(ts, day));

  // Swipe = intent; still ask, because deleting cannot be undone.
  const del = (table: 'rides' | 'fuel' | 'payouts' | 'shifts', id: string, what: string) => {
    if (confirm(`Ștergi ${what}? Nu se poate anula.`)) deleteEntry(table, id).then(() => showToast('Șters'));
  };

  return (
    <div className="screen">
      <button className="back" onClick={() => go('setari')}><ChevronLeft size={20} /> Setări</button>
      <h1>Istoric</h1>
      <p className="muted small">Glisează spre stânga pe o înregistrare ca s-o ștergi.</p>
      {days.map((day) => {
        const rides = data.rides.filter((r) => r.day === day).sort((a, b) => b.ts - a.ts);
        const fuel = data.fuel.filter((r) => r.day === day);
        const payouts = data.payouts.filter((r) => r.day === day);
        const shifts = data.shifts.filter((r) => r.day === day);
        const total = data.dailyTotals.find((x) => x.day === day);
        if (!rides.length && !fuel.length && !payouts.length && !shifts.length && !total) return null;
        const a = dayActuals(day, data, d.now);
        return (
          <Card key={day} title={longDate(day, WEEKDAY_NAMES[weekdayOf(day)])} right={<b className="accent-text">{lei(a.gross)}</b>}>
            <span className="muted small">{num(a.hours, 1)} h · {a.rideCount} curse{a.hours > 0 ? ` · ${num(a.gross / a.hours, 0)} lei/h` : ''}</span>
            <div className="list">
              {shifts.map((s) => (
                <Row key={s.id} icon={<Clock3 size={18} />} onDelete={() => del('shifts', s.id, 'tura')}>
                  Tură {t(day, s.start)}–{s.end ? t(day, s.end) : 'acum'} <span className="muted small">({fmtDuration(shiftMinutes(s, d.now))}{s.pauses.length ? `, ${s.pauses.length} pauze` : ''})</span>
                </Row>
              ))}
              {total && (
                <Row icon={<Receipt size={18} />} onDelete={() => confirm('Ștergi totalul zilei?') && deleteDailyTotal(day)}>
                  Total Bolt: <b>{lei(total.gross, true)}</b>, {total.rides} curse
                </Row>
              )}
              {rides.map((r) => (
                <Row key={r.id} icon={<Car size={18} />} onDelete={() => del('rides', r.id, `cursa de ${lei(r.amount, true)}`)}>
                  {t(day, r.ts)} · <b>{lei(r.amount, true)}</b>{total && <span className="muted small"> (înlocuită de total)</span>}
                </Row>
              ))}
              {payouts.map((p) => (
                <Row key={p.id} icon={<Gift size={18} />} onDelete={() => del('payouts', p.id, 'bonusul')}>
                  Bonus <b>{lei(p.amount)}</b>
                </Row>
              ))}
              {fuel.map((f) => (
                <Row key={f.id} icon={<Fuel size={18} />} onDelete={() => del('fuel', f.id, 'alimentarea')}>
                  {t(day, f.ts)} · <b>{lei(f.total)}</b>{f.liters ? ` · ${num(f.liters)} L` : ''}
                </Row>
              ))}
            </div>
          </Card>
        );
      })}
      <button className="btn ghost" onClick={() => setDaysBack(daysBack + 14)}>Arată mai mult</button>
    </div>
  );
}
