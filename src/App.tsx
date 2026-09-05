import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Landing from '@/routes/Landing';
import RoleSelect from '@/routes/RoleSelect';
import NotFound from '@/routes/NotFound';
import { connect } from '@/lib/sessionService';
import AppHeader from '@/components/AppHeader';
import { useSessionStore } from '@/store/useSessionStore';

const RECONNECT_INTERVAL_MS = 2_000;

/**
 * HashRouter, not BrowserRouter: deep links keep working on any purely static
 * host with no rewrite rules, which is what both Firebase Hosting's default
 * config and GitHub Pages give you.
 */
export default function App() {
  // The status light starts red and only goes yellow once this resolves, so a
  // misconfigured or unreachable Firebase shows as red rather than as a page
  // that looks fine and silently does nothing.
  useEffect(() => {
    void connect();

    const retry = window.setInterval(() => {
      if (useSessionStore.getState().connection !== 'live') void connect();
    }, RECONNECT_INTERVAL_MS);

    const markOffline = () => {
      useSessionStore.getState().setConnection('offline');
    };
    const reconnectNow = () => {
      void connect();
    };

    window.addEventListener('offline', markOffline);
    window.addEventListener('online', reconnectNow);

    return () => {
      window.clearInterval(retry);
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', reconnectNow);
    };
  }, []);

  return (
    <HashRouter>
      <AppHeader />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/roles" element={<RoleSelect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
