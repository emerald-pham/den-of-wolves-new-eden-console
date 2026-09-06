import { expect, it } from 'vitest';
import {
  AMBIENT_CONTACT_MAX_INTERVAL_MS,
  AMBIENT_CONTACT_MIN_INTERVAL_MS,
  ambientContactIntervalMs,
  ambientDradisOccurrence,
} from './ambientDradisContact';

const session = {
  id: 'fleet-session',
  createdAt: '2026-01-01T00:00:00.000Z',
};

it('derives the same automatic vector and classification everywhere in the fleet', () => {
  const now = Date.parse(session.createdAt) + ambientContactIntervalMs(session.id, 1);

  expect(ambientDradisOccurrence(session, now)).toEqual(
    ambientDradisOccurrence(session, now),
  );
  expect(ambientDradisOccurrence(session, now)).toMatchObject({
    appearedAt: now,
    start: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
    destination: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
    classification: expect.any(String),
  });
});

it('keeps an automatic vector stable across small creation-clock differences', () => {
  const epoch = Date.parse(session.createdAt);
  const laterSnapshot = {
    ...session,
    createdAt: new Date(epoch + 3_000).toISOString(),
  };
  const firstAppearance = epoch + ambientContactIntervalMs(session.id, 1);
  const first = ambientDradisOccurrence(session, firstAppearance + 3_000);
  const later = ambientDradisOccurrence(
    laterSnapshot,
    firstAppearance + 3_000,
  );

  expect(later).toMatchObject({
    id: first?.id,
    start: first?.start,
    destination: first?.destination,
    classification: first?.classification,
  });
});

it('varies each fleetwide automatic interval between twenty and thirty minutes', () => {
  const intervals = Array.from({ length: 12 }, (_, index) =>
    ambientContactIntervalMs(session.id, index + 1));

  expect(intervals.every((interval) =>
    interval >= AMBIENT_CONTACT_MIN_INTERVAL_MS &&
    interval <= AMBIENT_CONTACT_MAX_INTERVAL_MS)).toBe(true);
  expect(new Set(intervals).size).toBeGreaterThan(1);
  expect(intervals).toEqual(intervals.map((_, index) =>
    ambientContactIntervalMs(session.id, index + 1)));
});

it('uses the shared manual trigger immediately and then returns to the automatic cadence', () => {
  const epoch = Date.parse(session.createdAt);
  const manualTriggeredAt = new Date(epoch + 5 * 60 * 1000).toISOString();
  const manual = { ...session, dradisContactTriggeredAt: manualTriggeredAt };

  expect(ambientDradisOccurrence(manual, Date.parse(manualTriggeredAt)))
    .toMatchObject({ appearedAt: Date.parse(manualTriggeredAt), source: 'manual' });
  expect(ambientDradisOccurrence(manual, epoch + 7 * 60 * 1000)).toBeNull();
  expect(ambientDradisOccurrence(
    manual,
    epoch + ambientContactIntervalMs(session.id, 1),
  ))
    .toMatchObject({ source: 'automatic' });
});
