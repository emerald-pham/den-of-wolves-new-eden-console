import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DioneMaliadesLaunchPanelView } from './DioneMaliadesLaunch';

const eligible = {
  type: 'dione-maliades-launch-view', sessionId: 's1', turn: 2,
  revision: 5, launched: false, eligible: true,
} as const;

it('keeps Maliades launch and pass as explicit independent choices', () => {
  const onLaunch = vi.fn();
  const onPass = vi.fn();
  render(<DioneMaliadesLaunchPanelView view={eligible} writable onLaunch={onLaunch} onPass={onPass} />);

  fireEvent.click(screen.getByRole('button', { name: 'Pass Maliades' }));
  expect(onPass).toHaveBeenCalledWith(eligible);
  expect(onLaunch).not.toHaveBeenCalled();
});

it('does not expose a pass after the source has committed its launch choice', () => {
  render(<DioneMaliadesLaunchPanelView view={{
    ...eligible, eligible: false, launched: false, choiceStatus: 'passed', reason: 'passed',
  }} writable onLaunch={vi.fn()} onPass={vi.fn()} />);

  expect(screen.getByText('Launch choice passed for this attack.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Pass Maliades' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Launch Maliades' })).toBeDisabled();
});
