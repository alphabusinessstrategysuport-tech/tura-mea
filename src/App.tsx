import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, CalendarDays, Home, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NAV } from './i18n/ro';
import { useNotificationLoop, useWakeLock } from './notifications/runner';
import { useApp } from './store/app';
import { useDerived } from './store/derived';
import { Celebration } from './ui/components';
import { haptic } from './ui/haptics';
import { HistoryScreen } from './ui/screens/HistoryScreen';
import { ImportBonuses } from './ui/screens/ImportBonuses';
import { PlanningWizard } from './ui/screens/PlanningWizard';
import { PlanScreen } from './ui/screens/PlanScreen';
import { QuickLog } from './ui/screens/QuickLog';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { StatsScreen } from './ui/screens/StatsScreen';
import { TodayScreen } from './ui/screens/TodayScreen';
import { ShiftMode } from './ui/screens/ShiftMode';
import { activeShift } from './domain/actuals';
import { message } from './domain/messages';
import { lei } from './domain/money';

/** Runs the notification loop and keeps the screen on during a shift. Renders nothing. */
function Background() {
  const d = useDerived();
  const keepScreenOn = useApp((x) => x.settings.keepScreenOn);
  useNotificationLoop(d);
  useWakeLock(!!d.shift && !d.paused && keepScreenOn);
  useCelebrations(d);
  return null;
}

/** Celebrates (once) when today's target or a bonus is reached. */
function useCelebrations(d: ReturnType<typeof useDerived>) {
  const sent = useApp((x) => x.sent);
  const markSent = useApp((x) => x.markSent);
  const celebrate = useApp((x) => x.celebrate);
  useEffect(() => {
    const dayKey = `cel:day:${d.today}`;
    if (d.todayTarget > 0 && d.todayAct.gross >= d.todayTarget && d.todayAct.gross > 0 && !sent.includes(dayKey)) {
      markSent([dayKey]);
      celebrate({ kind: 'day', title: 'Ținta de azi e atinsă', body: message('goalReached', d.today, { earned: d.todayAct.gross }) });
      return;
    }
    const b = d.bonuses.find((x) => x.achieved && !sent.includes(`cel:bonus:${x.key}`));
    if (b) {
      markSent([`cel:bonus:${b.key}`]);
      celebrate({ kind: 'bonus', title: `Bonus de ${lei(b.bonus.reward)} atins`, body: `${b.done}/${b.required} curse. Bravo! Nu uita să-l înregistrezi când îl primești.` });
    }
  }, [d.today, d.todayTarget, d.todayAct.gross, d.bonuses, sent, markSent, celebrate]);
}

type Route = 'azi' | 'plan' | 'stats' | 'setari' | 'istoric';
const ROUTES: Route[] = ['azi', 'plan', 'stats', 'setari', 'istoric'];

function readRoute(): Route {
  const r = location.hash.replace('#/', '') as Route;
  return ROUTES.includes(r) ? r : 'azi';
}

/** Bonus link: #/import/<code> */
function readImportCode(): string | null {
  const m = location.hash.match(/^#\/import\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

const TABS = [
  { r: 'azi', Icon: Home, label: NAV.today },
  { r: 'plan', Icon: CalendarDays, label: NAV.plan },
  { r: 'stats', Icon: BarChart3, label: NAV.stats },
  { r: 'setari', Icon: Settings, label: NAV.settings },
] as const;

export function App() {
  const ready = useApp((x) => x.ready);
  const init = useApp((x) => x.init);
  const toast = useApp((x) => x.toast);
  const hideToast = useApp((x) => x.hideToast);
  const wizardWeek = useApp((x) => x.wizardWeek);
  const theme = useApp((x) => x.settings.theme);
  const inShift = useApp((x) => !!activeShift(x.data.shifts));
  const shiftFull = useApp((x) => x.shiftFull);
  const [route, setRoute] = useState<Route>(readRoute);
  const [importCode, setImportCode] = useState(readImportCode);

  useEffect(() => {
    init();
    const onHash = () => {
      setRoute(readRoute());
      setImportCode(readImportCode());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f5f2' : '#0e1116');
  }, [theme]);

  const go = (r: string) => {
    location.hash = `#/${r}`;
    window.scrollTo(0, 0);
  };

  if (!ready) return <div className="screen center muted">Se încarcă…</div>;

  const activeTab = route === 'istoric' ? 'setari' : route;

  return (
    <div className="app">
      <Background />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={route} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {route === 'setari' ? <SettingsScreen go={go} />
            : route === 'plan' ? <PlanScreen />
            : route === 'istoric' ? <HistoryScreen go={go} />
            : route === 'stats' ? <StatsScreen />
            : <TodayScreen go={go} />}
        </motion.div>
      </AnimatePresence>

      {inShift && !shiftFull && <ShiftMode />}
      {wizardWeek && <PlanningWizard weekStart={wizardWeek} />}
      {importCode && <ImportBonuses code={importCode} onDone={go} />}
      <QuickLog />
      <Celebration />

      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className="toast" role="status" initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }}>
            <span>{toast.text}</span>
            {toast.action && <button onClick={() => { toast.action?.(); hideToast(); }}>{toast.actionLabel}</button>}
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="nav">
        <div className="nav-inner">
          {TABS.map(({ r, Icon, label }) => (
            <button key={r} className={activeTab === r ? 'on' : ''} onClick={() => { haptic('tap'); go(r); }} aria-current={activeTab === r ? 'page' : undefined}>
              {activeTab === r && <motion.span layoutId="nav-pill" className="pill" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <Icon size={24} strokeWidth={activeTab === r ? 2.4 : 2} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
