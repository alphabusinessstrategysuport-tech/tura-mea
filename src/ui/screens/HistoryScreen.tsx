// History of everything logged, grouped by work day, with delete.
import { useState } from 'react';
import { dayActuals, shiftMinutes } from '../../domain/actuals';
import { lei, num } from '../../domain/money';
import { addDays, dayMinutesOf, fmtDuration, fmtHM, weekdayOf } from '../../domain/time';
import { longDate, WEEKDAY_NAMES } from '../../i18n/ro';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { Card } from '../components';

export function HistoryScreen({ go }: { go: (r: string) => void }) {
  const d = useDerived();
  const data = useApp((x) => x.data);
  const deleteEntry = useApp((x) => x.deleteEntry);
  const deleteDailyTotal = useApp((x) => x.deleteDailyTotal);
  const [daysBack, setDaysBack] = useState(14);

  const days = Array.from({ length: daysBack }, (_, i) => addDays(d.today, -i));
  const del = (table: 'rides' | 'fuel' | 'payouts' | 'shifts', id: string, what: string) => confirm(`Ștergi ${what}?`) && deleteEntry(table, id);
  const t = (day: string, ts: number) => fmtHM(dayMinutesOf(ts, day));

  return (
    <div className="screen">
      <button className="back" onClick={() => go('setari')}>‹ Setări</button>
      <h1>Istoric</h1>
      {days.map((day) => {
        const rides = data.rides.filter((r) => r.day === day).sort((a, b) => b.ts - a.ts);
        const fuel = data.fuel.filter((r) => r.day === day);
        const payouts = data.payouts.filter((r) => r.day === day);
        const shifts = data.shifts.filter((r) => r.day === day);
        const total = data.dailyTotals.find((x) => x.day === day);
        if (!rides.length && !fuel.length && !payouts.length && !shifts.length && !total) return null;
        const a = dayActuals(day, data, d.now);
        return (
          <Card key={day} title={longDate(day, WEEKDAY_NAMES[weekdayOf(day)])} right={<b>{lei(a.gross)}</b>}>
            <span className="muted small">{num(a.hours, 1)} h · {a.rideCount} curse{a.hours > 0 ? ` · ${num(a.gross / a.hours, 0)} lei/h` : ''}</span>
            <div className="list">
              {shifts.map((s) => (
                <div key={s.id} className="list-row">
                  <span>🕒 Tură {t(day, s.start)}–{s.end ? t(day, s.end) : 'acum'} <span className="muted small">({fmtDuration(shiftMinutes(s, d.now))}{s.pauses.length ? `, ${s.pauses.length} pauze` : ''})</span></span>
                  <button className="icon-btn danger" aria-label="Șterge tura" onClick={() => del('shifts', s.id, 'tura')}>🗑</button>
                </div>
              ))}
              {total && (
                <div className="list-row">
                  <span>🧾 Total Bolt: <b>{lei(total.gross, true)}</b>, {total.rides} curse</span>
                  <button className="icon-btn danger" aria-label="Șterge totalul" onClick={() => confirm('Ștergi totalul zilei?') && deleteDailyTotal(day)}>🗑</button>
                </div>
              )}
              {rides.map((r) => (
                <div key={r.id} className="list-row">
                  <span>🚕 {t(day, r.ts)} · <b>{lei(r.amount, true)}</b>{total && <span className="muted small"> (înlocuită de total)</span>}</span>
                  <button className="icon-btn danger" aria-label="Șterge cursa" onClick={() => del('rides', r.id, `cursa de ${lei(r.amount, true)}`)}>🗑</button>
                </div>
              ))}
              {payouts.map((p) => (
                <div key={p.id} className="list-row">
                  <span>🎁 Bonus <b>{lei(p.amount)}</b></span>
                  <button className="icon-btn danger" aria-label="Șterge bonusul" onClick={() => del('payouts', p.id, 'bonusul')}>🗑</button>
                </div>
              ))}
              {fuel.map((f) => (
                <div key={f.id} className="list-row">
                  <span>⛽ {t(day, f.ts)} · <b>{lei(f.total)}</b>{f.liters ? ` · ${num(f.liters)} L` : ''}</span>
                  <button className="icon-btn danger" aria-label="Șterge alimentarea" onClick={() => del('fuel', f.id, 'alimentarea')}>🗑</button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      <button className="btn ghost" onClick={() => setDaysBack(daysBack + 14)}>Arată mai mult</button>
    </div>
  );
}
