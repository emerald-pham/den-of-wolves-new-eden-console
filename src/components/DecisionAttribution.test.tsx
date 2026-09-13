import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import DecisionAttribution from './DecisionAttribution';

it('shows authoritative source, actor, and time when the projection supplies them', () => {
  render(
    <DecisionAttribution
      source="Printed facilitator reference"
      actorUid="gm-1"
      recordedAt="2026-01-01T00:00:00.000Z"
    />,
  );

  const attribution = screen.getByRole('region', { name: 'Decision attribution' });
  expect(attribution).toHaveTextContent('Decision source // Printed facilitator reference');
  expect(attribution).toHaveTextContent('Decision actor // facilitator // gm-1');
  expect(attribution.querySelector('time')).toHaveAttribute('dateTime', '2026-01-01T00:00:00.000Z');
});

it('states withheld identity and unavailable time without inventing metadata', () => {
  render(
    <DecisionAttribution
      source="Facilitator reference"
      actorVisibility="withheld"
    />,
  );

  const attribution = screen.getByRole('region', { name: 'Decision attribution' });
  expect(attribution).toHaveTextContent('Decision actor // facilitator identity withheld');
  expect(attribution).toHaveTextContent('Decision time // unavailable in this projection');
  expect(attribution).not.toHaveTextContent('gm-1');
});
