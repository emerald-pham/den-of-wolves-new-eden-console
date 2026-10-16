/**
 * Server-owned role brief copy.
 *
 * These are short application briefs derived from the authorised semantic
 * source.  They intentionally contain role responsibilities and common table
 * rules only; hidden loyalty, facilitator guidance, and another player's
 * assignment never belong in this projection.
 */

import { ownedCraftIdsForRole } from './craftOwnership';
import { voyage33MotivationForRole } from './voyageArrival';

const COMMON_ROLE_RULES_BASE = [
  'Keep this brief private. Do not show, photograph, or read another player\'s brief.',
  'Each cycle has a Team Phase followed by a Coordination Phase. Work with your team during the first phase, then coordinate fleet movement and actions during the second.',
  'Your facilitator resolves Wolf attacks in this order: targeting, Long Range, Medium Range, Short Range, then Boarding. Follow the current vessel and shuttle sheets for exact actions.',
  'The fleet objective is to reach New Eden with as many survivors as possible. The facilitator and server-authoritative console state decide results; this brief never grants permission to change shared state.',
].join(' ');

/** Base-game copy retained as a named fixture for projection tests. */
export const COMMON_ROLE_RULES = COMMON_ROLE_RULES_BASE;
const COMMON_ROLE_RULES_CAPYBARA = `${COMMON_ROLE_RULES_BASE} In the Capybara expansion, Wolf targeting uses a d8: 7 targets Capybara and 8 is rerolled; Scrap is a Capybara-only resource used by its ship and shuttles.`;
const COMMON_ROLE_RULES_WOLF_COMMANDER = COMMON_ROLE_RULES_BASE.replace(
  ' The fleet objective is to reach New Eden with as many survivors as possible.',
  '',
);
const COMMON_ROLE_RULES_WOLF_COMMANDER_CAPYBARA = `${COMMON_ROLE_RULES_WOLF_COMMANDER} In the Capybara expansion, Wolf targeting uses a d8: 7 targets Capybara and 8 is rerolled; Scrap is a Capybara-only resource used by its ship and shuttles.`;
export const CAPYBARA_SHARED_OBJECTIVE =
  'Protect the Capybara and the S.A.N. survivors, make sure the S.A.N. is heard in fleet decisions, and do not let the Capybara be taken for granted.';

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
    text: 'Coordinate the AEGIS team and set its fleet-defence policy. Keep military assets maintained, support the President, and help the fleet exchange usable jump information. ICN objectives // Protect the fleet at any cost and uphold the Council Navy’s honour so it earns recognition.',
  },
  'executive-officer': {
    roleName: 'Executive Officer',
    vesselName: 'AEGIS',
    text: 'Run AEGIS maintenance and secure the resources it needs. Operate its weapons and Pallas during Wolf attacks, and coordinate defence with Refinery 124. ICN objectives // Protect the fleet at any cost and uphold the Council Navy’s honour so it earns recognition.',
  },
  'wing-commander': {
    roleName: 'Wing Commander',
    vesselName: 'AEGIS',
    text: 'Operate Fighter Wings Alpha and Bravo, scout with the Starlight, and join away missions. Coordinate scouting with the Scientist and Explorer and protect the fleet in combat. ICN objectives // Protect the fleet at any cost and uphold the Council Navy’s honour so it earns recognition.',
  },
  'dione-captain': {
    roleName: 'Captain',
    vesselName: 'Dione',
    text: 'Coordinate the Dione team, set ship policy, and liaise with other ships. Protect the Dione\'s large survivor population while securing the food and water the ship consumes. FAS objectives // Protect Dione and its survivors, and ensure the FAS has a voice in fleet decisions.',
  },
  'dione-engineer': {
    roleName: 'Engineer',
    vesselName: 'Dione',
    text: 'Run maintenance, gather supplies, transfer resources, and repair with the Philia. Use the Maliades in Wolf attacks and choose which Dione console must remain uncharged. FAS objectives // Protect Dione and its survivors, and ensure the FAS has a voice in fleet decisions.',
  },
  'dione-president': {
    roleName: 'President',
    vesselName: 'Dione',
    text: 'Lead the fleet, build agreements about fleet policy, and resolve political crises. Collaborate with the Admiral and captains; guide the fleet without micromanaging it.',
  },
  'icebreaker-captain': {
    roleName: 'Captain',
    vesselName: 'Icebreaker',
    text: 'Coordinate the Icebreaker team, set ship policy, and liaise with other ships. Use the ship\'s materials and strytium production to secure food, water, and repairs. C.P.A. objectives // Protect Icebreaker and its survivors, give the C.P.A. a voice in fleet decisions, and earn recognition for the ship.',
  },
  'icebreaker-engineer': {
    roleName: 'Engineer',
    vesselName: 'Icebreaker',
    text: 'Run maintenance and gather supplies. Use the Blacksmith to transfer resources and repair ships, and track demand for materials and strytium ore across the fleet. C.P.A. objectives // Protect Icebreaker and its survivors, give the C.P.A. a voice in fleet decisions, and earn recognition for the ship.',
  },
  'icebreaker-miner': {
    roleName: 'Miner',
    vesselName: 'Icebreaker',
    text: 'Produce materials and strytium ore with Highwall, help fight Wolf attacks, and represent the C.P.A. on away missions. Balance mining against the fleet\'s current demand. C.P.A. objectives // Protect Icebreaker and its survivors, give the C.P.A. a voice in fleet decisions, and earn recognition for the ship.',
  },
  'shepherd-captain': {
    roleName: 'Captain',
    vesselName: 'Shepherd',
    text: 'Coordinate the Shepherd team, set ship policy, and liaise with other ships. Use Shepherd\'s food production and Endeavour upgrades to secure water and repairs. Rosal objectives // Protect Shepherd and its survivors, preserve Rosal\'s voice in fleet decisions, and earn recognition for the ship.',
  },
  'shepherd-engineer': {
    roleName: 'Engineer',
    vesselName: 'Shepherd',
    text: 'Run maintenance, obtain water and supplies, distribute food, and use the Black Sheep to transfer resources or charge consoles. Keep the ship ready for the fleet. Rosal objectives // Protect Shepherd and its survivors, preserve Rosal\'s voice in fleet decisions, and earn recognition for the ship. Rosal seeks independence from FAS control.',
  },
  'shepherd-scientist': {
    roleName: 'Scientist',
    vesselName: 'Shepherd',
    text: 'Research console upgrades, use Endeavour\'s long-range sensors to scout, and represent Rosal on away missions. Identify shortages early so research arrives in time. Rosal objectives // Protect Shepherd and its survivors, preserve Rosal\'s voice in fleet decisions, and earn recognition for the ship.',
  },
  'quellon-captain': {
    roleName: 'Captain',
    vesselName: 'Quellon',
    text: 'Coordinate the Quellon team, set ship policy, and liaise with other ships. Trade Quellon\'s water production and Hummingbird scouting for food, repairs, and political consideration. Proxima objectives // Protect Quellon and its survivors, preserve Proxima\'s voice in fleet decisions, and earn recognition for the ship.',
  },
  'quellon-engineer': {
    roleName: 'Engineer',
    vesselName: 'Quellon',
    text: 'Run maintenance, gather and distribute water, and use the Condor to transfer resources or charge consoles. Keep Quellon supporting the fleet. Proxima objectives // Protect Quellon and its survivors, preserve Proxima\'s voice in fleet decisions, and earn recognition for the ship.',
  },
  'quellon-explorer': {
    roleName: 'Explorer',
    vesselName: 'Quellon',
    text: 'Scout with Hummingbird and represent Proxima on away missions. Coordinate with the Wing Commander and Scientist, verify reports when needed, and choose useful harvests for the fleet. Proxima objectives // Protect Quellon and its survivors, preserve Proxima\'s voice in fleet decisions, and earn recognition for the ship.',
  },
  'refinery-124-captain': {
    roleName: 'Captain',
    vesselName: 'Refinery 124',
    text: 'Coordinate Refinery 124, set ship policy, and liaise with other ships. Use the refinery\'s fuel production and military support to secure food, water, and repairs. Gliese objectives // Protect Refinery 124 and its survivors, preserve Gliese\'s voice in fleet decisions, and earn recognition for the refinery.',
  },
  'refinery-124-engineer': {
    roleName: 'Engineer',
    vesselName: 'Refinery 124',
    text: 'Run maintenance, gather ore, refine and distribute fuel, and use Chacau to transfer resources and repair ships. Track every ship\'s likely jump cost. Gliese objectives // Protect Refinery 124 and its survivors, preserve Gliese\'s voice in fleet decisions, and earn recognition for the refinery.',
  },
  'refinery-124-pdf-colonel': {
    roleName: 'P.D.F. Colonel',
    vesselName: 'Refinery 124',
    text: 'Defend the fleet with Refinery 124\'s fighter wing and Chepu, and contribute to away missions. Coordinate combat with AEGIS and relay useful messages outside attacks. Gliese objectives // Protect Refinery 124 and its survivors, preserve Gliese\'s voice in fleet decisions, and earn recognition for the refinery.',
  },
  'joint-engineering-quellon-refinery': {
    roleName: 'Quellon / Refinery Engineer',
    vesselName: 'Joint Engineering Union',
    text: 'Keep both assigned ships supplied and repaired. During Team Phase run maintenance, charge important consoles, and fuel their engineering shuttles; during Coordination Phase distribute supplies and triage repairs. Offer shuttle transfer or repair services for a charge when appropriate. Union objective // Protect ordinary survivors and workers when fleet leaders make decisions.',
  },
  'joint-engineering-shepherd-icebreaker': {
    roleName: 'Shepherd / Icebreaker Engineer',
    vesselName: 'Joint Engineering Union',
    text: 'Keep both assigned ships supplied and repaired. During Team Phase run maintenance, charge important consoles, and fuel their engineering shuttles; during Coordination Phase distribute supplies and triage repairs. Offer shuttle transfer or repair services for a charge when appropriate. Union objective // Protect ordinary survivors and workers when fleet leaders make decisions.',
  },
  'capybara-captain': {
    roleName: 'Capybara Captain',
    vesselName: 'S.A.N.S. Capybara',
    text: `Run Capybara maintenance, gather resources, liaise with other ships, and use the Macaw to repair the fleet. ${CAPYBARA_SHARED_OBJECTIVE}`,
  },
  'capybara-recycler': {
    roleName: 'Capybara Recycler',
    vesselName: 'S.A.N.S. Capybara',
    text: `Help supply the fleet and move resources where they are needed. Use the Boa to recycle resources into Scrap and assist on away missions. ${CAPYBARA_SHARED_OBJECTIVE}`,
  },
  'press-officer': {
    roleName: 'Press Officer',
    vesselName: 'SNN Press Shuttle',
    text: 'Report the fleet\'s public status from the SNN shuttle. Keep dispatches accurate and useful while respecting every player\'s private role and loyalty information.',
  },
  'wolf-commander': {
    roleName: 'Wolf Commander',
    vesselName: 'Wolf Armada',
    text: 'Goal // Prevent the fleet from escaping by spreading fear or confusion, damaging infrastructure or defences, or raising unrest. Command the Wolf armada hunting the fleet. During the targeting phase you may reroll each eligible targeting die once before AEGIS Command and Control. HOUSE RULE: Nonparticipating target results are rerolled into a participating target; keep the printed Capybara d8 face 8 reroll separate. HOUSE RULE: The optional +2 boarding request remains pending until the current live GM records the consequence for what happens if all Commander-led Wolf Boarding Parties are destroyed. No automatic consequence or default outcome is assumed.',
  },
  'comms-officer': {
    roleName: 'Comms Officer',
    vesselName: 'AEGIS',
    text: 'Scout one system within one jump of AEGIS each cycle. Keep the fleet current with the news and coordinate fleet secrets while protecting the privacy of every player\'s brief.',
  },
  'vip-host': {
    roleName: 'VIP Host',
    vesselName: 'Dione',
    text: 'When spending Team Time at a ship other than Dione, help that ship reroll one die during its maintenance cycle. Your social goal is to help everyone have a good time.',
  },
  commissar: {
    roleName: 'Commissar',
    vesselName: 'Icebreaker',
    text: 'Goals // Encourage AEGIS to make difficult decisions that move the fleet toward Eden and reduce the risk of riots. With the captain\'s agreement, purge survivors as if the ship had taken damage, then reduce unrest by 1; this ability is available once per ship per cycle. Use this choice carefully and only through the authoritative console.',
  },
  'rosal-militia-leader': {
    roleName: 'Rosal Militia Leader',
    vesselName: 'Shepherd',
    text: 'Political goals // Reduce FAS influence and advocate Rosal\'s freedom to decide its own future. During Boarding, defend on the ship where you are present. If Wolf boarding parties outnumber its Security Teams, roll up to two defence dice per Security Team. Whether or not they outnumber the teams, you may lead from the front and roll up to three extra defence dice; a front-line 1 kills you. The authoritative boarding result records losses.',
  },
  doctor: {
    roleName: 'Doctor',
    vesselName: 'Quellon',
    text: 'Objective // Preserve as many survivors as possible and reserve resources so more than one ship can receive care. After a Wolf Attack, choose one ship and halve its survivor casualties from damage at no food or water cost. Each additional ship costs 3 food and 3 water from that ship\'s storage; the facilitator records every authoritative result.',
  },
  'pdf-fighter-ace': {
    roleName: 'P.D.F. Fighter Ace',
    vesselName: 'Refinery 124',
    text: 'Defend the fleet with personal combat during Wolf attacks and pursue the goal of destroying a Wolf capital ship, specifically a cruiser or carrier. With the commander\'s permission, pilot one fighter from Alpha, Bravo, or Refinery 124\'s P.D.F. wing. Choose Long range: roll 3 dice against one target, dealing 1 damage for each 3 or higher; if the target survives, your fighter is destroyed and you die. Alternatively, at Medium range deal 1 damage to an enemy and optionally change its targeting die by +1 or -1, wrapping 0 to Refinery 124 and 7 to AEGIS. At Short range deal 1 damage, with an optional second damage to the same or another enemy; taking the second damage destroys your fighter, and you survive in an escape pod. Use only the authoritative Fighter Ace controls.',
  },
  'gorgoneion-captain': {
    roleName: 'Gorgoneion Captain',
    vesselName: 'I.C.S.S. Gorgoneion',
    text: 'Defend the fleet and contribute to away missions using Gorgoneion\'s offensive, defensive, repair, and mission-support systems. Protect the fleet at any cost and uphold the Interstellar Council Navy\'s honour so it earns recognition.',
  },
  'capybara-small-captain': {
    roleName: 'Capybara Captain // base small ship',
    vesselName: 'S.A.N.S. Capybara',
    text: 'Supply and transfer food, water, and materials and assist on away missions. Protect the Capybara and S.A.N. survivors, make sure the S.A.N. has a voice in fleet decisions, and earn recognition for the ship. This brief applies to the base small ship, not the Capybara expansion.',
  },
  'warrior-captain': {
    roleName: 'Warrior Captain',
    vesselName: 'RSS Warrior',
    text: 'Supply materials and repair damaged ships through Wolf-attack salvage and away missions. Protect the Warrior and Rosal survivors, preserve Rosal\'s voice, and do not let the Warrior be taken for granted.',
  },
  'vulcan-captain': {
    roleName: 'Vulcan Captain',
    vesselName: 'Vulcan',
    text: 'Care for and rehabilitate prisoners, identify useful work for them, and manage its risks. Protect the Vulcan and Proxima survivors, preserve Proxima\'s voice, and do not let the Vulcan be taken for granted.',
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
  /** Source-defined Voyage 33-0 motivation, present only for entitled roles. */
  readonly voyage33Motivation?: string;
}

export function serializedRoleBrief(
  sessionId: string,
  assignmentUid: string,
  roleId: string,
  setupRevision: number,
  options: {
    readonly capybaraExpansion?: boolean;
    readonly activeRoleIds?: readonly string[];
    readonly voyage33Admitted?: boolean;
  } = {},
): SerializedRoleBrief | undefined {
  const content = roleBriefFor(roleId);
  if (!content) return undefined;
  const activeRoleIds = options.activeRoleIds ?? [roleId];
  const voyage33Motivation = voyage33MotivationForRole(roleId, options.voyage33Admitted === true);
  return {
    type: 'role-brief',
    sessionId,
    assignmentUid,
    visibleToUids: [assignmentUid],
    ...content,
    commonRules: roleId === 'wolf-commander'
      ? options.capybaraExpansion === true
        ? COMMON_ROLE_RULES_WOLF_COMMANDER_CAPYBARA
        : COMMON_ROLE_RULES_WOLF_COMMANDER
      : options.capybaraExpansion === true
        ? COMMON_ROLE_RULES_CAPYBARA
        : COMMON_ROLE_RULES_BASE,
    ownedCraftIds: ownedCraftIdsForRole(roleId, activeRoleIds),
    setupRevision,
    ...(voyage33Motivation === undefined ? {} : { voyage33Motivation }),
  };
}
