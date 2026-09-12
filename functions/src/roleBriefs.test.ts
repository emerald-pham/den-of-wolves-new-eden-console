import { describe, expect, it } from 'vitest';
import {
  COMMON_ROLE_RULES,
  roleBriefFor,
  serializedRoleBrief,
} from './roleBriefs';

describe('role brief projection', () => {
  it('provides a private brief for every configured role', () => {
    const roleIds = [
      'admiral', 'executive-officer', 'wing-commander',
      'dione-captain', 'dione-engineer', 'dione-president',
      'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
      'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
      'quellon-captain', 'quellon-engineer', 'quellon-explorer',
      'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
      'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
      'capybara-captain', 'capybara-recycler', 'press-officer',
    ];

    for (const roleId of roleIds) {
      expect(roleBriefFor(roleId), roleId).toMatchObject({ roleId });
    }
  });

  it('serializes an allowlist record for the assigned UID only', () => {
    const record = serializedRoleBrief('s1', 'alice', 'admiral', 4);
    expect(record).toEqual(expect.objectContaining({
      type: 'role-brief',
      sessionId: 's1',
      assignmentUid: 'alice',
      visibleToUids: ['alice'],
      roleId: 'admiral',
      setupRevision: 4,
      commonRules: COMMON_ROLE_RULES,
      ownedCraftIds: [],
    }));
    expect(JSON.stringify(record)).not.toContain('wolf-agent');
    expect(serializedRoleBrief('s1', 'alice', 'unknown-role', 4)).toBeUndefined();
  });

  it('projects only the assigned role’s active craft', () => {
    const record = serializedRoleBrief('s1', 'alice', 'wing-commander', 4, {
      activeRoleIds: ['admiral', 'wing-commander'],
    });
    expect(record?.ownedCraftIds).toEqual([
      'starlight', 'fighter-wing-alpha', 'fighter-wing-bravo',
    ]);
    expect(record?.ownedCraftIds).not.toContain('pallas');
  });

  it('uses the authoritative Capybara common-rules variant when requested by setup', () => {
    const base = serializedRoleBrief('s1', 'alice', 'capybara-captain', 1);
    const expansion = serializedRoleBrief('s1', 'alice', 'capybara-captain', 1, {
      capybaraExpansion: true,
    });
    expect(base?.commonRules).not.toContain('d8');
    expect(expansion?.commonRules).toContain('d8');
    expect(expansion?.commonRules).toContain('Scrap');
  });
});
