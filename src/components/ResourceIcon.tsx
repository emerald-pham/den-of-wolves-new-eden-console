import type { ResourceId } from '@/data/resources';

export type CounterIconId = ResourceId | 'unrest';

const PATHS: Readonly<Record<CounterIconId, readonly string[]>> = {
  ore: ['M4 8l4-4h8l4 4-3 11H7L4 8Z', 'm8 0-2 4 4 3 4-3-2-4Z'],
  fuel: ['m13 2-8 12h6l-1 8 9-13h-6V2Z'],
  food: ['M4 12h16', 'M6 12c0 5 3 8 6 8s6-3 6-8', 'M9 9c0-3 2-5 5-5 0 3-2 5-5 5Z'],
  water: ['M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z', 'M9 16c.7 1.3 1.7 2 3 2'],
  materials: ['M14 6 5 15l4 4 9-9', 'm13 2 2 4 4 2 3-3-3-3-4 1Z'],
  securityTeams: ['M12 2 20 5v6c0 5-3 9-8 11-5-2-8-6-8-11V5l8-3Z', 'm8.5 12 2.2 2.2 4.8-5'],
  scrap: ['m8 5 3-3 3 3', 'M11 2v7', 'm16 19-3 3-3-3', 'M13 22v-7', 'm3 10-1 4 4 1', 'm2 14 6-3'],
  unrest: ['M4 20v-2c0-3 2-5 5-5h6c3 0 5 2 5 5v2', 'M8 7a4 4 0 1 0 8 0', 'M12 3v4l2 2'],
};

export default function ResourceIcon({ id, label }: { id: CounterIconId; label: string }) {
  return (
    <svg
      className="resource-icon"
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${label} icon`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {PATHS[id].map((path) => <path d={path} key={path} />)}
    </svg>
  );
}
