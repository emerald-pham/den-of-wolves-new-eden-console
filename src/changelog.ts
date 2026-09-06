import { APP_VERSION } from './version';

export interface ChangelogEntry {
  readonly version: string;
  readonly changes: readonly string[];
}

/** Release notes written for the people playing and facilitating the game. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: APP_VERSION,
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
      'Maintenance is now limited to one cycle per ship each turn, with the turn shown on every maintenance start control.',
      'The GM console now shows the current turn and provides the authoritative control for advancing it.',
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
