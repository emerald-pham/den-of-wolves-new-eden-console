import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LocalGmAccess from './LocalGmAccess';
import { auth } from '@/lib/firebase';
import { useSessionStore } from '@/store/useSessionStore';
vi.mock('@/lib/firebase', () => ({auth:vi.fn()}));
vi.mock('@/lib/firebaseConfig', () => ({firebaseConfig:{projectId:'demo-pc06-local'},useEmulators:true}));
beforeEach(() => {
  vi.stubEnv('DEV',true);
  vi.stubEnv('VITE_LOCAL_GM_ACCESS','1');
  useSessionStore.getState().clearGmAccess();
  vi.mocked(auth).mockReturnValue({authStateReady:vi.fn().mockResolvedValue(undefined),currentUser:{getIdToken:vi.fn().mockResolvedValue('test-local-token')}} as never);
});
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
it('production mode disables the control before touching authentication', () => {
  vi.stubEnv('DEV',false);
  render(<LocalGmAccess />);
  expect(screen.getByRole('button',{name:'Authorize local emulator GM'})).toBeDisabled();
  expect(auth).not.toHaveBeenCalled();
});
it('requires explicit opt-in', () => {
  vi.stubEnv('VITE_LOCAL_GM_ACCESS','0');
  render(<LocalGmAccess />);
  expect(screen.getByRole('button',{name:'Authorize local emulator GM'})).toBeDisabled();
});
it('only a confirmed local server reply establishes the local view of the lease', async () => {
  const fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>({authenticated:true})});
  vi.stubGlobal('fetch',fetcher);
  render(<LocalGmAccess />);
  await userEvent.click(screen.getByRole('button',{name:'Authorize local emulator GM'}));
  expect(fetcher).toHaveBeenCalledWith('/__local-gm-access',expect.objectContaining({method:'POST',body:JSON.stringify({idToken:'test-local-token'})}));
  expect(useSessionStore.getState().gmAccessAuthenticatedAt).toEqual(expect.any(Number));
});
it('failed authorization leaves GM access ungranted and permits a fresh retry', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({authenticated:true})}));
  render(<LocalGmAccess />);
  await userEvent.click(screen.getByRole('button',{name:'Authorize local emulator GM'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Local GM authorization failed');
  expect(useSessionStore.getState().gmAccessAuthenticatedAt).toBeNull();
  expect(screen.getByRole('button',{name:'Authorize local emulator GM'})).toBeEnabled();
});
