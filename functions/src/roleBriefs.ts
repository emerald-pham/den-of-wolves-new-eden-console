/**
 * Server-owned role brief copy.
 *
 * These are short application briefs derived from the authorised semantic
 * source.  They intentionally contain role responsibilities and common table
 * rules only; hidden loyalty, facilitator guidance, and another player's
 * assignment never belong in this projection.
 */

import { ownedCraftIdsForRole } from './craftOwnership';

const COMMON_ROLE_RULES_BASE = [
  'Keep this brief private. Do not show, photograph, or read another player\'s brief.',
  'Each turn has a Team Phase followed by a Coordination Phase. Work with your team during the first phase, then coordinate fleet movement and actions during the second.',
  'Your facilitator resolves Wolf attacks in this order: targeting, Long Range, Medium Range, Short Range, then Boarding. Follow the current vessel and shuttle sheets for exact actions.',
  'The fleet objective is to reach New Eden with as many survivors as possible. The facilitator and server-authoritative console state decide results; this brief never grants permission to change shared state.',
].join(' ');

/** Base-game copy retained as a named fixture for projection tests. */
export const COMMON_ROLE_RULES = COMMON_ROLE_RULES_BASE;
const COMMON_ROLE_RULES_CAPYBARA = `${COMMON_ROLE_RULES_BASE} In the Capybara expansion, Wolf targeting uses a d8: 7 targets Capybara and 8 is rerolled; Scrap is a Capybara-only resource used by its ship and shuttles.`;

export interface RoleBriefContent {
  readonly roleId: string;
  readonly roleName: string;
  readonly vesselName: string;
  readonly text: string;
}

const ROLE_BRIEFS: Readonly<Record<string, Omit<RoleBriefContent, 'roleId'>>> = {
  admiral: {
    roleName: 'Admiral',
    vesselName: 'AEGIS',
    text: 'Coordinate the AEGIS team and set its fleet-defence policy. Keep military assets maintained, support the President, and help the fleet exchange usable jump information.',
  },
  'executive-officer': {
    roleName: 'Executive Officer',
    vesselName: 'AEGIS',
    text: 'Run AEGIS maintenance and secure the resources it needs. Operate its weapons and Pallas during Wolf attacks, and coordinate defence with Refinery 124.',
  },
  'wing-commander': {
    roleName: 'Wing Commander',
    vesselName: 'AEGIS',
    text: 'Operate Fighter Wings Alpha and Bravo, scout with the Starlight, and join away missions. Coordinate scouting with the Scientist and Explorer and protect the fleet in combat.',
  },
  'dione-captain': {
    roleName: 'Captain',
    vesselName: 'Dione',
    text: 'Coordinate the Dione team, set ship policy, and liaise with other ships. Protect the Dione\'s large survivor population while securing the food and water the ship consumes.',
  },
  'dione-engineer': {
    roleName: 'Engineer',
    vesselName: 'Dione',
    text: 'Run maintenance, gather supplies, transfer resources, and repair with the Philia. Use the Maliades in Wolf attacks and choose which Dione console must remain uncharged.',
  },
  'dione-president': {
    roleName: 'President',
    vesselName: 'Dione',
    text: 'Lead the fleet, build agreements about fleet policy, and resolve political crises. Collaborate with the Admiral and captains; guide the fleet without micromanaging it.',
  },
  'icebreaker-captain': {
    roleName: 'Captain',
    vesselName: 'Icebreaker',
    text: 'Coordinate the Icebreaker team, set ship policy, and liaise with other ships. Use the ship\'s materials and strytium production to secure food, water, and repairs.',
  },
  'icebreaker-engineer': {
    roleName: 'Engineer',
    vesselName: 'Icebreaker',
    text: 'Run maintenance and gather supplies. Use the Blacksmith to transfer resources and repair ships, and track demand for materials and strytium ore across the fleet.',
  },
  'icebreaker-miner': {
    roleName: 'Miner',
    vesselName: 'Icebreaker',
    text: 'Produce materials and strytium ore with Highwall, help fight Wolf attacks, and represent the C.P.A. on away missions. Balance mining against the fleet\'s current demand.',
  },
  'shepherd-captain': {
    roleName: 'Captain',
    vesselName: 'Shepherd',
    text: 'Coordinate the Shepherd team, set ship policy, and liaise with other ships. Use Shepherd\'s food production and Endeavour upgrades to secure water and repairs.',
  },
  'shepherd-engineer': {
    roleName: 'Engineer',
    vesselName: 'Shepherd',
    text: 'Run maintenance, obtain water and supplies, distribute food, and use the Black Sheep to transfer resources or charge consoles. Keep the ship ready for the fleet.',
  },
  'shepherd-scientist': {
    roleName: 'Scientist',
    vesselName: 'Shepherd',
    text: 'Research console upgrades, use Endeavour\'s long-range sensors to scout, and represent Rosal on away missions. Identify shortages early so research arrives in time.',
  },
  'quellon-captain': {
    roleName: 'Captain',
    vesselName: 'Quellon',
    text: 'Coordinate the Quellon team, set ship policy, and liaise with other ships. Trade Quellon\'s water production and Hummingbird scouting for food, repairs, and political consideration.',
  },
  'quellon-engineer': {
    roleName: 'Engineer',
    vesselName: 'Quellon',
    text: 'Run maintenance, gather and distribute water, and use the Condor to transfer resources or charge consoles. Keep Quellon supporting the fleet.',
  },
  'quellon-explorer': {
    roleName: 'Explorer',
    vesselName: 'Quellon',
    text: 'Scout with Hummingbird and represent Proxima on away missions. Coordinate with the Wing Commander and Scientist, verify reports when needed, and choose useful harvests for the fleet.',
  },
  'refinery-124-captain': {
    roleName: 'Captain',
    vesselName: 'Refinery 124',
    text: 'Coordinate Refinery 124, set ship policy, and liaise with other ships. Use the refinery\'s fuel production and military support to secure food, water, and repairs.',
  },
  'refinery-124-engineer': {
    roleName: 'Engineer',
    vesselName: 'Refinery 124',
    text: 'Run maintenance, gather ore, refine and distribute fuel, and use Chacau to transfer resources and repair ships. Track every ship\'s likely jump cost.',
  },
  'refinery-124-pdf-colonel': {
    roleName: 'P.D.F. Colonel',
    vesselName: 'Refinery 124',
    text: 'Defend the fleet with Refinery 124\'s fighter wing and Chepu, and contribute to away missions. Coordinate combat with AEGIS and relay useful messages outside attacks.',
  },
  'joint-engineering-quellon-refinery': {
    roleName: 'Quellon / Refinery Engineer',
    vesselName: 'Joint Engineering Union',
    text: 'Keep both assigned ships supplied and repaired. During Team Phase run maintenance and charge important consoles; during Coordination Phase distribute supplies and triage repairs with the engineering shuttle.',
  },
  'joint-engineering-shepherd-icebreaker': {
    roleName: 'Shepherd / Icebreaker Engineer',
    vesselName: 'Joint Engineering Union',
    text: 'Keep both assigned ships supplied and repaired. During Team Phase run maintenance and charge important consoles; during Coordination Phase distribute supplies and triage repairs with the engineering shuttle.',
  },
  'capybara-captain': {
    roleName: 'Capybara Captain',
    vesselName: 'S.A.N.S. Capybara',
    text: 'Run Capybara maintenance, gather resources, liaise with other ships, and use the Macaw to repair the fleet. Protect the Capybara and the S.A.N. survivors.',
  },
  'capybara-recycler': {
    roleName: 'Capybara Recycler',
    vesselName: 'S.A.N.S. Capybara',
    text: 'Help supply the fleet and move resources where they are needed. Use the Boa to recycle resources into scrap, assist on away missions, and protect the Capybara team.',
  },
  'press-officer': {
    roleName: 'Press Officer',
    vesselName: 'SNN Press Shuttle',
    text: 'Report the fleet\'s public status from the SNN shuttle. Keep dispatches accurate and useful while respecting every player\'s private role and loyalty information.',
  },
};

export function roleBriefFor(roleId: string): RoleBriefContent | undefined {
  const content = ROLE_BRIEFS[roleId];
  return content ? { roleId, ...content } : undefined;
}

export interface SerializedRoleBrief {
  readonly type: 'role-brief';
  readonly sessionId: string;
  readonly assignmentUid: string;
  readonly visibleToUids: readonly [string];
  readonly roleId: string;
  readonly roleName: string;
  readonly vesselName: string;
  readonly text: string;
  readonly commonRules: string;
  /** Only the craft owned by this printed role enter the private projection. */
  readonly ownedCraftIds: readonly string[];
  readonly setupRevision: number;
}

export function serializedRoleBrief(
  sessionId: string,
  assignmentUid: string,
  roleId: string,
  setupRevision: number,
  options: {
    readonly capybaraExpansion?: boolean;
    readonly activeRoleIds?: readonly string[];
  } = {},
): SerializedRoleBrief | undefined {
  const content = roleBriefFor(roleId);
  if (!content) return undefined;
  const activeRoleIds = options.activeRoleIds ?? [roleId];
  return {
    type: 'role-brief',
    sessionId,
    assignmentUid,
    visibleToUids: [assignmentUid],
    ...content,
    commonRules: options.capybaraExpansion === true
      ? COMMON_ROLE_RULES_CAPYBARA
      : COMMON_ROLE_RULES_BASE,
    ownedCraftIds: ownedCraftIdsForRole(roleId, activeRoleIds),
    setupRevision,
  };
}
