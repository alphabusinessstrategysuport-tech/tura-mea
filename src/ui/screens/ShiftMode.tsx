// Focused full-screen driving mode while a shift is running: only what matters, very large.
import { motion } from 'framer-motion';
import { Fuel, Gift, LayoutGrid, Pause, Play, Plus, Receipt, Square } from 'lucide-react';
import { shiftMinutes } from '../../domain/actuals';
import { message } from '../../domain/messages';
import { lei, num } from '../../domain/money';
import { fmtDuration } from '../../domain/time';
import { useApp } from '../../store/app';
import { useDerived } from '../../store/derived';
import { AnimatedNumber, Bar, SlideToConfirm } from '../components';
import { haptic } from '../haptics';
import { BonusCard, motivationFor, NextLine } from './TodayScreen';

const L = (v: number) => lei(v);

export function ShiftMode() {
  const d = useDerived();
  const pauseShift = useApp((x) => x.pauseShift);
  const resumeShift = useApp((x) => x.resumeShift);
  const endShift = useApp((x) => x.endShift);
  const openQuickLog = useApp((x) => x.openQuickLog);
  const setShiftFull = useApp((x) => x.setShiftFull);
  const showToast = useApp((x) => x.showToast);
  const celebrate = useApp((x) => x.celebrate);

  const mins = d.shift ? shiftMinutes(d.shift, d.now) : 0;
  const reached = d.todayTarget > 0 && d.todayAct.gross >= d.todayTarget;
  const bonus = d.bonuses.find((b) => b.state === 'active' && !b.achieved) ?? d.bonuses.find((b) => b.state === 'before');
  const rateGood = d.perHourNow >= d.neededPerHour;

  const onEnd = async () => {
    const earned = d.todayAct.gross;
    const hours = d.hoursToday;
    await endShift();
    if (reached) celebrate({ kind: 'day', title: 'Ziua e făcută', body: message('endOfDay', d.today, { earned, hours }) });
    else showToast(message('endOfDay', d.today, { earned, hours }));
    // Offer to copy the day total from Bolt (more exact than single rides).
    setTimeout(() => openQuickLog('total'), 600);
  };

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ zIndex: 25 }}>
      <div className="shift-mode">
        <div className="spread">
          <span className={`badge ${d.paused ? 'warn' : 'good'}`} style={{ fontSize: '.9rem', padding: '6px 12px' }}>
            {d.paused ? '⏸ În pauză' : '● În tură'} · {fmtDuration(mins)}
          </span>
          <button className="btn small ghost" onClick={() => setShiftFull(true)}><LayoutGrid size={18} /> Vezi tot</button>
        </div>

        <div>
          <div className="eyebrow">Încasat azi</div>
          <div className={`shift-earned ${reached ? 'accent-text' : ''}`}><AnimatedNumber value={d.todayAct.gross} format={L} /></div>
          <div className="muted" style={{ marginTop: 6 }}>
            {reached ? `Ținta de ${L(d.todayTarget)} e atinsă ✓` : <>mai ai <b style={{ color: 'var(--text)' }}>{L(d.remainingToday)}</b> din {L(d.todayTarget)}</>}
          </div>
          <div style={{ marginTop: 10 }}><Bar value={d.todayAct.gross} max={d.todayTarget} tone={reached ? 'gold' : 'good'} /></div>
        </div>

        <div className="stat-grid">
          <div className="stat"><div className="label">Lei/oră acum</div><div className={`value ${d.perHourNow === 0 ? '' : rateGood ? 'good' : 'warn'}`}>{num(d.perHourNow, 0)}</div></div>
          <div className="stat"><div className="label">Necesar / oră</div><div className="value">{num(d.neededPerHour, 0)}</div></div>
        </div>

        {bonus && <BonusCard b={bonus} />}

        <div className="muted"><NextLine d={d} /></div>
        <div className="motivation small" style={{ fontWeight: 500 }}>{motivationFor(d)}</div>

        <div style={{ flex: 1 }} />

        <button className="btn primary plus-ride" onClick={() => { haptic('tap'); openQuickLog('ride'); }}>
          <Plus size={40} strokeWidth={2.6} /> Cursă
        </button>

        <div className="btn-row">
          {d.paused
            ? <button className="btn primary" style={{ minHeight: 64 }} onClick={() => { haptic('tap'); resumeShift(); }}><Play size={22} /> Reia</button>
            : <button className="btn" style={{ minHeight: 64 }} onClick={() => { haptic('tap'); pauseShift(); }}><Pause size={22} /> Pauză</button>}
          <button className="btn" style={{ minHeight: 64 }} aria-label="Combustibil" onClick={() => openQuickLog('fuel')}><Fuel size={22} /></button>
          <button className="btn" style={{ minHeight: 64 }} aria-label="Bonus încasat" onClick={() => openQuickLog('payout')}><Gift size={22} /></button>
          <button className="btn" style={{ minHeight: 64 }} aria-label="Total zi" onClick={() => openQuickLog('total')}><Receipt size={22} /></button>
        </div>

        <SlideToConfirm dangerous label="Glisează ca să închei tura" icon={<Square size={24} fill="currentColor" />} onConfirm={onEnd} />
      </div>
    </motion.div>
  );
}
