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
    expect(screen.getByText('screen /first')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SCREEN_FADE_MS);
    });

    expect(screen.getByText('screen /second')).toBeInTheDocument();
    expect(fade()).toHaveAttribute('data-phase', 'in');
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

  it('moves a ship flag between screens over two tenths of a second', () => {
    vi.useFakeTimers();
    const userMotion = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 10, top: 20, width: 100, height: 80 } as DOMRect);
    render(
      <MemoryRouter initialEntries={['/ships/aegis/roles']}>
        <FlagHarness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    act(() => vi.advanceTimersByTime(SCREEN_FADE_MS));

    const movingFlag = document.querySelector<HTMLImageElement>('.shared-flag-transition');
    expect(movingFlag).toBeInTheDocument();
    expect(movingFlag?.parentElement?.classList.contains('screen-fade')).toBe(true);
    expect(movingFlag?.style.objectPosition).toBe('left center');

    act(() => vi.advanceTimersByTime(20));
    expect(movingFlag?.style.objectPosition).toBe('center center');
    expect(movingFlag?.style.transition).toContain('object-position');
    expect(SHARED_FLAG_MOVE_MS).toBe(200);
    act(() => vi.advanceTimersByTime(SHARED_FLAG_MOVE_MS + 20));
    expect(document.querySelector('.shared-flag-transition')).not.toBeInTheDocument();
    window.matchMedia = userMotion;
  });
});
