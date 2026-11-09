import { useEffect, useState } from 'react';
import { NAV } from './i18n/ro';
import { useNotificationLoop, useWakeLock } from './notifications/runner';
import { useApp } from './store/app';
import { useDerived } from './store/derived';
import { HistoryScreen } from './ui/screens/HistoryScreen';
import { QuickLog } from './ui/screens/QuickLog';
import { TodayScreen } from './ui/screens/TodayScreen';
import { PlanningWizard } from './ui/screens/PlanningWizard';
import { PlanScreen } from './ui/screens/PlanScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';

/** Runs the notification loop and keeps the screen on during a shift. Renders nothing. */
function Background() {
  const d = useDerived();
  const keepScreenOn = useApp((x) => x.settings.keepScreenOn);
  useNotificationLoop(d);
  useWakeLock(!!d.shift && !d.paused && keepScreenOn);
  return null;
}

type Route ='azi' | 'plan' | 'stats' | 'setari' | 'istoric';
const ROUTES: Route[] = ['azi', 'plan', 'stats', 'setari', 'istoric'];

function readRoute(): Route {
  const r = location.hash.replace('#/', '') as Route;
  return ROUTES.includes(r) ? r : 'azi';
}

export function App() {
  const ready = useApp((x) => x.ready);
  const init = useApp((x) => x.init);
  const toast = useApp((x) => x.toast);
  const hideToast = useApp((x) => x.hideToast);
  const wizardWeek = useApp((x) => x.wizardWeek);
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    init();
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [init]);

  const go = (r: string) => {
    location.hash = `#/${r}`;
    window.scrollTo(0, 0);
  };

  if (!ready) return <div className="screen center muted">Se încarcă…</div>;

  return (
    <div className="app">
      <Background />
      {route === 'setari' ? <SettingsScreen go={go} />
        : route === 'plan' ? <PlanScreen />
        : route === 'istoric' ? <HistoryScreen go={go} />
        : route === 'azi' ? <TodayScreen go={go} />
        : <div className="screen"><h1>{route}</h1><p className="muted">În lucru…</p></div>}

      {wizardWeek && <PlanningWizard weekStart={wizardWeek} />}
      <QuickLog />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && <button onClick={() => { toast.action?.(); hideToast(); }}>{toast.actionLabel}</button>}
        </div>
      )}

      <nav className="nav">
        <div className="nav-inner">
          {([
            ['azi', '🏠', NAV.today],
            ['plan', '🗓️', NAV.plan],
            ['stats', '📊', NAV.stats],
            ['setari', '⚙️', NAV.settings],
          ] as const).map(([r, ico, label]) => (
            <button key={r} className={route === r || (r === 'setari' && route === 'istoric') ? 'on' : ''} onClick={() => go(r)}>
              <span className="ico">{ico}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
