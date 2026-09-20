import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PursuitTracker from './PursuitTracker';

it('tracks only the current ship and reads pursuit depth from the galactic map', () => {
  render(
    <PursuitTracker
      currentTurn={4}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="8378"
      pursuitDistance={6}
      pursuitValue={4}
    />,
  );

  const tracker = screen.getByRole('region', { name: 'Pursuit tracker' });
  expect(tracker).not.toHaveTextContent('Relative to Shepherd // 8378');
  expect(tracker).toHaveTextContent('Current track // 4 / 10');
  expect(tracker).toHaveTextContent('Distance from Home Systems // -6 pursuit distance');
  expect(tracker).not.toHaveTextContent('Map depth //');
  expect(tracker).not.toHaveTextContent('Map depth is shared; position is ship-local.');
  expect(tracker).not.toHaveTextContent('Dione');
});

it('keeps the authoritative group score when cycle and ship position change', () => {
  const { rerender } = render(
    <PursuitTracker
      currentTurn={4}
      shipId="dione"
      shipName="Dione"
      shipCoordinate="5143"
      pursuitDistance={1}
      pursuitValue={7}
    />,
  );

  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).toHaveTextContent('Current track // 7 / 10');
  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).not.toHaveTextContent('Cycle load');

  rerender(
    <PursuitTracker
      currentTurn={9}
      shipId="dione"
      shipName="Dione"
      shipCoordinate="5143"
      pursuitDistance={1}
      pursuitValue={7}
    />,
  );

  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).toHaveTextContent('Current track // 7 / 10');
  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).not.toHaveTextContent('Cycle load');

  rerender(
    <PursuitTracker
      currentTurn={4}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="8378"
      pursuitDistance={6}
      pursuitValue={7}
    />,
  );

  expect(screen.getByRole('region', { name: 'Pursuit tracker' })).toHaveTextContent('Current track // 7 / 10');
});

it('keeps the wolf pursuit countdown visible at the lower end of the cycle', () => {
  render(
    <PursuitTracker
      currentTurn={1}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="0000"
      pursuitDistance={0}
      pursuitValue={2}
    />,
  );

  const tracker = screen.getByRole('region', { name: 'Pursuit tracker' });
  expect(tracker).toHaveAttribute('data-threat-level', 'tracked');
  expect(tracker).toHaveTextContent('WOLF PURSUIT TRACK // 8 cycles');
  expect(tracker).not.toHaveTextContent('COUNTDOWN TO FAILURE');
  expect(tracker.querySelector('[aria-live="polite"]')).toHaveTextContent('8 cycles');
  expect(tracker.querySelector('[role="progressbar"]')).toHaveAttribute(
    'aria-valuetext',
    '2 of 10; 8 cycles to failure',
  );
});

it('calls the full Wolf Pursuit countdown ten cycles', () => {
  render(
    <PursuitTracker
      currentTurn={0}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="0000"
      pursuitDistance={0}
    />,
  );

  const tracker = screen.getByRole('region', { name: 'Pursuit tracker' });
  expect(tracker).toHaveTextContent('WOLF PURSUIT TRACK // Awaiting server telemetry');
  expect(tracker.querySelector('[role="progressbar"]')).toHaveAttribute(
    'aria-valuetext',
    'Awaiting authoritative pursuit value',
  );
  expect(tracker).not.toHaveTextContent('GAME OVER');
});

it('escalates the apocalyptic threat treatment through closing, critical, and terminal states', () => {
  const { rerender } = render(
    <PursuitTracker
      currentTurn={4}
      shipId="dione"
      shipName="Dione"
      shipCoordinate="5143"
      pursuitDistance={1}
      pursuitValue={7}
    />,
  );

  const tracker = screen.getByRole('region', { name: 'Pursuit tracker' });
  expect(tracker).toHaveAttribute('data-threat-level', 'closing');
  expect(tracker).toHaveTextContent('WOLF PURSUIT TRACK // 3 cycles');

  rerender(
    <PursuitTracker
      currentTurn={4}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="0000"
      pursuitDistance={0}
      pursuitValue={8}
    />,
  );
  expect(tracker).toHaveAttribute('data-threat-level', 'critical');
  expect(tracker).toHaveTextContent('WOLF PURSUIT TRACK // 2 cycles');

  rerender(
    <PursuitTracker
      currentTurn={5}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="0000"
      pursuitDistance={0}
      pursuitValue={10}
    />,
  );
  expect(tracker).toHaveAttribute('data-threat-level', 'terminal');
  expect(tracker).toHaveTextContent('WOLF PURSUIT TRACK // 0 cycles');
  expect(tracker).toHaveTextContent('SURROUNDED // GAME OVER');
});

it('announces threshold severity changes once while keeping hydrated state quiet', () => {
  const { rerender } = render(
    <PursuitTracker
      currentTurn={4}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="0000"
      pursuitDistance={0}
      pursuitValue={8}
    />,
  );

  const status = document.querySelector('.pursuit-tracker__status')!;
  expect(status).toHaveTextContent('CRITICAL // WOLF FORCES CLOSING');
  expect(status).toHaveAttribute('aria-live', 'off');

  rerender(
    <PursuitTracker
      currentTurn={5}
      shipId="shepherd"
      shipName="Shepherd"
      shipCoordinate="0000"
      pursuitDistance={0}
      pursuitValue={10}
    />,
  );
  expect(status).toHaveTextContent('SURROUNDED // GAME OVER');
  expect(status).toHaveAttribute('aria-live', 'polite');
});
