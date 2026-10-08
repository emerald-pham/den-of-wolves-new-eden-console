import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import GmConsole from '../../src/routes/GmConsole';
import ShipConsole from '../../src/routes/ShipConsole';
import { useSessionStore } from '../../src/store/useSessionStore';
import { gmState, playerState } from './mobile-layout-state.mjs';
import '../../src/index.css';

// Presentation-only synthetic identities: no authority responses or production data.
const actor = new URLSearchParams(location.search).get('actor') === 'player' ? 'player' : 'gm';
const fixture = actor === 'gm'
  ? gmState('mobile-layout-fixture', '/gm')
  : playerState('mobile-layout-fixture', '/ships/aegis/roles/admiral');
useSessionStore.getState().reset();
useSessionStore.setState({ ...fixture.state, connection: 'live', sessionSnapshotFreshness: 'server' });
location.hash = actor === 'gm' ? '/gm' : '/ships/aegis/roles/admiral';
createRoot(document.getElementById('root')!).render(
  <div data-motion="reduce"><HashRouter><Routes>
    <Route path="/gm" element={<GmConsole />} />
    <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
    <Route path="/console" element={<h1>Station selection fixture</h1>} />
  </Routes></HashRouter></div>,
);
