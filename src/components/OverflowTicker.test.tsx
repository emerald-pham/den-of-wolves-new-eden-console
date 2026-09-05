import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OverflowTicker from './OverflowTicker';

let viewportWidth = 120;
let copyWidth = 180;
let notifyResize: (() => void) | undefined;

class TestResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    notifyResize = () => callback([], this as unknown as ResizeObserver);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('aria-label') === 'Civil Unrest' ? viewportWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('overflow-ticker__copy') ? copyWidth : 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  viewportWidth = 120;
  copyWidth = 180;
  notifyResize = undefined;
});

it('ticks only while its text is wider than the available space', () => {
  render(<OverflowTicker text="Civil Unrest" />);

  const ticker = screen.getByLabelText('Civil Unrest');
  expect(ticker).toHaveAttribute('data-overflow', 'true');
  expect(screen.getAllByText('Civil Unrest')).toHaveLength(2);

  viewportWidth = 220;
  act(() => notifyResize?.());

  expect(ticker).toHaveAttribute('data-overflow', 'false');
  expect(screen.getAllByText('Civil Unrest')).toHaveLength(1);
});
