export const AMBIENT_CONTACT_INTERVAL_MS = 20 * 60 * 1000;
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

export function ambientDradisOccurrence(
  session: AmbientDradisSession,
  now: number,
): AmbientDradisOccurrence | null {
  const epoch = validInstant(session.createdAt);
  if (epoch === null) return null;
  const manual = validInstant(session.dradisContactTriggeredAt);
  const manualActive = manual !== null && now >= manual && now < manual + AMBIENT_CONTACT_LIFETIME_MS;
  const cycle = Math.floor((now - epoch) / AMBIENT_CONTACT_INTERVAL_MS);
  const automatic = epoch + cycle * AMBIENT_CONTACT_INTERVAL_MS;
  const automaticActive = cycle >= 1 && now >= automatic &&
    now < automatic + AMBIENT_CONTACT_LIFETIME_MS;
  if (!manualActive && !automaticActive) return null;

  const appearedAt = manualActive && (!automaticActive || (manual ?? -Infinity) >= automatic)
    ? manual as number
    : automatic;
  const source = appearedAt === manual ? 'manual' : 'automatic';
  // Automatic contacts use their ordinal rather than the locally parsed
  // creation instant. That keeps their vector identical if two snapshots
  // represent the server timestamp a few milliseconds differently.
  const occurrenceKey = source === 'manual' ? String(appearedAt) : String(cycle);
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
  const completedCycles = Math.max(0, Math.floor((now - epoch) / AMBIENT_CONTACT_INTERVAL_MS));
  const automatic = epoch + (completedCycles + 1) * AMBIENT_CONTACT_INTERVAL_MS;
  const manual = validInstant(session.dradisContactTriggeredAt);
  return manual !== null && manual > now ? Math.min(manual, automatic) : automatic;
}
