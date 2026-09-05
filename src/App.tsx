import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Landing from '@/routes/Landing';
import NotFound from '@/routes/NotFound';
import { connect } from '@/lib/sessionService';

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
  }, []);

  return (
    <HashRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
