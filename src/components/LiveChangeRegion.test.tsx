import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import LiveChangeRegion from './LiveChangeRegion';

it('keeps a hydrated status quiet until its event identity changes', () => {
  const view = render(
    <LiveChangeRegion as="p" changeKey="threshold:tracked" message="TRACKED // 2 OF 10" />,
  );
  const region = view.container.querySelector('[role="status"]')!;

  expect(region).toHaveTextContent('TRACKED // 2 OF 10');
  expect(region).toHaveAttribute('aria-live', 'off');

  view.rerender(
    <LiveChangeRegion as="p" changeKey="threshold:tracked" message="TRACKED // 2 OF 10" />,
  );
  expect(region).toHaveAttribute('aria-live', 'off');

  view.rerender(
    <LiveChangeRegion as="p" changeKey="threshold:critical" message="CRITICAL // WOLF FORCES CLOSING" />,
  );
  expect(region).toHaveTextContent('CRITICAL // WOLF FORCES CLOSING');
  expect(region).toHaveAttribute('aria-live', 'polite');
});

it('announces a real mounted event and clears it when the event leaves', () => {
  const view = render(
    <LiveChangeRegion
      as="p"
      changeKey="turn:s1:2:1"
      message="Fleet transmission for Cycle 2."
      politeness="assertive"
      announceInitial
    />,
  );
  const region = view.container.querySelector('[role="status"]')!;

  expect(region).toHaveTextContent('Fleet transmission for Cycle 2.');
  expect(region).toHaveAttribute('aria-live', 'assertive');

  view.rerender(
    <LiveChangeRegion
      as="p"
      changeKey={null}
      message=""
      politeness="assertive"
      announceInitial
    />,
  );
  expect(region).toHaveTextContent('');
  expect(region).toHaveAttribute('aria-live', 'off');
});
