import { APP_VERSION } from './version';

export interface ChangelogEntry {
  readonly version: string;
  readonly changes: readonly string[];
  /** Prompt IDs whose player-facing changes are described by this release. */
  readonly implementationPrompts?: readonly (number | string)[];
  /** Reproducible implementation-plan progress at this release boundary. */
  readonly implementationProgress?: {
    readonly completed: number;
    readonly total: number;
    readonly percentage: string;
    readonly done: number;
    readonly partial: number;
    readonly active: number;
    readonly missing: number;
  };
}

/** Release notes written for the people playing and facilitating the game. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: APP_VERSION,
    implementationPrompts: [613, '589a'],
    implementationProgress: {
      completed: 281, total: 751, percentage: '37.42%',
      done: 281, partial: 24, active: 0, missing: 446,
    },
    changes: [
      'A delayed reconnect response from an old session no longer disconnects you from a newer session.',
      'Motion-safety acknowledgement renews after 24 hours even when the console stays open. Closing a dialog restores keyboard focus to the control you were using.',
      '281 of 751 planned items are complete (37.42%).',
    ],
  },
  {
    version: '0.4.14',
    implementationProgress: {
      completed: 278, total: 751, percentage: '37.02%',
      done: 278, partial: 24, active: 0, missing: 449,
    },
    changes: [
      'Fleet broadcasts now keep Press, Aegis alerts, Stand Down, and current ATC status moving through the same readable ticker without dropping visible text or overlapping messages.',
      'Stand Down plays twice, then the latest eligible Press news resumes, including with reduced motion.',
      '278 of 751 planned items are complete (37.02%).',
    ],
  },
  {
    version: '0.4.13',
    implementationProgress: {
      completed: 278, total: 751, percentage: '37.02%',
      done: 278, partial: 24, active: 0, missing: 449,
    },
    changes: [
      'ATC now says only Airspace Closed or Airspace Open. Cycle information stays on the pursuit tracker.',
      '278 of 751 planned items are complete (37.02%).',
    ],
  },
  {
    version: '0.4.12',
    implementationPrompts: [624],
    implementationProgress: {
      completed: 278, total: 751, percentage: '37.02%',
      done: 278, partial: 24, active: 0, missing: 449,
    },
    changes: [
      'The console keeps your saved session and queued commands while a new app shell waits for you to apply it. Applying and reloading are separate deliberate actions, so an update does not interrupt an active session.',
      '278 of 751 planned items are complete (37.02%).',
    ],
  },
  {
    version: '0.4.11',
    implementationPrompts: [612],
    implementationProgress: {
      completed: 277, total: 751, percentage: '36.88%',
      done: 277, partial: 24, active: 0, missing: 450,
    },
    changes: [
      'Saved sessions now show a clear reconnecting or offline marker while preserving the last usable view, and the marker no longer overlaps role selection on small screens.',
      '277 of 751 planned items are complete (36.88%).',
    ],
  },
  {
    version: '0.4.10',
    implementationPrompts: [638],
    implementationProgress: {
      completed: 276, total: 751, percentage: '36.75%',
      done: 276, partial: 25, active: 0, missing: 450,
    },
    changes: [
      'The game clock now uses Cycle throughout the console. ATC starts with Airspace Closed in Cycle 0 and shows the current open or closed status without outdated announcements returning.',
      'The ticker stays visible when replacing an old announcement in reduced motion. Reconnecting also preserves your seat when an older session needs its seat records repaired.',
      '276 of 751 planned items are complete (36.75%).',
    ],
  },
  {
    version: '0.4.9',
    implementationPrompts: [633],
    implementationProgress: {
      completed: 275, total: 751, percentage: '36.62%',
      done: 275, partial: 25, active: 0, missing: 451,
    },
    changes: [
      'If too many join attempts temporarily pause access, the console shows how long to wait. Connection errors give clearer guidance without automatically repeating your action.',
      '275 of 751 planned items are complete (36.62%).',
    ],
  },
  {
    version: '0.4.8',
    implementationProgress: {
      completed: 274, total: 751, percentage: '36.48%',
      done: 274, partial: 25, active: 0, missing: 452,
    },
    changes: [
      'The fleet ticker stays visible from joining at Cycle 0, including while scrolling and between broadcasts. ATC returns when the news ends, and new Press reports no longer get stuck behind ATC.',
      '274 of 751 planned items are complete (36.48%).',
    ],
  },
  {
    version: '0.4.7',
    implementationProgress: {
      completed: 274, total: 751, percentage: '36.48%',
      done: 274, partial: 25, active: 0, missing: 452,
    },
    changes: [
      'Air Traffic Control broadcasts appear as soon as you join at Cycle 0, before any news is published. Existing Cycle 0 sessions recover the missing dispatch automatically.',
      '274 of 751 planned items are complete (36.48%).',
    ],
  },
  {
    version: '0.4.6',
    implementationProgress: {
      completed: 274, total: 751, percentage: '36.48%',
      done: 274, partial: 24, active: 0, missing: 453,
    },
    changes: [
      'News stays visible while fonts load and returns after an alert ends. Dismissing newer news restores earlier active dispatches.',
      '274 of 751 planned items are complete (36.48%).',
    ],
  },
  {
    version: '0.4.5',
    implementationPrompts: ['594'],
    implementationProgress: {
      completed: 273,
      total: 751,
      percentage: '36.35%',
      done: 273,
      partial: 24,
      active: 0,
      missing: 454,
    },
    changes: [
      'Facilitator decisions now show their source, actor record, and recorded time wherever that metadata is available to the viewer.',
      'Private player rulings keep hidden actor identities private, while replacement decisions clearly mark unavailable actor and time metadata.',
      '273 of 751 planned items are complete (36.35%).',
    ],
  },
  {
    version: '0.4.4',
    implementationPrompts: ['609'],
    implementationProgress: {
      completed: 273,
      total: 751,
      percentage: '36.35%',
      done: 273,
      partial: 23,
      active: 0,
      missing: 455,
    },
    changes: [
      'Live updates now announce new phase, attack, parking, threshold, denial, and ending changes once without repeating the same listener snapshot.',
      '273 of 751 planned items are complete (36.35%).',
    ],
  },
  {
    version: '0.4.1',
    implementationPrompts: ['535'],
    implementationProgress: {
      completed: 272,
      total: 751,
      percentage: '36.22%',
      done: 272,
      partial: 21,
      active: 0,
      missing: 458,
    },
    changes: [
      'Facilitators can privately record the President’s response and their chosen consequence for Civil Unrest, linked to the teams’ current grievances.',
      '272 of 751 planned items are complete (36.22%).',
    ],
  },
  {
    version: '0.4.0',
    implementationPrompts: ['533', '534'],
    implementationProgress: {
      completed: 268,
      total: 751,
      percentage: '35.69%',
      done: 268,
      partial: 21,
      active: 0,
      missing: 462,
    },
    changes: [
      'Facilitators can privately record how they respond to religious zealotry, with saved decisions kept separate from later crises.',
      'Affected teams can write Civil Unrest grievances for their team and facilitators or share them publicly with the table.',
      '268 of 751 planned items are complete (35.69%).',
    ],
  },
  {
    version: '0.3.105',
    implementationPrompts: ['611a'],
    implementationProgress: {
      completed: 264,
      total: 751,
      percentage: '35.15%',
      done: 264,
      partial: 21,
      active: 0,
      missing: 466,
    },
    changes: [
      'Console access status now matches the CIC readout style and wraps cleanly on narrow screens.',
      '264 of 751 planned items are complete (35.15%).',
    ],
  },
  {
    version: '0.3.104',
    implementationPrompts: ['602a'],
    implementationProgress: {
      completed: 263,
      total: 751,
      percentage: '35.02%',
      done: 263,
      partial: 21,
      active: 0,
      missing: 467,
    },
    changes: [
      'Shuttle return controls lead to your owning console or safely return to role selection if that ship is unavailable, while preserving your role and queued actions.',
      '263 of 751 planned items are complete (35.02%).',
    ],
  },
  {
    version: '0.3.103',
    implementationPrompts: [530],
    implementationProgress: {
      completed: 262,
      total: 751,
      percentage: '34.89%',
      done: 262,
      partial: 21,
      active: 0,
      missing: 468,
    },
    changes: [
      'Facilitators can deliver outbreak reports naming affected ships, reported work restrictions, and escalation risks while keeping their notes private.',
      '262 of 751 planned items are complete (34.89%).',
    ],
  },
  {
    version: '0.3.102',
    implementationPrompts: [674],
    implementationProgress: {
      completed: 261,
      total: 751,
      percentage: '34.75%',
      done: 261,
      partial: 21,
      active: 0,
      missing: 469,
    },
    changes: [
      'GM ship viewing is now quiet and read only by default, without claiming a player Observer role or changing player console ownership.',
      'A two-step red confirmation grants server-authorized write access only to the selected ship and active GM browser instance, and leaving or changing ships revokes it.',
      '261 of 751 planned items are complete (34.75%).',
    ],
  },
  {
    version: '0.3.101',
    implementationPrompts: [406],
    implementationProgress: {
      completed: 260,
      total: 751,
      percentage: '34.62%',
      done: 260,
      partial: 21,
      active: 0,
      missing: 470,
    },
    changes: [
      'Players can privately discard one owned away-mission card before assignment, with overlapping mission hands kept separate.',
      'Facilitators can open the discard phase and see readiness without seeing player card identities or contents.',
      '260 of 751 planned items are complete (34.62%).',
    ],
  },
  {
    version: '0.3.100',
    implementationPrompts: [526, 527, 532, 536],
    implementationProgress: {
      completed: 259,
      total: 751,
      percentage: '34.49%',
      done: 259,
      partial: 21,
      active: 0,
      missing: 471,
    },
    changes: [
      'Players can read delivered scouting, Religious Zealotry and election introductions after reconnecting. Facilitator notes and secret loyalties remain private.',
      'Religious Zealotry also supports the alternate Wolf Cult setup.',
      'Election introductions make clear that voting procedures still need facilitator decisions.',
      '259 of 751 planned items are complete (34.49%).',
    ],
  },
  {
    version: '0.3.99',
    implementationPrompts: [628],
    implementationProgress: {
      completed: 256,
      total: 751,
      percentage: '34.09%',
      done: 256,
      partial: 21,
      active: 0,
      missing: 474,
    },
    changes: [
      'GM ship-console write access now follows the active GM browser instance, selected ship, and a revocable private grant.',
      'Observer mode stays read only until the server confirms the scoped write grant, including after reconnects and stale-instance cleanup.',
      '256 of 751 planned items are complete (34.09%).',
    ],
  },
  {
    version: '0.3.97',
    implementationPrompts: [668, 671],
    implementationProgress: {
      completed: 247,
      total: 751,
      percentage: '32.89%',
      done: 247,
      partial: 21,
      active: 0,
      missing: 483,
    },
    changes: [
      'Privacy and write-mode controls now look and behave like the other fleet buttons, with clear selected states.',
      'GM and settings actions use consistent focus and button styles, with larger census-save targets.',
      '247 of 751 planned items are complete (32.89%).',
    ],
  },
  {
    version: '0.3.96',
    implementationPrompts: [655],
    implementationProgress: {
      completed: 245,
      total: 751,
      percentage: '32.62%',
      done: 245,
      partial: 21,
      active: 0,
      missing: 485,
    },
    changes: [
      'The Press shredder clearly warns that shredded evidence also enters docked ship cockpits, with readable mobile controls.',
      'Reconnecting after firing the Press shredder no longer repeats the same firing request.',
      '245 of 751 planned items are complete (32.62%).',
    ],
  },
  {
    version: '0.3.95',
    implementationPrompts: [653, 598],
    implementationProgress: {
      completed: 241,
      total: 751,
      percentage: '32.09%',
      done: 241,
      partial: 21,
      active: 0,
      missing: 489,
    },
    changes: [
      'Ship controls no longer wait for fleet-wide Iris authentication; each action still follows its own permissions and game rules.',
      'Connected crews awaiting Iris authentication now see an accurate connection label, and obsolete console-lock notices disappear.',
      '241 of 751 planned items are complete (32.09%).',
    ],
  },
  {
    version: '0.3.94',
    implementationPrompts: [675],
    implementationProgress: {
      completed: 235,
      total: 751,
      percentage: '31.29%',
      done: 235,
      partial: 25,
      active: 0,
      missing: 491,
    },
    changes: [
      'Fleet clocks pause when everyone disconnects and continue from the remaining time when someone returns.',
      'Deliberate emergency pauses still require the GM to resume them.',
      '235 of 751 planned items are complete (31.29%).',
    ],
  },
  {
    version: '0.3.93',
    implementationPrompts: [673],
    implementationProgress: {
      completed: 234,
      total: 751,
      percentage: '31.16%',
      done: 234,
      partial: 25,
      active: 0,
      missing: 492,
    },
    changes: [
      'Ship jump maps now show the familiar galactic compass beside your navigation readout.',
      '234 of 751 planned items are complete (31.16%).',
    ],
  },
  {
    version: '0.3.92',
    implementationPrompts: [525],
    implementationProgress: {
      completed: 232,
      total: 751,
      percentage: '30.89%',
      done: 232,
      partial: 26,
      active: 0,
      missing: 493,
    },
    changes: [
      'Facilitators can move a crisis through its full lifecycle from the GM console, with private notes and durable audit history.',
      'Players receive safe crisis summaries after delivery without facilitator-only notes.',
      '232 of 751 planned items are complete (30.89%).',
    ],
  },
  {
    version: '0.3.91',
    implementationPrompts: [523],
    implementationProgress: {
      completed: 231,
      total: 751,
      percentage: '30.76%',
      done: 231,
      partial: 26,
      active: 0,
      missing: 494,
    },
    changes: [
      'Facilitators can record durable rule calls with the question, source, decision, and audience.',
      'Selected players can read their private facilitator ruling in the role brief.',
      '231 of 751 planned items are complete (30.76%).',
    ],
  },
  {
    version: '0.3.90',
    implementationPrompts: [676],
    implementationProgress: {
      completed: 231,
      total: 751,
      percentage: '30.76%',
      done: 231,
      partial: 25,
      active: 0,
      missing: 495,
    },
    changes: [
      'The ship navigation map’s moving scanline now passes behind markers and labels, keeping them clear.',
      '231 of 751 planned items are complete (30.76%).',
    ],
  },
  {
    version: '0.3.89',
    implementationPrompts: [681],
    implementationProgress: {
      completed: 229,
      total: 751,
      percentage: '30.49%',
      done: 229,
      partial: 25,
      active: 0,
      missing: 497,
    },
    changes: [
      'The GM map recovers its full coordinates after switching into GM mode. Ships keep their own knowledge limits, and old GM maps no longer reappear from saved browser data.',
      '229 of 751 planned items are complete (30.49%).',
    ],
  },
  {
    version: '0.3.88',
    implementationPrompts: [518],
    implementationProgress: {
      completed: 228,
      total: 750,
      percentage: '30.40%',
      done: 228,
      partial: 25,
      active: 0,
      missing: 497,
    },
    changes: [
      'Captains can approve a Commissar purge. The Commissar can then apply the population loss and lower unrest, once per ship per cycle.',
      '228 of 750 planned items are complete (30.40%).',
    ],
  },
  {
    version: '0.3.87',
    implementationPrompts: [512],
    implementationProgress: {
      completed: 227,
      total: 750,
      percentage: '30.27%',
      done: 227,
      partial: 25,
      active: 0,
      missing: 498,
    },
    changes: [
      'The GM can deliver private Wolf Cult intelligence to its current holder; changing either Wolf identity clears outdated information.',
      'Private Wolf intelligence and Arbour visions can arrive while the recipient is already connected, without a reload.',
      '227 of 750 planned items are complete (30.27%).',
    ],
  },
  {
    version: '0.3.86',
    implementationPrompts: [511],
    implementationProgress: {
      completed: 225,
      total: 750,
      percentage: '30.00%',
      done: 225,
      partial: 25,
      active: 0,
      missing: 500,
    },
    changes: [
      'The GM can send private visions to Universal Arbour members, who can read the current call in their role briefing.',
      '225 of 750 planned items are complete (30.00%).',
    ],
  },
  {
    version: '0.3.85',
    implementationPrompts: [510],
    implementationProgress: {
      completed: 224,
      total: 750,
      percentage: '29.87%',
      done: 224,
      partial: 25,
      active: 0,
      missing: 501,
    },
    changes: [
      'Friends can privately identify their partner’s role, including replacement roles, without exposing account identifiers.',
      '224 of 750 planned items are complete (29.87%).',
    ],
  },
  {
    version: '0.3.84',
    implementationPrompts: [509],
    implementationProgress: {
      completed: 223,
      total: 750,
      percentage: '29.73%',
      done: 223,
      partial: 25,
      active: 0,
      missing: 502,
    },
    changes: [
      'The Android can choose to reveal their non-Wolf proof to the session from their private loyalty card.',
      '223 of 750 planned items are complete (29.73%).',
    ],
  },
  {
    version: '0.3.83',
    implementationPrompts: [663],
    implementationProgress: {
      completed: 222,
      total: 750,
      percentage: '29.60%',
      done: 222,
      partial: 25,
      active: 0,
      missing: 503,
    },
    changes: [
      'The AEGIS Admiral can now find the Fleetwide Red Alert command across phone, landscape, and desktop console layouts.',
      'The alert command keeps its confirmation lock, keyboard access, readable guidance, and existing authority safeguards.',
      '222 of 750 planned items are complete (29.60%).',
    ],
  },
  {
    version: '0.3.82',
    implementationPrompts: [390, 248, 658],
    implementationProgress: {
      completed: 221,
      total: 750,
      percentage: '29.47%',
      done: 221,
      partial: 25,
      active: 0,
      missing: 504,
    },
    changes: [
      'Hummingbird’s Explorer can harvest during Coordination, choosing which of two dice supplies food and which supplies water to the shuttle.',
      'Vulcan’s Captain can use each charged Additional Labour console to help operate an eligible console on another ship.',
      'Seat confirmation now uses CIC language.',
      '221 of 750 planned items are complete (29.47%).',
    ],
  },
  {
    version: '0.3.81',
    implementationPrompts: [657],
    implementationProgress: {
      completed: 218,
      total: 750,
      percentage: '29.07%',
      done: 218,
      partial: 25,
      active: 0,
      missing: 507,
    },
    changes: [
      'Release history now uses clearer language while preserving past progress figures.',
      '218 of 750 planned items are complete (29.07%).',
    ],
  },
  {
    version: '0.3.80',
    implementationPrompts: [313, 337],
    implementationProgress: {
      completed: 217,
      total: 750,
      percentage: '28.93%',
      done: 217,
      partial: 25,
      active: 0,
      missing: 508,
    },
    changes: [
      'Each ship keeps its discovered-system history through setup changes and reconnects, with private navigation cleared when your role changes.',
      'Operational player lists are limited to your current fleet group, while authorized GMs retain the full roster.',
      '217 of 750 planned items are complete (28.93%).',
    ],
  },
  {
    version: '0.3.79',
    implementationPrompts: [245],
    implementationProgress: {
      completed: 217,
      total: 750,
      percentage: '28.93%',
      done: 217,
      partial: 23,
      active: 0,
      missing: 510,
    },
    changes: [
      'The Warrior Captain’s private briefing explains when Salvage Drones would be used and plainly says attack damage tracking and salvage rolls are not available yet.',
      '217 of 750 planned items are complete (28.93%).',
    ],
  },
  {
    version: '0.3.78',
    implementationPrompts: [361],
    implementationProgress: {
      completed: 216,
      total: 750,
      percentage: '28.80%',
      done: 216,
      partial: 23,
      active: 0,
      missing: 511,
    },
    changes: [
      'Shuttle and fighter-wing starting manifests now keep each enabled craft tied to its printed owner, mode, and authoritative host, while moved dockings survive setup edits and reconnects.',
      'Union craft with an unresolved initial docking stay disabled until the GM records an explicit current host.',
      '216 of 750 planned items are complete (28.80%).',
    ],
  },
  {
    version: '0.3.77',
    implementationPrompts: [190, '241e'],
    implementationProgress: {
      completed: 215,
      total: 750,
      percentage: '28.67%',
      done: 215,
      partial: 22,
      active: 0,
      missing: 513,
    },
    changes: [
      'Dione’s charged VIP Lounge can draw a private named card that its owner may keep or transfer during Coordination.',
      'Capybara’s charged Fuel Processor converts up to five ore into fuel in its docked host’s stores.',
      '215 of 750 planned items are complete (28.67%).',
    ],
  },
  {
    version: '0.3.76',
    implementationPrompts: ['241d'],
    implementationProgress: {
      completed: 213,
      total: 750,
      percentage: '28.40%',
      done: 213,
      partial: 22,
      active: 0,
      missing: 515,
    },
    changes: [
      'Base Capybara can use its charged Water Reclimator to add four water, or Hydroponics to convert one water into four food, in its docked host’s stores.',
      '213 of 750 planned items are complete (28.40%).',
    ],
  },
  {
    version: '0.3.75',
    implementationPrompts: ['435', '618a'],
    implementationProgress: {
      completed: 212,
      total: 750,
      percentage: '28.27%',
      done: 212,
      partial: 20,
      active: 0,
      missing: 518,
    },
    changes: [
      'The Wolf Commander can privately review targeting dice and reroll each eligible die once before AEGIS Command and Control.',
      'The GM console automatically recovers interrupted manifest updates and clears its connection error when fresh data returns.',
      '212 of 750 planned items are complete (28.27%).',
    ],
  },
  {
    version: '0.3.74',
    implementationPrompts: ['178'],
    implementationProgress: {
      completed: 208,
      total: 749,
      percentage: '27.77%',
      done: 208,
      partial: 19,
      active: 0,
      missing: 522,
    },
    changes: [
      'The Wing Commander can spend one material to build one fighter using a charged Construction Bay, up to the wing’s current capacity.',
      '208 of 749 planned items are complete (27.77%).',
    ],
  },
  {
    version: '0.3.73',
    implementationPrompts: ['284', '515'],
    implementationProgress: {
      completed: 206,
      total: 749,
      percentage: '27.50%',
      done: 206,
      partial: 19,
      active: 0,
      missing: 524,
    },
    changes: [
      'Player maps now receive only their own ship’s known locations; GMs retain the full organiser view.',
      'GMs can assign replacement roles with private briefs while safely releasing the player’s previous station and access.',
      '206 of 749 planned items are complete (27.50%).',
    ],
  },
  {
    version: '0.3.72',
    implementationPrompts: ['652c', '282a'],
    implementationProgress: {
      completed: 204,
      total: 749,
      percentage: '27.24%',
      done: 204,
      partial: 19,
      active: 0,
      missing: 526,
    },
    changes: [
      'The fleet ticker stays visible on small screens, with no Hide or Reveal button.',
      'GMs can choose and lock star chart A, B, or C before starting while keeping roster setup editable.',
      '204 of 749 planned items are complete (27.24%).',
    ],
  },
  {
    version: '0.3.71',
    implementationPrompts: ['432', '140d', '314', '286'],
    implementationProgress: {
      completed: 200,
      total: 747,
      percentage: '26.77%',
      done: 200,
      partial: 19,
      active: 0,
      missing: 528,
    },
    changes: [
      'GMs can declare a prepared Wolf attack once all craft have confirmed parking, with private targeting and a fleet announcement.',
      'Destroyed full-size ships leave active navigation while their escape-pod capacity, survivors, and retained craft remain recorded.',
      'Fleet membership now stays consistent when players join, return, or are removed, including in older sessions.',
      '200 of 747 planned items are complete (26.77%).',
    ],
  },
  {
    version: '0.3.70',
    implementationPrompts: ['427', '257', '273'],
    implementationProgress: {
      completed: 199,
      total: 747,
      percentage: '26.64%',
      done: 199,
      partial: 16,
      active: 0,
      missing: 532,
    },
    changes: [
      'GMs can privately prepare Wolf attack drafts together, including ship choices, targets, and notes.',
      'Capybara can run its Scrap Refinery. PDF fighter-wing and Wobbly references now describe their own operating rules.',
      '199 of 747 planned items are complete (26.64%).',
    ],
  },
  {
    version: '0.3.69',
    implementationPrompts: ['403', '282', '275'],
    implementationProgress: {
      completed: 191,
      total: 747,
      percentage: '25.57%',
      done: 191,
      partial: 14,
      active: 0,
      missing: 542,
    },
    changes: [
      'Mission setup now supports private starting cards for selected participants.',
      'The GM star map follows the session chart. Chacau and Ally correctly describe fuelled second-ship repairs, and AEGIS fighter-wing references use each wing’s own capacity and combat details.',
      '191 of 747 planned items are complete (25.57%).',
    ],
  },
  {
    version: '0.3.68',
    implementationPrompts: ['255', '256'],
    implementationProgress: {
      completed: 182,
      total: 747,
      percentage: '24.36%',
      done: 182,
      partial: 10,
      active: 0,
      missing: 555,
    },
    changes: [
      'Capybara crews can now run Advanced Hydroponics and Water Production with optional Scrap boosts, protected by the same charge, damage, upgrade, retry, and authority rules as the rest of maintenance. 182 of 747 planned items are complete (24.36%).',
    ],
  },
  {
    version: '0.3.67',
    implementationPrompts: ['167'],
    implementationProgress: {
      completed: 180,
      total: 747,
      percentage: '24.10%',
      done: 180,
      partial: 10,
      active: 0,
      missing: 557,
    },
    changes: [
      'Vessel-console actions now return one traceable result with the acting role, vessel, cycle, revision, retry identity, and audit reference, so a reconnect or retry preserves the same authoritative outcome. 180 of 747 planned items are complete (24.10%).',
    ],
  },
  {
    version: '0.3.66',
    implementationPrompts: ['266'],
    implementationProgress: {
      completed: 179,
      total: 747,
      percentage: '23.96%',
      done: 179,
      partial: 10,
      active: 0,
      missing: 558,
    },
    changes: [
      'The Blacksmith shuttle console now correctly describes its fuelled second-ship procedure as repair-only. The registration catalog also records the Black Sheep and Hummingbird evidence as complete. 179 of 747 planned items are complete (23.96%).',
    ],
  },
  {
    version: '0.3.65',
    implementationPrompts: ['263'],
    implementationProgress: {
      completed: 175, total: 747, percentage: '23.43%',
      done: 175, partial: 10, active: 0, missing: 562,
    },
    changes: [
      'The Philia shuttle console now shows its security-team cargo, permission-gated dismantling, and fuelled repair procedures for the Dione Engineer. 175 of 747 planned items are complete (23.43%).',
    ],
  },
  {
    version: '0.3.64',
    implementationPrompts: ['589b'],
    implementationProgress: {
      completed: 174,
      total: 747,
      percentage: '23.29%',
      done: 174,
      partial: 10,
      active: 0,
      missing: 563,
    },
    changes: [
      'The session code of conduct now gives a shorter, clearer reminder to treat fellow players with care. 174 of 747 planned items are complete (23.29%).',
    ],
  },
  {
    version: '0.3.63',
    implementationPrompts: ['264'],
    implementationProgress: {
      completed: 173,
      total: 747,
      percentage: '23.16%',
      done: 173,
      partial: 10,
      active: 0,
      missing: 564,
    },
    changes: [
      'The Maliades console now records its printed damage, repair, target-shift, and attack procedures and returns crew to the Dione Engineer console through a shared keyboard-accessible link. 173 of 747 planned items are complete (23.16%).',
    ],
  },
  {
    version: '0.3.62',
    implementationPrompts: ['252'],
    implementationProgress: {
      completed: 169,
      total: 747,
      percentage: '22.62%',
      done: 169,
      partial: 7,
      active: 0,
      missing: 571,
    },
    changes: [
      'Fleet screens now respect the saved base or expansion roster everywhere, so the full Capybara appears only in the 19- and 20-player expansion setup. 169 of 747 planned items are complete (22.62%).',
    ],
  },
  {
    version: '0.3.61',
    implementationPrompts: ['402'],
    implementationProgress: {
      completed: 168,
      total: 747,
      percentage: '22.49%',
      done: 168,
      partial: 7,
      active: 0,
      missing: 572,
    },
    changes: [
      'The away-mission foundation now keeps one 33-card mission deck on the server, using the printed card values and a private persisted order. 168 of 747 planned items are complete (22.49%).',
    ],
  },
  {
    version: '0.3.60',
    implementationPrompts: ['234a'],
    implementationProgress: {
      completed: 167,
      total: 747,
      percentage: '22.36%',
      done: 167,
      partial: 7,
      active: 0,
      missing: 573,
    },
    changes: [
      'Facilitators now see a reminder to consider roughly 3 additional Wolf damage capacity per attack for each extra role. The facilitator chooses the adjustment. 167 of 747 planned items are complete (22.36%).',
    ],
  },
  {
    version: '0.3.59',
    implementationPrompts: ['188', '189'],
    implementationProgress: {
      completed: 162,
      total: 747,
      percentage: '21.69%',
      done: 162,
      partial: 7,
      active: 0,
      missing: 578,
    },
    changes: [
      'Dione engineers can now resolve charged Hydroponics during maintenance, with live stores, upgrade yields, and an explicit skip choice under server authority.',
      'Dione engineers can now resolve charged Water Reclamation during maintenance with order-safe resource authority and recoverable skip choices. 162 of 747 planned items are complete (21.69%).',
    ],
  },
  {
    version: '0.3.58',
    implementationPrompts: ['234'],
    implementationProgress: {
      completed: 160,
      total: 747,
      percentage: '21.42%',
      done: 160,
      partial: 7,
      active: 0,
      missing: 580,
    },
    changes: [
      'Facilitators can now dock Gorgoneion, base Capybara, Warrior, and Vulcan with an active fleet host and run their four-step Team maintenance using the host ship’s food and water. The console keeps each small ship’s population and reactor capacity separate, shows when authoritative state is unavailable, and keeps expansion Capybara on its full-ship rules. 160 of 747 planned items are complete (21.42%).',
    ],
  },
  {
    version: '0.3.57',
    implementationPrompts: ['522'],
    implementationProgress: {
      completed: 159,
      total: 747,
      percentage: '21.29%',
      done: 159,
      partial: 7,
      active: 0,
      missing: 581,
    },
    changes: [
      'Facilitators can now run both printed responsibilities from one authorized GM session, while optional GMs can share or hand off lanes. Stale GM browser sessions expire independently without removing a live sibling. 159 of 747 planned items are complete (21.29%).',
    ],
  },
  {
    version: '0.3.56',
    implementationPrompts: ['275b'],
    implementationProgress: {
      completed: 158,
      total: 747,
      percentage: '21.15%',
      done: 158,
      partial: 7,
      active: 0,
      missing: 582,
    },
    changes: [
      'The SNN Press Officer Dispatch Desk is restored and usable during Cycle 0, so its claimed operator can publish and retire fleet dispatches while stale, duplicate, disabled, and unauthorized actions remain blocked. 158 of 747 planned items are complete (21.15%).',
    ],
  },
  {
    version: '0.3.55',
    implementationPrompts: ['122a'],
    implementationProgress: {
      "completed": 153,
      "total": 747,
      "percentage": "20.48%",
      "done": 153,
      "partial": 7,
      "active": 0,
      "missing": 587
    },
    changes: ["Reactor power-up now asks for confirmation and shows which consoles will be charged and which unused charges will be lost. You can cancel without changing anything. 153 of 747 planned items are complete (20.48%)."],
  },
  {
    version: '0.3.54',
    implementationPrompts: ['656'],
    implementationProgress: {
      completed: 135,
      total: 747,
      percentage: '18.07%',
      done: 135,
      partial: 7,
      active: 0,
      missing: 605,
    },
    changes: [
      'Returning players now go straight back to their current session after a refresh or reconnect, while a temporary connection problem keeps their recovery path available. The launcher will not create or join over an existing session, and a clear link returns to the last recognized station. 135 of 747 planned items are complete (18.07%).',
    ],
  },
  {
    version: '0.3.53',
    implementationPrompts: ['114'],
    implementationProgress: {
      completed: 134,
      total: 747,
      percentage: '17.94%',
      done: 134,
      partial: 7,
      active: 0,
      missing: 606,
    },
    changes: [
      'Maintenance screens now follow each active full vessel’s printed sequence: AEGIS handles Shuttle Bay Zeta and Shuttle Bay Omega as separate steps, while the other ships finish their six-step lane before closing the cycle. 134 of 747 planned items are complete (17.94%).',
    ],
  },
  {
    version: '0.3.52',
    implementationPrompts: ['652b'],
    implementationProgress: {
      completed: 134,
      total: 747,
      percentage: '17.94%',
      done: 134,
      partial: 6,
      active: 0,
      missing: 607,
    },
    changes: [
      'On phones, fleet broadcasts now stay pinned while you scroll, can be hidden and revealed with an accessible control, and automatically reappear for urgent Admiral or airspace notices before folding away after the latest notice. Wide screens keep the ticker visible, while reduced-motion screens keep one readable announcement surface. 134 of 747 planned items are complete (17.94%).',
    ],
  },
  {
    version: '0.3.51',
    implementationPrompts: ['111'],
    implementationProgress: {
      completed: 131,
      total: 747,
      percentage: '17.54%',
      done: 131,
      partial: 6,
      active: 0,
      missing: 610,
    },
    changes: [
      'Fleet resource ledgers now keep ore, fuel, food, water, materials, security teams, and expansion Scrap as whole, nonnegative values, so malformed or boundary updates cannot restore stock or make it disappear unexpectedly. 131 of 747 planned items are complete (17.54%).',
    ],
  },
  {
    version: '0.3.50',
    implementationPrompts: ['652a'],
    implementationProgress: {
      completed: 130,
      total: 747,
      percentage: '17.40%',
      done: 130,
      partial: 6,
      active: 0,
      missing: 611,
    },
    changes: [
      'Fleet broadcasts now keep every moving glyph visible through its painted exit, including after a resize or font update, while repeating copy extends smoothly across a wider frame without overlap. Reduced-motion screens keep one readable announcement surface. 130 of 747 planned items are complete (17.40%).',
    ],
  },
  {
    version: '0.3.49',
    implementationPrompts: ['652'],
    implementationProgress: {
      completed: 128,
      total: 747,
      percentage: '17.14%',
      done: 128,
      partial: 6,
      active: 0,
      missing: 613,
    },
    changes: [
      'Fleet broadcasts now keep each queued message on its own measured lane, so rapid updates do not duplicate or overlap moving copy while urgent notices retain their priority. Reduced-motion screens keep one readable announcement surface. 128 of 747 planned items are complete (17.14%).',
    ],
  },
  {
    version: '0.3.48',
    implementationPrompts: ['106c'],
    implementationProgress: {
      completed: 125,
      total: 747,
      percentage: '16.73%',
      done: 125,
      partial: 6,
      active: 0,
      missing: 616,
    },
    changes: [
      'Fleet broadcasts now keep automatic, Admiral, and Press transmissions in one shared server order, so urgent notices preempt lower-priority copy safely while every screen receives the same queue and visible tails finish at a steady speed. Red Alert stand-downs use a shared 60-second server window, and reconnects cannot resurrect dismissed or expired notices. 125 of 747 planned items are complete (16.73%).',
    ],
  },
  {
    version: '0.3.47',
    implementationPrompts: ['680'],
    implementationProgress: {
      completed: 124,
      total: 747,
      percentage: '16.60%',
      done: 124,
      partial: 6,
      active: 0,
      missing: 617,
    },
    changes: [
      "AEGIS crews and facilitators can now see each fighter wing's live strength, sourced capacity, and bay readiness separately, with GM-only count corrections when the table needs a manual update. 124 of 747 planned items are complete (16.60%).",
    ],
  },
  {
    version: '0.3.45',
    implementationPrompts: ['090'],
    implementationProgress: {
      completed: 118,
      total: 747,
      percentage: '15.80%',
      done: 118,
      partial: 7,
      active: 0,
      missing: 622,
    },
    changes: [
      'Players now receive only shared ship status when they join or reconnect, so private cards, bonuses, deck order, loyalty details, and facilitator notes stay out of public session projections. 118 of 747 planned items are complete (15.80%).',
    ],
  },
  {
    version: '0.3.44',
    implementationPrompts: ['088'],
    implementationProgress: {
      completed: 116,
      total: 747,
      percentage: '15.53%',
      done: 116,
      partial: 7,
      active: 0,
      missing: 624,
    },
    changes: [
      'Facilitator census and Wolf timing displays no longer roll back to an older update during reconnects. 116 of 747 planned items are complete (15.53%).',
    ],
  },
  {
    version: '0.3.43',
    implementationPrompts: ['086'],
    implementationProgress: {
      completed: 115,
      total: 747,
      percentage: '15.39%',
      done: 115,
      partial: 8,
      active: 0,
      missing: 624,
    },
    changes: [
      'Facilitators can now restore the hidden Wolf assignment and keep private census notes for the right player as the session reconnects or updates. 115 of 747 planned items are complete (15.39%).',
    ],
  },
  {
    version: '0.3.42',
    implementationPrompts: ['085'],
    implementationProgress: {
      completed: 114,
      total: 747,
      percentage: '15.26%',
      done: 114,
      partial: 9,
      active: 0,
      missing: 624,
    },
    changes: [
      'Reconnecting players no longer see another session member’s private role or loyalty details while their own assignment reloads. 114 of 747 planned items are complete (15.26%).',
    ],
  },
  {
    version: '0.3.40',
    implementationPrompts: ['075'],
    implementationProgress: {
      completed: 109,
      total: 747,
      percentage: '14.59%',
      done: 109,
      partial: 12,
      active: 0,
      missing: 626,
    },
    changes: [
      'Existing games with incomplete maintenance records now start safely and can continue maintenance without losing prepared ship state. 109 of 747 planned items are complete (14.59%).',
    ],
  },
  {
    version: '0.3.39',
    implementationPrompts: ['068'],
    implementationProgress: {
      completed: 106,
      total: 746,
      percentage: '14.21%',
      done: 106,
      partial: 15,
      active: 0,
      missing: 625,
    },
    changes: [
      'Players can now see the shuttles and fighter wings assigned to their printed role in their private brief. Ownership comes from the locked roster and stays server controlled. 106 of 746 planned items are complete (14.21%).',
    ],
  },
  {
    version: '0.3.38',
    implementationPrompts: ['064'],
    implementationProgress: {
      completed: 105,
      total: 746,
      percentage: '14.08%',
      done: 105,
      partial: 16,
      active: 0,
      missing: 625,
    },
    changes: [
      'Players keep their own private loyalty card and suspicion after reconnects, while facilitators can view the authorized loyalty census without exposing private card details. 105 of 746 planned items are complete (14.08%).',
    ],
  },
  {
    version: '0.3.36',
    implementationPrompts: ['062'],
    implementationProgress: {
      completed: 103,
      total: 734,
      percentage: '14.03%',
      done: 103,
      partial: 17,
      active: 0,
      missing: 614,
    },
    changes: [
      'Facilitators can now release a player’s printed role before game start; the old station opens with role, device, and private links cleaned up, while occupied stations and Press remain protected until their owner releases them. 103 of 734 planned items are complete (14.03%).',
    ],
  },
  {
    version: '0.3.34',
    implementationPrompts: ['057'],
    implementationProgress: {
      completed: 101,
      total: 734,
      percentage: '13.76%',
      done: 101,
      partial: 19,
      active: 0,
      missing: 614,
    },
    changes: [
      'Facilitators can now lock base Capybara, expansion Capybara, or neither before casting, keeping each session on one vessel definition from setup through start. 101 of 734 planned items are complete (13.76%).',
    ],
  },
  {
    version: '0.3.32',
    implementationPrompts: ['019'],
    implementationProgress: {
      completed: 99,
      total: 734,
      percentage: '13.49%',
      done: 99,
      partial: 20,
      active: 0,
      missing: 615,
    },
    changes: [
      'Shared activity records keep the information players need without exposing private details.',
    ],
  },
  {
    version: '0.3.31',
    implementationPrompts: ['015'],
    implementationProgress: {
      completed: 97,
      total: 734,
      percentage: '13.22%',
      done: 97,
      partial: 22,
      active: 0,
      missing: 615,
    },
    changes: [
      'Command failures now explain whether you need to sign in, wait for the right phase, refresh newer table state, reconnect, or leave a closed session, without exposing private server details.',
    ],
  },
  {
    version: '0.3.30',
    implementationPrompts: ['012'],
    implementationProgress: {
      completed: 96,
      total: 734,
      percentage: '13.08%',
      done: 96,
      partial: 23,
      active: 0,
      missing: 615,
    },
    changes: [
      'Retried setup actions now recover the original result when available and guide you to refresh before repeating an action, so delayed or older responses cannot create duplicate changes.',
    ],
  },
  {
    version: '0.3.29',
    implementationPrompts: ['014'],
    implementationProgress: {
      completed: 95,
      total: 734,
      percentage: '12.94%',
      done: 95,
      partial: 24,
      active: 0,
      missing: 615,
    },
    changes: [
      'Offline session details remain visible, while controls wait for a live connection so delayed updates cannot undo newer changes.',
    ],
  },
  {
    version: '0.3.28',
    implementationPrompts: ['055'],
    implementationProgress: {
      completed: 94,
      total: 734,
      percentage: '12.81%',
      done: 94,
      partial: 25,
      active: 0,
      missing: 615,
    },
    changes: [
      'Facilitators can assign the optional Intelligence Agent only while a valid Wolf remains, with private setup preserved through release and retry.',
      'Stale loyalty secrets no longer survive role release, and setup replay rejects actor or payload collisions without exposing hidden loyalties.',
    ],
  },
  {
    version: '0.3.27',
    implementationPrompts: ['106b'],
    implementationProgress: {
      completed: 90,
      total: 730,
      percentage: '12.33%',
      done: 90,
      partial: 25,
      active: 0,
      missing: 615,
    },
    changes: [
      'Cycle and finale transmissions now keep their accessible status visible until the moving tail actually clears, so lifecycle copy remains readable and replays at the correct transition.',
    ],
  },
  {
    version: '0.3.26',
    implementationPrompts: [109],
    implementationProgress: {
      completed: 89,
      total: 730,
      percentage: '12.19%',
      done: 89,
      partial: 25,
      active: 0,
      missing: 616,
    },
    changes: [
      'Live session updates now keep every player on the newest cycle and phase, so a delayed older update cannot bring back an action from a window that has already closed. — Roadmap progress: 89 of 730 planned items complete (12.19%).',
    ],
  },
  {
    version: '0.3.25',
    implementationPrompts: [602],
    implementationProgress: {
      completed: 86,
      total: 730,
      percentage: '11.78%',
      done: 86,
      partial: 25,
      active: 0,
      missing: 619,
    },
    changes: [
      'The finale disco ball now stays clear of the Back to roles navigation on compact portrait and landscape screens while preserving its full desktop presentation. — Roadmap progress: 86 of 730 planned items complete (11.78%).',
    ],
  },
  {
    version: '0.3.23',
    implementationPrompts: [141],
    implementationProgress: {
      completed: 86,
      total: 730,
      percentage: '11.78%',
      done: 86,
      partial: 24,
      active: 0,
      missing: 620,
    },
    changes: [
      'GMs can now open the normal airspace window through one server-authorized, retry-safe transition, so eligible craft can move only when the live phase permits it. — Roadmap progress: 86 of 730 planned items complete (11.78%).',
    ],
  },
  {
    version: '0.3.22',
    implementationProgress: {
      completed: 85,
      total: 729,
      percentage: '11.66%',
      done: 85,
      partial: 24,
      active: 0,
      missing: 620,
    },
    changes: [
      'CIC planning records now flag Wolf assignment authority for later review; no game behavior changed. — Roadmap progress: 85 of 729 planned items complete (11.66%).',
    ],
  },
  {
    version: '0.3.21',
    implementationPrompts: [92],
    implementationProgress: {
      completed: 84,
      total: 728,
      percentage: '11.54%',
      done: 84,
      partial: 24,
      active: 0,
      missing: 620,
    },
    changes: [
      'Cycle advancement now waits for the correct game phase. — Roadmap progress: 84 of 728 planned items complete (11.54%).',
    ],
  },
  {
    version: '0.3.20',
    implementationPrompts: [139],
    implementationProgress: {
      completed: 77,
      total: 723,
      percentage: '10.65%',
      done: 77,
      partial: 26,
      active: 0,
      missing: 620,
    },
    changes: [
      'Crew maintenance updates now show the useful result without exposing private game information. — Roadmap progress: 77 of 723 planned items complete (10.65%).',
    ],
  },
  {
    version: '0.3.19',
    implementationPrompts: ['138a'],
    implementationProgress: {
      completed: 74,
      total: 723,
      percentage: '10.24%',
      done: 74,
      partial: 27,
      active: 0,
      missing: 622,
    },
    changes: [
      'GMs can now safely retry an undo of the latest maintenance step during Team phase without duplicate effects, erasing damage, or changing maintenance history — Roadmap progress: 74 of 723 planned items complete (10.24%).',
    ],
  },
  {
    version: '0.3.18',
    implementationPrompts: [138],
    implementationProgress: {
      completed: 75,
      total: 721,
      percentage: '10.40%',
      done: 75,
      partial: 26,
      active: 0,
      missing: 620,
    },
    changes: [
      'Improved GM server logic so maintenance actions are safer and do not run twice.',
    ],
  },
  {
    version: '0.3.17',
    implementationPrompts: [177],
    implementationProgress: {
      completed: 74,
      total: 721,
      percentage: '10.26%',
      done: 74,
      partial: 26,
      active: 0,
      missing: 621,
    },
    changes: [
      'AEGIS crews can now rely on its printed 2 / 3 / 6 jump costs, upgrade discount, and damaged-drive limits while route failures and repeat jumps preserve their remaining fuel and charge.',
    ],
  },
  {
    version: '0.3.16',
    implementationPrompts: [98],
    implementationProgress: {
      completed: 73,
      total: 721,
      percentage: '10.12%',
      done: 73,
      partial: 26,
      active: 0,
      missing: 622,
    },
    changes: [
      'Connected consoles now converge on one airspace opening and one authoritative cycle handoff at each phase transition, so retries cannot replay either transition.',
    ],
  },
  {
    version: '0.3.15',
    implementationPrompts: ['603a'],
    implementationProgress: {
      completed: 72,
      total: 721,
      percentage: '9.99%',
      done: 72,
      partial: 27,
      active: 0,
      missing: 622,
    },
    changes: [
      'The session ticket now reserves its real space across the console, keeping Role Select and routed controls clear on phones and short screens; reduced-motion FleetBroadcast copy wraps in the same CIC instrument instead of clipping.',
    ],
  },
  {
    version: '0.3.14',
    implementationPrompts: [22],
    implementationProgress: {
      completed: 70,
      total: 719,
      percentage: '9.74%',
      done: 70,
      partial: 27,
      active: 0,
      missing: 622,
    },
    changes: [
      'Session creation now persists one redacted, request-bound audit record for authorized member reads, with retries safe and failed requests silent.',
    ],
  },
  {
    version: '0.3.13',
    implementationPrompts: [51, 54, 71, 75],
    implementationProgress: {
      completed: 69,
      total: 719,
      percentage: '9.60%',
      done: 69,
      partial: 28,
      active: 0,
      missing: 622,
    },
    changes: [
      'The production roster now reaches start only from the exact configured 8–20 core cast, canonical occupied seats, reciprocal live player pointers, and private loyalty state.',
      'Routine start now derives one Wolf at 8–13 core players or two at 14–20 on the server; a uniquely claimed Press Officer stays eligible as the distinct optional twenty-first player without adding a third Wolf.',
      'One live GM can now satisfy both facilitator responsibilities and start a ready session, while additional live GMs may collaborate without becoming a readiness dependency.',
      'Ordinary GM start now locks setup, writes audience-correct private results and a safe calculation receipt, and enters Cycle 1 exactly once with pursuit 2 and the existing timer and announcement.',
    ],
  },
  {
    version: '0.3.12',
    implementationPrompts: [21, 30, 51, 73],
    implementationProgress: {
      completed: 66,
      total: 713,
      percentage: '9.26%',
      done: 66,
      partial: 31,
      active: 0,
      missing: 616,
    },
    changes: [
      'Facilitators can now confirm one authoritative setup tuple for the settled 8–20 core roster, including chart, cycle limit, Dione, Capybara, and ordered active roles.',
      'Players can now claim and release stable core-role seats through the existing role route, with reconnect hydration preserving the server roster and seat state.',
      'Setup evidence now covers the owner-set 8–20 core composition while readiness, start, and the optional Press station remain outside this release boundary.',
      'A single GM can carry both printed facilitation responsibilities while optional additional GMs can share or hand off lanes; the optional Press station remains distinct and outside the core count.',
    ],
  },
  {
    version: '0.3.11',
    implementationPrompts: [4],
    changes: [
      'Facilitators can now stage an exact core-role roster for every player count from 8 through 20, including the source-authoritative Capybara Captain and Recycler pair at 19 and 20.',
    ],
  },
  {
    version: '0.3.10',
    implementationPrompts: ['275a', 598, 605],
    changes: [
      'SNN Press is default-enabled as an optional, authoritatively toggleable Independent Station: its distinct twenty-first player console stays outside the counted core roster, and its roster-derived starting host is AEGIS at 8–11 players or Dione at 12+ (the 19-player matrix remains open).',
      'Connection indicators now say exactly CONNECTED before a session and NOT CONNECTED — AWAITING IRIS AUTHENTICATION only for a joined session before its first Cycle 1 snapshot.',
      'DRADIS now keeps every complete contact name inside the plot at the top, right, bottom, and left edges across compact, expanded, and reduced-motion views; broader group-local transit and parked-craft projection remains open.',
    ],
  },
  {
    version: '0.3.9',
    implementationPrompts: [4, 51],
    changes: [
      'Every supported table size now receives a complete printed-roster-compatible cast through lobby setup and game start, including the documented low-count AEGIS role decision.',
      'Facilitators can now apply an exact printed roster preset for each supported player count without a convenience role or a short start roster.',
    ],
  },
  {
    version: '0.3.8',
    changes: [
      'Wolf Pursuit Track countdowns now describe the remaining cycles instead of tracks.',
    ],
  },
  {
    version: '0.3.7',
    implementationPrompts: [18],
    changes: [
      'One-shot bridge confetti now rejects stale console authority and stale officer approvals before a dispenser can fire.',
    ],
  },
  {
    version: '0.3.6',
    implementationPrompts: [598],
    changes: [
      'Connection indicators now keep the connected state through the first 30 seconds of a disconnect and only reveal the disconnected icon after that window when the player had been continuously interacting for more than 30 seconds before the outage.',
    ],
  },
  {
    version: '0.3.5',
    implementationPrompts: [15, 18, 21, 22, 57, 58, 59, 60, 61, 62, 64, 65, 66, 67, 71, 72, 73, 74, 75, 77, 78, 84, 86],
    changes: [
      'Players and facilitators now receive stable, nonsecret command errors for authentication, permission, phase, revision, conflict, malformed input, service, and terminal-session failures.',
      'Actions now carry phase eligibility metadata, so a stale control cannot authorize a valid command in the wrong phase.',
      'Session setup rejects unsupported player counts, charts, expansions, cycle limits, duplicate options, and malformed fields before creating state.',
      'Creating a session now writes its lobby, facilitator metadata, configuration, join code, and opening event through one authoritative transaction.',
      'Setup now locks base Capybara, expansion Capybara, or neither as an explicit vessel mode before casting.',
      'Expansion setup now loads the Capybara Captain, Recycler, Scrap, Macaw, Boa, and full-ship rules without mixing base definitions.',
      'Players can now record nonbinding ship preferences while oversubscription and tie-breaking remain facilitator decisions.',
      'Facilitators can now assign eligible players to open ship roles while casting is unlocked.',
      'Casting now prevents duplicate role holders and multi-role players except for the printed Union pairing.',
      'Facilitators can now release and reassign pre-start roles without orphaning seats, craft, or private records.',
      'Private loyalty cards now initialize for players while the facilitator receives the authorized census view.',
      'Loyalty suspicion now initializes from the printed card rules for Loyalists, Wolves, Intelligence Agents, Arbour, Cult, Android, and Friend.',
      'Friend loyalties now pair privately so partners can identify one another without exposing unrelated links.',
      'Android players can now deliberately disclose their own proof without opening another player\'s loyalty record.',
      'Start readiness now reports precise nonsecret blockers for missing facilitators, seats, roles, loyalties, craft ownership, or configuration.',
      'Starting the game now locks casting and rejects lobby mutations after the authoritative start transaction.',
      'Setup now reports the two physical facilitator responsibilities independently of local GM mode.',
      'Only an active eligible facilitator or GM instance can authorize a ready game start.',
      'The start transaction now initializes lifecycle, cycle, phase, timers, ships, roles, resources, decks, pursuit, and the opening event together.',
      'Cycle 1 now initializes one server-owned pursuit value at 2 for each initial fleet group.',
      'Sessions now lock the printed six-to-eight-cycle limit and reject unsupported durations.',
      'Crew snapshots now expose permitted shared vessel state without another crew\'s private role or loyalty facts.',
      'Authorized facilitators can now regain census, suspicion, notes, and hidden resolution state while members remain denied.',
    ],
  },
  {
    version: '0.3.4',
    changes: [
      'Cycle 0 status messages now say Awaiting Iris Authentication so players see the actual authentication gate.',
    ],
  },
  {
    version: '0.3.3',
    changes: [
      'A first-load motion-safety gate now explains the game\'s moving visuals and lets players choose reduced motion or the recommended normal motion, with a fresh acknowledgement required every 24 hours.',
    ],
  },
  {
    version: '0.3.2',
    changes: [
      'Jump consoles now accept locked four-digit destinations, power up across a full-width drive rail, protect the drive with a one-hour integrity lockout for bad coordinates, and restore only the ships that arrive together after the jump.',
    ],
  },
  {
    version: '0.3.1',
    changes: [
      'The pursuit tracker now identifies its warning readout as WOLF PURSUIT TRACK for a clearer view of the approaching threat.',
    ],
  },
  {
    version: '0.3.0',
    changes: [
      'Connection indicators now stay optimistically connected for the first five seconds before revealing the live connection state, while reconnect grace behavior remains unchanged.',
    ],
  },
  {
    version: '0.2.108',
    changes: [
      'GMs can now pause the game timer for emergencies only after completing a deliberate three-click disarm sequence, with the paused state clearly broadcast to the room.',
    ],
  },
  {
    version: '0.2.107',
    changes: [
      'GM reset of the Code of Conduct checklist now lives in the GM Console instead of global Settings.',
    ],
  },
  {
    version: '0.2.106',
    changes: [
      'DRADIS contacts now brighten and ping again when a recent sweep finds them, while contacts still under the movement cooldown hold position.',
    ],
  },
  {
    version: '0.2.105',
    changes: [
      'Cycle Zero now keeps game-state controls locked while allowing DRADIS and console viewing, and a solo session can start the Cycle One demo from Settings.',
    ],
  },
  {
    version: '0.2.102',
    changes: [
      'Pursuit panels now keep their apocalyptic countdown visible and sit directly beneath DRADIS on ship consoles at every screen size.',
    ],
  },
  {
    version: '0.2.100',
    changes: [
      'DRADIS contacts now show their gameplay range beneath each contact name, while unknown contacts recalculate that range from the viewing ship’s origin.',
    ],
  },
  {
    version: '0.2.99',
    changes: [
      'Connection indicators now show a disconnect immediately when the player was active within the previous 30 seconds; older activity keeps the last connected state during the 30-second reconnect window.',
    ],
  },
  {
    version: '0.2.98',
    changes: [
      'Connection indicators now give passive reconnects and page returns up to 30 seconds to recover, while an active player sees a disconnect immediately.',
    ],
  },
  {
    version: '0.2.97',
    changes: [
      'Closed-airspace ticker copy now keeps the lockdown directive visible until a newer AEGIS or SNN broadcast replaces it.',
    ],
  },
  {
    version: '0.2.95',
    changes: [
      'GMs can now add five minutes to the active Airspace Open or Airspace Closed window from the console after a deliberate confirmation.',
    ],
  },
  {
    version: '0.2.93',
    changes: [
      'Pursuit panels now show the shared Distance from Home Systems readout without redundant coordinate or scope labels.',
    ],
  },
  {
    version: '0.2.92',
    changes: [
      'Cycle handoffs now clear unused console charges and shuttle fuel after Coordination Phase, keep overrunning missions and their docking state in place, and show the numbered successor cycle with an AIRSPACE CLOSED, survivor, and OBJECTIVE // SURVIVE. transmission.',
      'GM fleet resource cards now show each ship’s current ship-relative pursuit tracker beneath its resource and census controls, using the shared galactic map even when the fleet is split.',
    ],
  },
  {
    version: '0.2.87',
    changes: [
      'Ship consoles now show a ship-relative pursuit tracker directly beneath shipboard DRADIS, using each ship’s live coordinate and the shared galactic map pursuit depth without exposing split-fleet positions.',
    ],
  },
  {
    version: '0.2.86',
    changes: [
      'GM Console now requires a second click to advance from Cycle 0, while Skip to Cycle 1 bypasses the fullscreen transmission and keeps its own wording independent.',
      'The former launcher hacking transmissions are restored as a future-ready capability, but remain disabled in the current opening experience until Wolf gameplay provides the context.',
    ],
  },
  {
    version: '0.2.85',
    changes: [
      'The Cycle 1 traitor reveal now lingers longer for a clearer read, and the final survivors slide fades out more deliberately.',
    ],
  },
  {
    version: '0.2.84',
    changes: [
      'The Code of Conduct now reminds everyone that every role has a human behind it, and asks players to say hello and debrief after the game—even when their roles are enemies.',
      'DRADIS contact acquisition is back on the established visible sweep rim, restoring predictable detections across the display.',
    ],
  },
  {
    version: '0.2.83',
    changes: [
      'DRADIS acquisition now follows the exact visible scan-disc radius, so the viewport sweep and its 3D contact boundary stay aligned at every display size.',
    ],
  },
  {
    version: '0.2.82',
    changes: [
      'DRADIS sweeps now use their finite 3D scan discs, so a contact is acquired only when its actual position intersects the scan volume—not when its screen projection merely overlaps it.',
    ],
  },
  {
    version: '0.2.81',
    changes: [
      'The Code of Conduct waiver now requires each regulation checkbox before the final confirmation becomes available.',
      'A ten-second review timer now separates the contract popup from its final confirmation, and logged-in GMs can reset the checklist from Settings.',
    ],
  },
  {
    version: '0.2.78',
    changes: [
      'The SNN Press Shuttle now starts docked to Dione in both client and server session manifests, including its initial visit history and DRADIS center.',
      'DRADIS acquisition now follows rendered 3D sweep-plane crossings against each target’s actual rig-space XYZ position instead of its projected screen position.',
    ],
  },
  {
    version: '0.2.77',
    changes: [
      'Ship jump consoles now include a non-GM navigation map with the current ship fix and the coordinates of that ship’s previous fixes, synced to the GM star map without exposing organiser site overlays.',
      'GMs can select a fleet ship, click a printed system, and move that ship there; the authoritative ship log records the stardate, navigational error, and nearby fleet jump-away or jump-arrival notices.',
      'Every ship now has a bounded, scrollable navigation log that excludes maintenance activity and uses a server-derived UTC stardate.',
      'Ship consoles can locally hide resource stores and unrest/population independently before showing a console to another ship.',
      'The ICN travel console lock is server-authorized and disables gameplay actions while engaged, with a release control for the ship’s active authority.',
      'First-time session access now opens a Code of Conduct waiver with the fleet’s ship-table role-play rule and CIC information-security regulation.',
      'Acknowledging the waiver keeps it cleared across sessions for 24 hours on the same device.',
      'The launcher now keeps Settings available, and creating or joining a session lands at the pre-role device connection screen after any current session has been disconnected.',
      'GMs can kick connected player browsers from the roster; the kicked browser is blocked from returning to that session, while its identity remains free to join another session.',
      'Cycle transmissions now close on one survivor-count beat before fading out, and the fleet survivor readout stays at the reduced total through the next cycle transition.',
      'Unknown ambient contacts now enter at LONG range, the expanded DRADIS view no longer carries a standalone range key, and the disco ball renders an illuminated rear facet surface.',
      'The mobile fleet ticker reserves the measured wrapped header height and keeps repeated copy in a single centred line box.',
    ],
  },
  {
    version: '0.2.76',
    changes: [
      'GM access now logs in from Settings, remembers the browser login for 24 hours, shows a lock-state emoji, and provides an explicit safety logout.',
      'GM registration now requires authenticated facilitator access before a device can enter the GM console, while Settings explains how legitimate product holders can request access.',
    ],
  },
  {
    version: '0.2.75',
    changes: [
      'GM registration now requires the facilitator access password before a device can enter the GM console, while Settings explains how legitimate product holders can request access.',
      'During Cycle 0, the fleet ticker now warns that consoles remain locked out until Iris authentication is complete, then drops that bulletin when Cycle 1 begins.',
    ],
  },
  {
    version: '0.2.74',
    changes: [
      'Live roster changes now immediately make removed ship and Press roles read-only, with server-side checks protecting maintenance, dispatch, alert, counter, and confetti actions.',
      'Expired presence leases no longer let stale crew block two-person confetti approvals, and legacy connected records remain consistent with session membership locking.',
    ],
  },
  {
    version: '0.2.73',
    changes: [
      'The Cycle 0 → Cycle 1 transmission now gives its closing PEOPLE and SURVIVE. beats more room to land, removes the stray dash, and fades out over a full second.',
      'GM Console can replay the latest transmission locally or across every connected console, with a codified danger-red second press for the setup skip command.',
    ],
  },
  {
    version: '0.2.72',
    changes: [
      'The GM starmap now reads as a deeper tactical navigation instrument, with highlighted jump corridors, a restrained scanning pass, and clearer perspective depth.',
      'Fleet fixes now carry their existing ship colors into the chart, while the live plot strip and accessible system labels make plotted ships easier to track.',
    ],
  },
  {
    version: '0.2.71',
    changes: [
      'GM Console DRADIS now uses the same square outlined instrument display as the ship consoles, with matching fleet-plot labeling and responsive sizing.',
    ],
  },
  {
    version: '0.2.70',
    changes: [
      'On phones, the expanded GM DRADIS keeps its combat-range key clear of the live airspace countdown.',
    ],
  },
  {
    version: '0.2.69',
    changes: [
      'GM Console now keeps the normal Advance to Cycle 1 command alongside the fast Skip to Cycle 1 shortcut during setup.',
    ],
  },
  {
    version: '0.2.68',
    changes: [
      'The shared Finale now lowers a true 3D disco ball with twin DRADIS sweeps, sending cyan and amber beams across the console to land on live interface instruments.',
      'The spectacle keeps its digital facet grid and scrolling confetti while using a bounded, phone-friendly light field that stays quiet and still when reduced motion is enabled.',
      'The Finale credit roll now correctly identifies the original Den of Wolves megagame.',
    ],
  },
  {
    version: '0.2.67',
    changes: [
      'The live Finale now scrolls a full credit roll for the original Den of Wolves creators, New Eden game design, and web app lead Emerald Fleur Pham through the fleet news ticker.',
    ],
  },
  {
    version: '0.2.66',
    changes: [
      'The Cycle 0 → Cycle 1 fleet transmission scan now travels all the way to the bottom edge of its instrument frame.',
    ],
  },
  {
    version: '0.2.65',
    changes: [
      'GMs can now inspect the printed 22-system star chart in a 3D console projection, switch between organiser charts A, B and C, and see each fleet ship’s current chart fix without exposing the instrument to players.',
    ],
  },
  {
    version: '0.2.64',
    changes: [
      'The New Eden Console can now be added to an iPhone or Android home screen as a standalone CIC app with a DRADIS ball icon.',
      'Mobile consoles now preserve their dark launch screen and safe-area spacing around browser and device hardware.',
    ],
  },
  {
    version: '0.2.63',
    changes: [
      'The Cycle 1 fleet transmission now delivers “There are traitors among us; that’s kind of sus” as one complete slide.',
      'GM Console now offers a Skip to Cycle 1 control during setup so you can start a live debug session faster.',
    ],
  },
  {
    version: '0.2.61',
    changes: [
      'Cycle transitions now arrive as a ruled fleet instrument, showing the exact handoff between cycles, transmission progress, live survivor count, and the Wolf pursuit status inside the same CIC visual language as the rest of the console.',
      'The transmission frame tightens cleanly for phones, short landscape screens, and reduced motion while keeping the life-or-death briefing readable, with eased handoffs between each message beat.',
    ],
  },
  {
    version: '0.2.60',
    changes: [
      'A returning or refreshed in-session console now keeps its Connected light steady for one second while it restores its uplink.',
      'The landing population estimate now uses a larger, more balanced readout size across wide and phone displays.',
    ],
  },
  {
    version: '0.2.58',
    changes: [
      'The Cycle 1 warning now identifies the Wolves and reveals “ARE TRAITORS.” in place after a tense pause.',
      'Survivor totals in fleet transmissions now read in bone-white, fall by one midway through their display, and update the fleet-wide total at the same time.',
    ],
  },
  {
    version: '0.2.57',
    changes: [
      'Fleet ships and their shuttlecraft now stay uncluttered on DRADIS without range indicators, while every other contact keeps its range readout.',
    ],
  },
  {
    version: '0.2.56',
    changes: [
      'The landing display now begins with a population estimate while CIC connects.',
    ],
  },
  {
    version: '0.2.55',
    changes: [
      'Local table hosts can now create and run an emulated session without production-only App Check blocking the console; public consoles keep their existing app-verification protection.',
    ],
  },
  {
    version: '0.2.54',
    changes: [
      'GMs can now start a shared Finale after a deliberate two-press confirmation, lowering a digital disco ball and a continuous confetti stream into every connected console.',
      'Retracting Finale stops the confetti stream immediately, while a blue “Debrief mode enabled” notice confirms the live effect for everyone already connected.',
    ],
  },
  {
    version: '0.2.53',
    changes: [
      'Returning after a closed, sleeping, or long-idle browser can now resume the same session and reclaim an open previous seat. If another player took it, you stay in the session and can choose another seat.',
      'Disconnect now asks for a red “ARE YOU SURE?” confirmation before this browser leaves the session.',
    ],
  },
  {
    version: '0.2.52',
    changes: [
      'GM fleet store, census, and unrest counters now answer immediately while rapid taps are sent together as one safe update.',
      'Crossing an unrest or population threshold still pauses the counter at that exact game event before any later tap can apply.',
    ],
  },
  {
    version: '0.2.51',
    changes: [
      'Airspace countdowns now stay at the lower left of compact and expanded DRADIS, while the compact ticker loops an Airspace Control bulletin until AEGIS or SNN sends newer copy.',
    ],
  },
  {
    version: '0.2.50',
    changes: [
      'Fleet red alerts now remain in all-capital lettering as they scroll across the console.',
      'Every active Admiral alert now begins with an ICSN ADMIRAL source prefix, including edited warnings.',
    ],
  },
  {
    version: '0.2.49',
    changes: [
      'Every fleet bulletin now begins with its source, including AEGIS airspace and alert notices alongside SNN Press dispatches.',
    ],
  },
  {
    version: '0.2.48',
    changes: [
      'Expanded DRADIS now keeps LONG, MEDIUM, and SHORT visible as a range key, while each return uses the same quick-read label.',
    ],
  },
  {
    version: '0.2.47',
    changes: [
      'GM roster setup now stages player-count and role changes locally, then sends one confirmed roster when you are ready.',
      'Joint Engineering Union stations now appear only in their printed low-count roster configurations and replace their paired Engineers instead of supplementing them.',
      'Union Engineers can run maintenance for either assigned ship and open only their own Wobbly or Ally shuttle, with a clear route back to the Union console.',
    ],
  },
  {
    version: '0.2.46',
    changes: [
      'The Cycle 0 connection light now reads “Connected, Awaiting Iris Authentication,” and the live Cycle 1 briefing opens with “Iris Authentication Confirmed.”',
    ],
  },
  {
    version: '0.2.45',
    changes: [
      'DRADIS and live console instruments now stay more responsive during busy sessions while keeping the same scan behavior and visual effects.',
      'GM maintenance alerts still appear at their exact deadlines while the command console does less unnecessary redrawing.',
    ],
  },
  {
    version: '0.2.44',
    changes: [
      'DRADIS returns now identify their combat range, with every fleet ship reporting SHORT RANGE without changing its plotted position.',
      'Live-cycle instruments and shuttle procedures now say AIRSPACE RESTRICTED and AIRSPACE OPEN.',
      'SNN ticker lettering now has clear vertical room instead of clipping along its lower edge.',
    ],
  },
  {
    version: '0.2.43',
    changes: [
      'Cycle 1 now delivers its opening fleet briefing as clear, individually timed messages, giving everyone time to read the situation before play begins.',
    ],
  },
  {
    version: '0.2.42',
    changes: [
      'The top-right connection light now shows blue “Connected, Awaiting Uplink” while Cycle 0 systems boot, then returns to green when Cycle 1 begins.',
    ],
  },
  {
    version: '0.2.41',
    changes: [
      'The session join screen now stays focused on entering your code.',
    ],
  },
  {
    version: '0.2.40',
    changes: [
      'New games now begin at Cycle 0: players can choose and inspect stations while gameplay waits for the GM to start Cycle 1.',
      'Every live cycle start now opens with a fleet transmission, including the current survivor count and a longer Cycle 1 briefing.',
      'Cycle 1 begins with 10 minutes of restricted airspace and 20 minutes of open airspace; later cycles run 5 and 15 minutes. Airspace bulletins yield to the Press’s next dispatch.',
      'AEGIS can grant the Press an airspace exception from Systems control, and early GM cycle advances now require a red confirmation.',
    ],
  },
  {
    version: '0.2.39',
    changes: [
      'Newer consoles create six-digit session codes.',
      'After six code guesses in ten minutes, a console pauses briefly while other players sharing the venue network keep working normally.',
    ],
  },
  {
    version: '0.2.38',
    changes: [
      'Session connections now verify that each console comes from the companion app, helping keep shared games responsive during abusive traffic spikes.',
      'When service capacity is briefly full, console commands now wait safely for a reconnect instead of disappearing.',
    ],
  },
  {
    version: '0.2.37',
    changes: [
      'GM damage controls now keep every applied damage-card outcome visible as new cards are assigned.',
    ],
  },
  {
    version: '0.2.36',
    changes: [
      'Shuttle cargo rules now wrap in full at every console size instead of truncating the printed allowance.',
    ],
  },
  {
    version: '0.2.35',
    changes: [
      'Every printed shuttlecraft now has its own console, including the Capybara and Joint Engineering Union craft.',
      'Open your assigned craft from its ship-role workspace to read its live docking and fuel state alongside its printed operations, cargo limits, and mission rules.',
      'New sessions begin with the fleet’s standard shipboard shuttlecraft docked at their home ships and ready for refuelling.',
      'Wobbly and Ally stay off in the default 20/21-player roster until a GM enables their paired Joint Engineering Union role.',
    ],
  },
  {
    version: '0.2.34',
    changes: [
      'Console controls now remain read-only until the station assignment is confirmed, including ship, joint-engineering, and Press controls.',
      'Invalid console links now return safely without changing a player’s assigned role.',
      'Leaving during a reconnect now stays disconnected, and unavailable connections visibly disable DRADIS effects until service returns.',
      'GM rosters now stay readable if an older player record has a malformed name.',
    ],
  },
  {
    version: '0.2.33',
    changes: [
      'Crew now see the exact damage card and outcome wherever damage resolves, including armour absorption, failed riots, and destruction when no card remains.',
    ],
  },
  {
    version: '0.2.32',
    changes: [
      'The fleetwide red alert can only be raised once every 10 minutes, while standing down and updating an active alert remain available.',
      'Red-alert messages convert to uppercase as the Admiral types, including the restored default warning.',
      'Standing down lets the current alert finish its ticker pass, then runs the cancellation twice before all red-alert copy clears.',
    ],
  },
  {
    version: '0.2.31',
    changes: [
      'The Press console now keeps every active dispatch visible, adds new dispatches without replacing earlier reports, and lets the Press Officer dismiss each report separately.',
    ],
  },
  {
    version: '0.2.30',
    changes: [
      'Ticker messages now keep their natural scrolling pace when replaced or dismissed, with new copy following smoothly on the same track.',
    ],
  },
  {
    version: '0.2.29',
    changes: [
      'Returning to a console after at least one minute away now checks for an update and resumes the previous session without continuous background polling.',
    ],
  },
  {
    version: '0.2.28',
    changes: [
      'The landing-page motion control now matches the typography and display of the other session controls.',
    ],
  },
  {
    version: '0.2.27',
    changes: [
      'New console releases automatically reload connected players into the updated build and resume their previous session, page, role, and GM instance without announcing a dropout.',
    ],
  },
  {
    version: '0.2.26',
    changes: [
      'Red alerts gradually enter the ticker from the right, with a persistent RED ALERT indicator at the bottom left of DRADIS.',
      'Press dispatches continue scrolling alongside active red alerts.',
      'The Admiral can write and update a lowercase alert message, or restore the default warning.',
    ],
  },
  {
    version: '0.2.25',
    changes: [
      'The top press ticker now stays clear until the Press Officer releases the first fleet dispatch.',
    ],
  },
  {
    version: '0.2.24',
    changes: [
      'GMs can assign a random damage card, repair all ship damage, and roll back the last maintenance step from the ship’s maintenance panel.',
      'Crew can view their ship’s other consoles without changing roles, and operate them while the ship has an incomplete connected crew.',
      'GM observers can browse every console aboard their ship and use the Read / Write toggle to switch access; each visit starts read-only.',
    ],
  },
  {
    version: '0.2.23',
    changes: [
      'Shuttles now use the wider ship console layout, with the dispatch desk in the main role workspace and shuttle instruments in the side rail.',
    ],
  },
  {
    version: '0.2.22',
    changes: [
      'Starting a ship’s maintenance cycle now requires a red “ARE YOU SURE?” confirmation; subsequent steps remain one click.',
    ],
  },
  {
    version: '0.2.21',
    changes: [
      'The top press ticker now remains visible between fleet events, with clearer all-capital red-alert shelter instructions for non-crew.',
      'The Press Officer can write fleetwide SNN dispatches from the Press shuttle, beginning with “SNN // Your Trusted Partner.”',
      'The Admiral’s guarded red-alert command now keeps every label, status and error in all capitals.',
    ],
  },
  {
    version: '0.2.20',
    changes: [
      'Moving DRADIS contacts now hold their last detected position until a sweep reveals their next position.',
    ],
  },
  {
    version: '0.2.19',
    changes: [
      'Each ship can now perform maintenance once per cycle, with the cycle shown on every maintenance start control.',
      'The GM console now shows the current cycle and provides the authoritative control for advancing it.',
    ],
  },
  {
    version: '0.2.18',
    changes: [
      'Fleet alerts and press messages now run beside the session code without covering console controls, repeating seamlessly across their full readout.',
      'The AEGIS Admiral now raises and stands down red alert through the guarded bridge command control, with civilian shelter instructions included in every active warning.',
    ],
  },
  {
    version: '0.2.17',
    changes: [
      'Active GMs can trigger unknown DRADIS contacts without a communications error.',
    ],
  },
  {
    version: '0.2.16',
    changes: [
      'Active GMs can trigger shared effects from any expanded DRADIS display, including ship and observer consoles.',
      'Automatic unknown contacts now arrive on a shared random cadence of 20 to 30 minutes.',
    ],
  },
  {
    version: '0.2.15',
    changes: [
      'Long sessions use less browser memory, and slow mobile connections no longer pile up repeated connection checks.',
      'DRADIS runs with less repeated work while preserving its full animation and effects.',
    ],
  },
  {
    version: '0.2.14',
    changes: [
      'The GM console now uses the ship-role layout, with fleet oversight in the main workspace and DRADIS in a separate instrument rail.',
    ],
  },
  {
    version: '0.2.13',
    changes: [
      'The AEGIS Admiral can raise a fleetwide red alert that scrolls across every console until stood down.',
      'Standing down replaces the warning with two passes of the cancellation broadcast.',
    ],
  },
  {
    version: '0.2.12',
    changes: [
      'Wolf assignments now lock their checked roles in Setup and can be reset when the table needs a new selection.',
    ],
  },
  {
    version: '0.2.11',
    changes: [
      'Maintenance cycle commands now use the same clear, framed controls as the rest of the ship console.',
    ],
  },
  {
    version: '0.2.10',
    changes: [
      'Fleet DRADIS displays now receive sparse, shared ambient contacts that travel on precise vectors and identify only after a qualifying scan.',
    ],
  },
  {
    version: '0.2.9',
    changes: [
      'Maintenance cycle starts and completions now appear in the GM event log.',
      'The GM console flags any maintenance cycle still incomplete after five minutes.',
    ],
  },
  {
    version: '0.2.8',
    changes: [
      'You can now read what changed without leaving your session. Open Settings and choose View changelog.',
      'Release notes stay inside a compact scrolling panel, even as the history grows.',
    ],
  },
  {
    version: '0.2.7',
    changes: [
      'On phones and short landscape displays, ship-console content now starts below the compact DRADIS instead of overlapping it when session controls wrap.',
    ],
  },
  {
    version: '0.2.6',
    changes: [
      'Fleet engineers can run maintenance cycles, resolve checks in order, and track each ship’s damage deck.',
      'Ship consoles now show clearer damage and maintenance status during play.',
    ],
  },
  {
    version: '0.2.5',
    changes: [
      'GM ship-number controls share one clear write lock, helping prevent accidental changes to resources, population, and unrest.',
    ],
  },
  {
    version: '0.2.4',
    changes: [
      'The session header shows both GM and command rank when one player is filling both duties.',
    ],
  },
  {
    version: '0.2.3',
    changes: [
      'GMs can inspect a ship’s damage cards from role and observer views while cards remain concealed at rest.',
    ],
  },
  {
    version: '0.2.2',
    changes: [
      'Compact DRADIS displays no longer crowd the plot with galactic coordinates.',
    ],
  },
  {
    version: '0.2.1',
    changes: [
      'Joined ship consoles identify their fleet origin, nation, and abbreviation at a glance.',
    ],
  },
  {
    version: '0.2.0',
    changes: [
      'Shuttle crews can see their docking history, including their current berth and previous movements.',
    ],
  },
];
