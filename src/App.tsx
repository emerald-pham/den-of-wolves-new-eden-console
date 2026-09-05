import { HashRouter, Route, Routes } from 'react-router-dom';
import Landing from '@/routes/Landing';
import NotFound from '@/routes/NotFound';

/**
 * HashRouter, not BrowserRouter: deep links keep working on any purely static
 * host with no rewrite rules, which is what both Firebase Hosting's default
 * config and GitHub Pages give you.
 */
export default function App() {
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
