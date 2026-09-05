import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import ScreenFade, { SCREEN_FADE_MS, SHARED_FLAG_MOVE_MS } from './ScreenFade';

function Harness({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <>
      <ScreenFade>{(location) => <p>screen {location.pathname}</p>}</ScreenFade>
      <button type="button" onClick={() => navigate(to)}>
        Go
      </button>
    </>
  );
}

function FlagHarness() {
  const navigate = useNavigate();
  return (
    <>
      <ScreenFade>{(location) => location.pathname.endsWith('/roles')
        ? (
            <img
              data-shared-flag="aegis"
              alt="Roster flag"
              style={{ objectFit: 'contain', objectPosition: 'left center' }}
            />
          )
        : (
            <img
              data-shared-flag="aegis"
              alt="Command flag"
              style={{ objectFit: 'contain', objectPosition: 'center center' }}
            />
          )}
      </ScreenFade>
      <button type="button" onClick={() => navigate('/ships/aegis/roles/commander')}>
        Go
      </button>
    </>
  );
}

function RapidFlagHarness() {
  const navigate = useNavigate();
  return (
    <>
      <ScreenFade>{(location) => (
        <img
          data-shared-flag="aegis"
          alt={`Flag ${location.pathname}`}
          data-shared-flag-layer={location.pathname.endsWith('/roles') ? undefined : 'background'}
          style={{ objectFit: 'contain', objectPosition: 'center center' }}
        />
      )}</ScreenFade>
      <button type="button" onClick={() => navigate('/ships/aegis/roles/commander')}>
        Commander
      </button>
      <button type="button" onClick={() => navigate('/ships/aegis/roles/executive-officer')}>
        Executive officer
      </button>
    </>
  );
}

function RouteAwareFlagHarness({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <>
      <ScreenFade>{(location) => (
        <img
          data-shared-flag="aegis"
          alt={`Flag ${location.pathname}`}
          data-shared-flag-layer={location.pathname.endsWith('/roles') ? undefined : 'background'}
          style={{ objectFit: 'contain', objectPosition: 'center center' }}
        />
      )}</ScreenFade>
      <button type="button" onClick={() => navigate(to)}>Go</button>
    </>
  );
}

// The fade wrapper is chrome with no role, name or text of its own.
const fade = () => document.querySelector('.screen-fade');

function renderHarness(to: string) {
  return render(
    <MemoryRouter initialEntries={['/first']}>
      <Harness to={to} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ScreenFade', () => {
  it('holds the outgoing screen while it fades, then brings the new one in', () => {
    vi.useFakeTimers();
    renderHarness('/second');

    expect(screen.getByText('screen /first')).toBeInTheDocument();
    expect(fade()).toHaveAttribute('data-phase', 'in');

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    // Still the old screen: it has to be on screen to be fading out.
    expect(fade()).toHaveAttribute('data-phase', 'out');
    expect(fade()?.querySelector('.screen-fade__content')).toContainElement(
      screen.getByText('screen /first'),
    );
    expect(screen.getByText('screen /first')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SCREEN_FADE_MS);
    });

    expect(screen.getByText('screen /second')).toBeInTheDocument();
    expect(fade()).toHaveAttribute('data-phase', 'in');
    expect(fade()).toHaveAttribute('data-crossing', 'true');

    act(() => {
      vi.advanceTimersByTime(SCREEN_FADE_MS);
    });
    expect(fade()).toHaveAttribute('data-crossing', 'true');

    act(() => {
      vi.advanceTimersByTime(SHARED_FLAG_MOVE_MS - SCREEN_FADE_MS);
    });
    expect(fade()).toHaveAttribute('data-crossing', 'false');
  });

  it('stays put when navigation lands on the screen already showing', () => {
    vi.useFakeTimers();
    renderHarness('/first');

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    // A redirect back to where we already are is not a crossing.
    expect(fade()).toHaveAttribute('data-phase', 'in');
    expect(screen.getByText('screen /first')).toBeInTheDocument();
  });

  it('spends as long going out as coming back in, for a fifth of a second in all', () => {
    expect(SCREEN_FADE_MS * 2).toBe(200);
  });

  it('moves a ship flag without stretching its image aspect ratio', () => {
    vi.useFakeTimers();
    const userMotion = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValueOnce({ left: 10, top: 20, width: 100, height: 80 } as DOMRect)
      .mockReturnValue({ left: 70, top: 90, width: 420, height: 420 } as DOMRect);
    render(
      <MemoryRouter initialEntries={['/ships/aegis/roles']}>
        <FlagHarness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    const sourceFlag = document.querySelector<HTMLImageElement>(
      '.screen-fade__content [alt="Roster flag"]',
    );
    const persistentFlag = document.querySelector<HTMLImageElement>('.shared-flag-transition');
    expect(sourceFlag).toHaveStyle({ visibility: 'hidden' });
    expect(persistentFlag).toBeInTheDocument();
    expect(persistentFlag?.parentElement).toBe(fade());
    expect(persistentFlag?.parentElement).not.toHaveClass('screen-fade__content');
    expect(persistentFlag?.style.zIndex).toBe('20');

    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));

    const movingFlag = document.querySelector<HTMLImageElement>('.shared-flag-transition');
    expect(movingFlag).toBeInTheDocument();
    expect(movingFlag?.parentElement?.classList.contains('screen-fade')).toBe(true);
    expect(movingFlag?.style.objectPosition).toBe('left center');

    act(() => vi.advanceTimersByTime(20));
    expect(movingFlag?.style.objectPosition).toBe('center center');
    expect(movingFlag?.style.left).toBe('70px');
    expect(movingFlag?.style.top).toBe('90px');
    expect(movingFlag?.style.width).toBe('420px');
    expect(movingFlag?.style.height).toBe('420px');
    expect(movingFlag?.style.transform).toBe('none');
    expect(movingFlag?.style.transition).not.toContain('transform');
    expect(movingFlag?.style.transition).toContain('object-position');
    expect(SHARED_FLAG_MOVE_MS).toBe(200);
    act(() => vi.advanceTimersByTime(SHARED_FLAG_MOVE_MS + 20));
    expect(document.querySelector('.shared-flag-transition')).not.toBeInTheDocument();
    window.matchMedia = userMotion;
  });

  it('retires an active shared move before rapid navigation starts another', () => {
    vi.useFakeTimers();
    const userMotion = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 10, top: 20, width: 100, height: 80 } as DOMRect);
    render(
      <MemoryRouter initialEntries={['/ships/aegis/roles']}>
        <RapidFlagHarness />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Commander' }));
    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Executive officer' }));

    expect(document.querySelectorAll('.shared-flag-transition')).toHaveLength(1);
    window.matchMedia = userMotion;
  });

  it('crossfades a fleet-card flag into command-role selection without floating it', () => {
    vi.useFakeTimers();
    const userMotion = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    render(
      <MemoryRouter initialEntries={['/console']}>
        <RouteAwareFlagHarness to="/ships/aegis/roles" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(document.querySelector('.shared-flag-transition')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Flag /console' })).not.toHaveStyle({
      visibility: 'hidden',
    });
    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));
    expect(screen.getByRole('img', { name: 'Flag /ships/aegis/roles' })).toBeVisible();
    window.matchMedia = userMotion;
  });

  it.each(['/ships/aegis/roles/commander', '/ships/aegis/observer', '/ships/aegis'])(
    'moves the flag behind the console foreground when entering %s', (to) => {
      vi.useFakeTimers();
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ left: 10, top: 20, width: 100, height: 80 } as DOMRect);
      render(
        <MemoryRouter initialEntries={['/ships/aegis/roles']}>
          <RouteAwareFlagHarness to={to} />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Go' }));
      const clone = document.querySelector<HTMLImageElement>('.shared-flag-transition');
      // The picker panel must not cover its own moving flag.
      expect(clone).toHaveStyle({ zIndex: '20' });

      act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));
      // The routed foreground occupies layer 19. Its children cannot escape
      // that stacking context, even when the identity pane has z-index 21.
      expect(clone).toHaveStyle({ zIndex: '18' });
      act(() => vi.advanceTimersByTime(20));
      expect(clone).toHaveStyle({ zIndex: '18' });

      act(() => vi.advanceTimersByTime(SHARED_FLAG_MOVE_MS));
      expect(clone).not.toBeInTheDocument();
      expect(screen.getByRole('img', { name: `Flag ${to}` })).toBeVisible();
    },
  );

  it('keeps the flag behind the outgoing console before moving above the role picker', () => {
    vi.useFakeTimers();
    const userMotion = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 10, top: 20, width: 100, height: 80 } as DOMRect);
    render(
      <MemoryRouter initialEntries={['/ships/aegis/roles/commander']}>
        <RouteAwareFlagHarness to="/ships/aegis/roles" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    const clone = document.querySelector('.shared-flag-transition');
    expect(clone).toHaveStyle({ zIndex: '18' });
    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));
    expect(clone).toHaveStyle({ zIndex: '20' });
    act(() => vi.advanceTimersByTime(SHARED_FLAG_MOVE_MS + 20));
    expect(clone).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Flag /ships/aegis/roles' })).toBeVisible();
    window.matchMedia = userMotion;
  });
});
