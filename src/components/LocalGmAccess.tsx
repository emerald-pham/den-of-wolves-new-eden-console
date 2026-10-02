import { useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { firebaseConfig, useEmulators } from '@/lib/firebaseConfig';
import { useSessionStore } from '@/store/useSessionStore';

/** Loaded only by an explicitly opted-in Vite development server. */
export default function LocalGmAccess() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = import.meta.env.DEV && import.meta.env.VITE_LOCAL_GM_ACCESS === '1' &&
    useEmulators && /^demo-[a-z0-9-]+$/.test(firebaseConfig.projectId ?? '') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  async function authorize() {
    if (!enabled || busy) return;
    setBusy(true);
    setError('');
    try {
      const localAuth = auth();
      await localAuth.authStateReady();
      const user = localAuth.currentUser ?? (await signInAnonymously(localAuth)).user;
      const response = await fetch('/__local-gm-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await user.getIdToken() }),
      });
      const result: { authenticated?: boolean } = await response.json();
      if (!response.ok || result.authenticated !== true) throw Error('Rejected');
      useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    } catch {
      setError('Local GM authorization failed. Check that the demo emulators are running.');
    } finally { setBusy(false); }
  }
  return <div>
    <p>Local development only · demo emulator data. Production GM access is unchanged.</p>
    <button type="button" className="settings-dialog__gm-access-button cic-action-button"
      disabled={!enabled || busy} onClick={() => void authorize()}>
      {busy ? 'Authorizing local GM…' : 'Authorize local emulator GM'}
    </button>
    {!enabled && <p>Requires a loopback development server and a demo Firebase project.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
