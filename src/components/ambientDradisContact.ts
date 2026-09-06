export const AMBIENT_CONTACT_MIN_INTERVAL_MS = 20 * 60 * 1000;
export const AMBIENT_CONTACT_MAX_INTERVAL_MS = 30 * 60 * 1000;
export const AMBIENT_CONTACT_LIFETIME_MS = 2 * 60 * 1000;
export const AMBIENT_CLASSIFICATION_MS = 90 * 1000;

export interface AmbientDradisSession {
  readonly id: string;
  readonly createdAt: string;
  readonly dradisContactTriggeredAt?: string;
}

export interface AmbientVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AmbientDradisOccurrence {
  readonly id: string;
  readonly source: 'automatic' | 'manual';
  readonly appearedAt: number;
  readonly start: AmbientVector;
  readonly destination: AmbientVector;
  readonly classification: string;
}

const AMBIENT_CLASSIFICATIONS = [
  'Asteroid',
  'Rock',
  "Your Mom's Big Butt",
  'Emerald Nebula Interference',
  'Metallic Asteroid',
] as const;

export function ambientClassification(random: () => number = Math.random): string {
  const index = Math.min(
    AMBIENT_CLASSIFICATIONS.length - 1,
    Math.floor(random() * AMBIENT_CLASSIFICATIONS.length),
  );
  return AMBIENT_CLASSIFICATIONS[index] ?? AMBIENT_CLASSIFICATIONS[0];
}

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed: string): () => number {
  let value = hash(seed);
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

/** A stable per-occurrence cadence keeps the random schedule identical fleetwide. */
export function ambientContactIntervalMs(sessionId: string, occurrence: number): number {
  const random = seededRandom(`${sessionId}:automatic-interval:${occurrence}`);
  return Math.round(
    AMBIENT_CONTACT_MIN_INTERVAL_MS +
    random() * (AMBIENT_CONTACT_MAX_INTERVAL_MS - AMBIENT_CONTACT_MIN_INTERVAL_MS),
  );
}

function randomUnitVector(random: () => number): AmbientVector {
  const longitude = random() * Math.PI * 2;
  const z = random() * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: radius * Math.cos(longitude), y: radius * Math.sin(longitude), z };
}

function vectors(random: () => number): Pick<AmbientDradisOccurrence, 'start' | 'destination'> {
  const direction = randomUnitVector(random);
  const distance = 0.9 + random() * 0.08;
  const start = {
    x: direction.x * distance,
    y: direction.y * distance,
    z: direction.z * distance,
  };
  const sampled = randomUnitVector(random);
  const dot = direction.x * sampled.x + direction.y * sampled.y + direction.z * sampled.z;
  let tangent = {
    x: sampled.x - dot * direction.x,
    y: sampled.y - dot * direction.y,
    z: sampled.z - dot * direction.z,
  };
  let tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z);
  if (tangentLength < 1e-6) {
    tangent = Math.abs(direction.x) < 0.8
      ? { x: 0, y: direction.z, z: -direction.y }
      : { x: -direction.z, y: 0, z: direction.x };
    tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z);
  }
  const travel = 0.3 + random() * 0.2;
  const candidate = {
    x: start.x + tangent.x / tangentLength * travel,
    y: start.y + tangent.y / tangentLength * travel,
    z: start.z + tangent.z / tangentLength * travel,
  };
  const candidateLength = Math.hypot(candidate.x, candidate.y, candidate.z);
  return {
    start,
    destination: {
      x: candidate.x / candidateLength * distance,
      y: candidate.y / candidateLength * distance,
      z: candidate.z / candidateLength * distance,
    },
  };
}

function validInstant(value: string | undefined): number | null {
  if (!value) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

const automaticTimes = new Map<string, number[]>();

function automaticSchedule(sessionId: string, epoch: number, now: number): {
  readonly cycle: number;
  readonly appearedAt: number | null;
  readonly nextAt: number;
} {
  const cacheKey = `${sessionId}:${epoch}`;
  let times = automaticTimes.get(cacheKey);
  if (!times) {
    times = [epoch, epoch + ambientContactIntervalMs(sessionId, 1)];
    automaticTimes.set(cacheKey, times);
  }
  while ((times[times.length - 1] ?? Infinity) <= now) {
    const occurrence = times.length;
    times.push((times[times.length - 1] ?? epoch) +
      ambientContactIntervalMs(sessionId, occurrence));
  }

  let low = 1;
  let high = times.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((times[middle] ?? Infinity) <= now) low = middle + 1;
    else high = middle;
  }
  const cycle = low - 1;
  return {
    cycle,
    appearedAt: cycle >= 1 ? times[cycle] ?? null : null,
    nextAt: times[low] ?? epoch + ambientContactIntervalMs(sessionId, 1),
  };
}

export function ambientDradisOccurrence(
  session: AmbientDradisSession,
  now: number,
): AmbientDradisOccurrence | null {
  const epoch = validInstant(session.createdAt);
  if (epoch === null) return null;
  const manual = validInstant(session.dradisContactTriggeredAt);
  const manualActive = manual !== null && now >= manual && now < manual + AMBIENT_CONTACT_LIFETIME_MS;
  const schedule = automaticSchedule(session.id, epoch, now);
  const automatic = schedule.appearedAt;
  const automaticActive = automatic !== null && now < automatic + AMBIENT_CONTACT_LIFETIME_MS;
  if (!manualActive && !automaticActive) return null;

  const appearedAt = manualActive && (!automaticActive || (manual ?? -Infinity) >= (automatic ?? -Infinity))
    ? manual as number
    : automatic as number;
  const source = appearedAt === manual ? 'manual' : 'automatic';
  // Automatic contacts use their ordinal rather than the locally parsed
  // creation instant. That keeps their vector identical if two snapshots
  // represent the server timestamp a few milliseconds differently.
  const occurrenceKey = source === 'manual' ? String(appearedAt) : String(schedule.cycle);
  const random = seededRandom(`${session.id}:${source}:${occurrenceKey}`);
  return {
    id: `${source}-${occurrenceKey}`,
    source,
    appearedAt,
    ...vectors(random),
    classification: ambientClassification(random),
  };
}

export function nextAmbientDradisChange(session: AmbientDradisSession, now: number): number | null {
  const epoch = validInstant(session.createdAt);
  if (epoch === null) return null;
  const occurrence = ambientDradisOccurrence(session, now);
  if (occurrence) return occurrence.appearedAt + AMBIENT_CONTACT_LIFETIME_MS;
  const automatic = automaticSchedule(session.id, epoch, now).nextAt;
  const manual = validInstant(session.dradisContactTriggeredAt);
  return manual !== null && manual > now ? Math.min(manual, automatic) : automatic;
}
