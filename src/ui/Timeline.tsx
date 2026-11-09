// Horizontal day timeline: work (green), meal (amber), rest (blue-grey), bonus windows, "now" marker.
import { fmtHM } from '../domain/time';
import type { PlanItem } from '../domain/types';

export function Timeline({ items, bonusWindows = [], nowMin, compact = false }: {
  items: PlanItem[];
  bonusWindows?: { start: number; end: number }[];
  nowMin?: number;
  compact?: boolean;
}) {
  const starts = [...items.map((i) => i.start), ...bonusWindows.map((b) => b.start)];
  const ends = [...items.map((i) => i.end), ...bonusWindows.map((b) => b.end)];
  const from = Math.min(6 * 60, ...starts.map((s) => Math.floor(s / 60) * 60));
  const to = Math.max(24 * 60, ...ends.map((e) => Math.ceil(e / 60) * 60));
  const span = to - from;
  const pos = (m: number) => `${((m - from) / span) * 100}%`;
  const ticks: number[] = [];
  for (let t = Math.ceil(from / 180) * 180; t <= to; t += 180) ticks.push(t);

  return (
    <div className={`timeline ${compact ? 'compact' : ''}`}>
      <div className="tl-track">
        {bonusWindows.map((b, i) => (
          <div key={`b${i}`} className="tl-bonus" style={{ left: pos(b.start), width: `${((b.end - b.start) / span) * 100}%` }} />
        ))}
        {items.map((it, i) => (
          <div
            key={i}
            className={`tl-item ${it.kind}`}
            style={{ left: pos(it.start), width: `${((it.end - it.start) / span) * 100}%` }}
            title={`${fmtHM(it.start)}–${fmtHM(it.end)}`}
          />
        ))}
        {nowMin !== undefined && nowMin >= from && nowMin <= to && <div className="tl-now" style={{ left: pos(nowMin) }} />}
      </div>
      {!compact && (
        <div className="tl-ticks">
          {ticks.map((t) => (
            <span key={t} style={{ left: pos(t) }}>{fmtHM(t).slice(0, 2)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "08:00–12:30, 21:00–03:30" */
export function runsLabel(runs: { start: number; end: number }[]): string {
  if (!runs.length) return 'Liber';
  return runs.map((r) => `${fmtHM(r.start)}–${fmtHM(r.end)}`).join(', ');
}
