import { expect, it } from 'vitest';
import {
  AMBIENT_CONTACT_INTERVAL_MS,
  ambientDradisOccurrence,
} from './ambientDradisContact';

const session = {
  id: 'fleet-session',
  createdAt: '2026-01-01T00:00:00.000Z',
};

it('derives the same automatic vector and classification everywhere in the fleet', () => {
  const now = Date.parse(session.createdAt) + AMBIENT_CONTACT_INTERVAL_MS;

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
  const first = ambientDradisOccurrence(session, epoch + AMBIENT_CONTACT_INTERVAL_MS + 3_000);
  const later = ambientDradisOccurrence(
    laterSnapshot,
    epoch + AMBIENT_CONTACT_INTERVAL_MS + 3_000,
  );

  expect(later).toMatchObject({
    id: first?.id,
    start: first?.start,
    destination: first?.destination,
    classification: first?.classification,
  });
});

it('uses the shared manual trigger immediately and then returns to the automatic cadence', () => {
  const epoch = Date.parse(session.createdAt);
  const manualTriggeredAt = new Date(epoch + 5 * 60 * 1000).toISOString();
  const manual = { ...session, dradisContactTriggeredAt: manualTriggeredAt };

  expect(ambientDradisOccurrence(manual, Date.parse(manualTriggeredAt)))
    .toMatchObject({ appearedAt: Date.parse(manualTriggeredAt), source: 'manual' });
  expect(ambientDradisOccurrence(manual, epoch + 7 * 60 * 1000)).toBeNull();
  expect(ambientDradisOccurrence(manual, epoch + AMBIENT_CONTACT_INTERVAL_MS))
    .toMatchObject({ source: 'automatic' });
});
