// Reusable UI pieces, built for one-handed use in the car: big targets, high contrast, smooth motion.
import { animate, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Award, ChevronsRight, Delete, Minus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { fmtHM, parseHM } from '../domain/time';
import { useApp } from '../store/app';
import { haptic } from './haptics';

const spring = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** Number that counts smoothly to its new value (e.g. 212 → 239 lei). */
export function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (!ref.current) return;
    if (from === value) {
      ref.current.textContent = format(value);
      return;
    }
    const c = animate(from, value, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => ref.current && (ref.current.textContent = format(v)) });
    return () => c.stop();
  }, [value, format]);
  return <span ref={ref}>{format(value)}</span>;
}

/** Single progress ring with % inside. */
export function Ring({ value, max, size = 104, label, sub, color = 'var(--teal)' }: { value: number; max: number; size?: number; label: string; sub?: string; color?: string }) {
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {pct > 0 && (
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--gold)' : color} strokeWidth={stroke}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeDasharray={c}
            initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )}
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-pct">{Math.round(pct * 100)}%</text>
      </svg>
      <div className="ring-label">{label}</div>
      {sub && <div className="ring-sub">{sub}</div>}
    </div>
  );
}

export interface RingSpec { value: number; max: number; color: string; label: string }

/** Three concentric rings: day (outer), week, month (inner). Turns gold when complete. */
export function TripleRing({ rings, size = 150, center }: { rings: RingSpec[]; size?: number; center?: ReactNode }) {
  const stroke = size * 0.085;
  const gap = stroke * 0.32;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {rings.map((rg, i) => {
          const r = size / 2 - stroke / 2 - i * (stroke + gap);
          const c = 2 * Math.PI * r;
          const pct = rg.max > 0 ? Math.min(1, Math.max(0, rg.value / rg.max)) : 0;
          return (
            <g key={rg.label}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
              <motion.circle
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--gold)' : rg.color} strokeWidth={stroke}
                strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeDasharray={c}
                initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(pct, 0.004)) }}
                transition={{ duration: 1, delay: i * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </g>
          );
        })}
      </svg>
      {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
    </div>
  );
}

/** "Slide to start" control: prevents accidental taps while driving. */
export function SlideToConfirm({ label, onConfirm, dangerous = false, icon }: { label: string; onConfirm: () => void; dangerous?: boolean; icon?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [maxX, setMaxX] = useState(240);
  const x = useMotionValue(0);
  const labelOpacity = useTransform(x, [0, maxX * 0.6], [1, 0]);
  useLayoutEffect(() => {
    const w = track.current?.offsetWidth ?? 300;
    setMaxX(Math.max(120, w - 76));
  }, []);
  const end = (_: unknown, info: PanInfo) => {
    if (x.get() > maxX * 0.82 || info.velocity.x > 900) {
      animate(x, maxX, { duration: 0.12 });
      haptic('success');
      setTimeout(() => {
        onConfirm();
        x.set(0);
      }, 140);
    } else {
      animate(x, 0, spring);
    }
  };
  return (
    <div ref={track} className={`slide ${dangerous ? 'dangerous' : ''}`} role="button" aria-label={label}
      tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onConfirm()}>
      <motion.div className="slide-label" style={{ opacity: labelOpacity }}>{label}</motion.div>
      <motion.div className="slide-knob" drag="x" dragConstraints={{ left: 0, right: maxX }} dragElastic={0.05} dragMomentum={false} style={{ x }} onDragEnd={end}>
        {icon ?? <ChevronsRight size={30} strokeWidth={2.5} />}
      </motion.div>
    </div>
  );
}

/** Bottom sheet: slides up, closes with ✕, Escape, tap outside or a swipe down on the handle. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const controls = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }} animate={{ y: 0 }} transition={spring}
        drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.9 }}
        onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
      >
        <div onPointerDown={(e) => controls.start(e)} style={{ touchAction: 'none' }}>
          <div className="sheet-grip" />
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn plain" onClick={onClose} aria-label="Închide"><X size={22} /></button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </motion.div>
    </motion.div>
  );
}

/** Row that can be swiped left to delete. */
export function SwipeToDelete({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const x = useMotionValue(0);
  return (
    <div className="swipe-row">
      <div className="swipe-bg"><Trash2 size={18} /> Șterge</div>
      <motion.div className="swipe-fg" drag="x" dragConstraints={{ left: -140, right: 0 }} dragElastic={0.1} style={{ x }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -110) {
            haptic('warn');
            onDelete();
          }
          animate(x, 0, spring);
        }}>
        {children}
      </motion.div>
    </div>
  );
}

/** Big numeric keypad. `value` is a string so the user can type "25,5". */
export function NumPad({ value, onChange, suffix = 'lei' }: { value: string; onChange: (v: string) => void; suffix?: string }) {
  const press = (k: string) => {
    haptic('tap');
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === ',') return value.includes(',') ? undefined : onChange((value || '0') + ',');
    if (value.includes(',') && value.split(',')[1].length >= 2) return;
    if (value.replace(',', '').length >= 6) return;
    onChange(value === '0' ? k : value + k);
  };
  return (
    <div className="numpad">
      <motion.div className="numpad-display" key={value.length} initial={{ scale: 0.97 }} animate={{ scale: 1 }}>
        <span>{value || '0'}</span> <small>{suffix}</small>
      </motion.div>
      <div className="numpad-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((k) => (
          <button key={k} className="key" onClick={() => press(k)} aria-label={k === '⌫' ? 'Șterge' : k}>
            {k === '⌫' ? <Delete size={26} style={{ verticalAlign: 'middle' }} /> : k}
          </button>
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
  // Tap the value to type any exact number (e.g. 131), not only multiples of `step`.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(n)) set(n);
    setDraft(null);
  };
  return (
    <div className="stepper">
      {label && <span className="stepper-label">{label}</span>}
      <button className="step-btn" onClick={() => { haptic('tap'); set(value - step); }} aria-label="Minus"><Minus size={22} /></button>
      {draft === null ? (
        <button className="step-val" onClick={() => setDraft(String(value).replace('.', ','))} aria-label={`${label ?? 'Valoare'}: ${format(value)}. Atinge ca să scrii altă valoare`}>
          {format(value)}
        </button>
      ) : (
        <input
          className="step-input"
          autoFocus
          inputMode="decimal"
          enterKeyHint="done"
          value={draft}
          aria-label={label ?? 'Valoare'}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
      )}
      <button className="step-btn" onClick={() => { haptic('tap'); set(value + step); }} aria-label="Plus"><Plus size={22} /></button>
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
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => { haptic('tap'); onChange(e.target.checked); }} />
    </label>
  );
}

export function Chips<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: ReactNode }[]; value: T | T[]; onChange: (v: T) => void;
}) {
  const sel = Array.isArray(value) ? value : [value];
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o.value)} className={`chip ${sel.includes(o.value) ? 'on' : ''}`} onClick={() => { haptic('tap'); onChange(o.value); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** iOS/Android-style segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => { haptic('tap'); onChange(o.value); }}>
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

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <motion.section className={`card ${className}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {(title || right) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </motion.section>
  );
}

/** Elegant gold celebration: soft card + a few particles. Fires from the store (`celebrate`). */
export function Celebration() {
  const c = useApp((x) => x.celebration);
  const clear = useApp((x) => x.clearCelebration);
  useEffect(() => {
    if (!c) return;
    haptic(c.kind === 'bonus' ? 'bonus' : 'goal');
    const t = setTimeout(clear, 3800);
    return () => clearTimeout(t);
  }, [c, clear]);
  if (!c) return null;
  const parts = Array.from({ length: 22 }, (_, i) => i);
  return (
    <div className="celebrate" onClick={clear}>
      {parts.map((i) => {
        const a = (i / parts.length) * Math.PI * 2;
        const d = 120 + (i % 5) * 28;
        return (
          <motion.span key={i} className="particle"
            style={{ background: i % 3 === 0 ? 'var(--accent)' : 'var(--gold)', borderRadius: i % 2 ? 99 : 2 }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d + 60, opacity: 0, scale: 1, rotate: 180 }}
            transition={{ duration: 1.6, ease: 'easeOut' }} />
        );
      })}
      <motion.div className="celebrate-card" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        <div style={{ display: 'grid', placeItems: 'center', color: 'var(--gold)' }}>{c.kind === 'bonus' ? <Award size={44} /> : <Sparkles size={44} />}</div>
        <h2 style={{ margin: '6px 0' }}>{c.title}</h2>
        <p className="muted">{c.body}</p>
      </motion.div>
    </div>
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
