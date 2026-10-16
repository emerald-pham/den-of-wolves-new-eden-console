import { describe, expect, it } from 'vitest';
import { CONSOLE_ROLES } from '@/data/roles';
import * as names from './demoActorDisplayName';

describe('ordinary server-compatible demo persona labels', () => {
  it('keeps every supported printed station distinct under the ordinary forty-character name limit', () => {
    expect(typeof names.demoActorDisplayName).toBe('function');
    const labels = CONSOLE_ROLES.map(role => names.demoActorDisplayName(role.id));
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label.startsWith('DEMO // ')).toBe(true);
      expect(label.length).toBeLessThanOrEqual(40);
      expect(label).not.toBe('Player');
    }
  });

  it('distinguishes the two actual Union anchors without changing ordinary core or Press labels', () => {
    expect(typeof names.demoActorDisplayName).toBe('function');
    expect(names.demoActorDisplayName('joint-engineering-quellon-refinery')).toBe('DEMO // Union Quellon/Refinery');
    expect(names.demoActorDisplayName('joint-engineering-shepherd-icebreaker')).toBe('DEMO // Union Shepherd/Icebreaker');
    for (const role of CONSOLE_ROLES.filter(role => role.shipId !== 'joint-engineering-union'))
      expect(names.demoActorDisplayName(role.id)).toBe(`DEMO // ${role.id}`);
  });
});
