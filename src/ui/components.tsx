// Small reusable UI pieces, built for one-handed use: big targets, high contrast.
import { useEffect, type ReactNode } from 'react';
import { fmtHM, parseHM } from '../domain/time';

export function Ring({ value, max, size = 104, label, sub, color = 'var(--good)' }: { value: number; max: number; size?: number; label: string; sub?: string; color?: string }) {
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--gold)' : color} strokeWidth={stroke}
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-pct">{Math.round(pct * 100)}%</text>
      </svg>
      <div className="ring-label">{label}</div>
      {sub && <div className="ring-sub">{sub}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Închide">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Big numeric keypad. `value` is a string so the user can type "25,5". */
export function NumPad({ value, onChange, suffix = 'lei' }: { value: string; onChange: (v: string) => void; suffix?: string }) {
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === ',') return value.includes(',') ? undefined : onChange((value || '0') + ',');
    if (value.includes(',') && value.split(',')[1].length >= 2) return;
    if (value.replace(',', '').length >= 6) return;
    onChange(value === '0' ? k : value + k);
  };
  return (
    <div className="numpad">
      <div className="numpad-display">
        <span>{value || '0'}</span> <small>{suffix}</small>
      </div>
      <div className="numpad-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((k) => (
          <button key={k} className="key" onClick={() => press(k)} aria-label={k === '⌫' ? 'Șterge' : k}>{k}</button>
        ))}
      </div>
    </div>
  );
}

export function parseAmount(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 1e9, format = (v: number) => String(v), label }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string; label?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div className="stepper">
      {label && <span className="stepper-label">{label}</span>}
      <button className="step-btn" onClick={() => set(value - step)} aria-label="Minus">−</button>
      <span className="step-val">{format(value)}</span>
      <button className="step-btn" onClick={() => set(value + step)} aria-label="Plus">+</button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint && <small className="hint">{hint}</small>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Chips<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T | T[]; onChange: (v: T) => void;
}) {
  const sel = Array.isArray(value) ? value : [value];
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o.value)} className={`chip ${sel.includes(o.value) ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Time picker for day minutes. Shows "+1 zi" for values past midnight. */
export function TimeField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  const next = value >= 1440;
  return (
    <label className="time-field">
      {label && <span>{label}</span>}
      <input type="time" value={fmtHM(value)} onChange={(e) => e.target.value && onChange(parseHM(e.target.value) + (next ? 1440 : 0))} />
      {next && <small className="hint">+1 zi</small>}
    </label>
  );
}

export function NumberField({ value, onChange, label, suffix, step = 'any' }: {
  value: number | null; onChange: (v: number | null) => void; label: string; suffix?: string; step?: string;
}) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <span className="num-input">
        <input
          type="number" inputMode="decimal" step={step} value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

export function Bar({ value, max, tone = 'good' }: { value: number; max: number; tone?: 'good' | 'warn' | 'bad' | 'gold' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar">
      <div className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Card({ title, children, right, className = '' }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
