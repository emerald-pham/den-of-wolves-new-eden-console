import { mountCasting } from './ui.mjs';
import { createSessionDemoAdapter } from './demo-adapter.mjs';
const adapter = createSessionDemoAdapter();
let mounted;
function mount() {
  mounted?.dispose();
  const [kind, handle] = location.hash.slice(1).split('/');
  const route = ['form', 'dossier'].includes(kind) && handle ? { name: kind, handle } : { name: 'owner' };
  let introSeen = false;
  try { introSeen = localStorage.getItem('dow-casting-synthetic-intro-seen') === 'yes'; } catch { /* Preference persistence is optional. */ }
  mounted = mountCasting(document.querySelector('#casting-app'), {
    adapter, route, introSeen, motionReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    rememberIntro: () => { try { localStorage.setItem('dow-casting-synthetic-intro-seen', 'yes'); } catch { /* No private content is persisted. */ } },
  });
}
window.addEventListener('hashchange', mount);
mount();
