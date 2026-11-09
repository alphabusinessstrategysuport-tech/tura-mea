import { useState } from 'react';
import { defaultHeatmap } from '../../domain/defaults';
import { WEEKDAY_SHORT } from '../../i18n/ro';
import { useApp } from '../../store/app';

const LEVELS = [
  { v: 10, label: 'Slab' },
  { v: 35, label: 'Puțin' },
  { v: 55, label: 'Mediu' },
  { v: 80, label: 'Mare' },
  { v: 100, label: 'Vârf' },
];

export function heatColor(v: number): string {
  // dark blue → green → amber → red
  const stops = [
    [0, [30, 41, 59]],
    [40, [22, 101, 82]],
    [65, [52, 211, 153]],
    [85, [251, 191, 36]],
    [100, [248, 113, 113]],
  ] as const;
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i];
    const [a, ca] = stops[i - 1];
    if (v <= b) {
      const t = (v - a) / (b - a);
      const c = ca.map((x, k) => Math.round(x + (cb[k] - x) * t));
      return `rgb(${c.join(',')})`;
    }
  }
  return 'rgb(248,113,113)';
}

export function HeatmapEditor({ onBack }: { onBack: () => void }) {
  const heat = useApp((x) => x.heatmap);
  const setHeatmap = useApp((x) => x.setHeatmap);
  const [brush, setBrush] = useState(80);
  const [painting, setPainting] = useState(false);

  const paint = (wd: number, h: number) => {
    if (heat[wd][h] === brush) return;
    setHeatmap(heat.map((row, i) => (i === wd ? row.map((v, j) => (j === h ? brush : v)) : row)));
  };

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>‹ Setări</button>
      <h1>Cererea pe ore</h1>
      <p className="muted small">
        Cât de aglomerat e Bucureștiul în fiecare oră (50 = medie). Valorile implicite presupun: navetă dimineața 7–10, vârful cel mai mare seara 17–20,
        zboruri devreme la Otopeni 4–7, sosiri seara 21–01, viață de noapte vineri și sâmbătă 20–05 (Centrul Vechi, Floreasca, Herăstrău) și întoarceri
        duminică seara (Gara de Nord, aeroport). Alege o culoare și atinge căsuțele ca să le schimbi. Cu timpul, aplicația corectează valorile din datele tale reale.
      </p>
      <div className="chips">
        {LEVELS.map((l) => (
          <button key={l.v} className={`chip ${brush === l.v ? 'on' : ''}`} onClick={() => setBrush(l.v)}>
            <span className="swatch" style={{ background: heatColor(l.v) }} /> {l.label}
          </button>
        ))}
      </div>
      <div className="heatmap" onPointerUp={() => setPainting(false)} onPointerLeave={() => setPainting(false)}>
        <div className="hm-row hm-head">
          <span />
          {WEEKDAY_SHORT.map((d) => <span key={d}>{d}</span>)}
        </div>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="hm-row">
            <span className="hm-hour">{String(h).padStart(2, '0')}</span>
            {heat.map((row, wd) => (
              <button
                key={wd}
                className="hm-cell"
                style={{ background: heatColor(row[h]) }}
                aria-label={`${WEEKDAY_SHORT[wd]} ${h}:00 = ${row[h]}`}
                onPointerDown={() => { setPainting(true); paint(wd, h); }}
                onPointerEnter={() => painting && paint(wd, h)}
              />
            ))}
          </div>
        ))}
      </div>
      <button className="btn ghost" onClick={() => confirm('Revii la valorile implicite pentru București?') && setHeatmap(defaultHeatmap())}>Resetează la implicit</button>
    </div>
  );
}
