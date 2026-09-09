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
      'Crew maintenance updates now show the useful result without exposing private game information. — Roadmap progress: 77 of 723 prompts complete (10.65%).',
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
      'GMs can now safely retry an undo of the latest maintenance step during Team phase without duplicate effects, erasing damage, or changing maintenance history — Roadmap progress: 74 of 723 prompts complete (10.24%).',
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
      'Connected consoles now converge on one airspace opening and one authoritative turn handoff at each phase transition, so retries cannot replay either transition.',
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
      'Ordinary GM start now locks setup, writes audience-correct private results and a safe calculation receipt, and enters Turn 1 exactly once with pursuit 2 and the existing timer and announcement.',
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
      'Facilitators can now confirm one authoritative setup tuple for the settled 8–20 core roster, including chart, turn limit, Dione, Capybara, and ordered active roles.',
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
      'Connection indicators now say exactly CONNECTED before a session and NOT CONNECTED — AWAITING IRIS AUTHENTICATION only for a joined session before its first Turn 1 snapshot.',
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
      'Session setup rejects unsupported player counts, charts, expansions, turn limits, duplicate options, and malformed fields before creating state.',
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
      'The start transaction now initializes lifecycle, turn, phase, timers, ships, roles, resources, decks, pursuit, and the opening event together.',
      'Turn 1 now initializes one server-owned pursuit value at 2 for each initial fleet group.',
      'Sessions now lock the printed six-to-eight-turn limit and reject unsupported durations.',
      'Crew snapshots now expose permitted shared vessel state without another crew\'s private role or loyalty facts.',
      'Authorized facilitators can now regain census, suspicion, notes, and hidden resolution state while members remain denied.',
    ],
  },
  {
    version: '0.3.4',
    changes: [
      'Turn 0 status messages now say Awaiting Iris Authentication so players see the actual authentication gate.',
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
      'Turn Zero now keeps game-state controls locked while allowing DRADIS and console viewing, and a solo session can start the Turn One demo from Settings.',
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
      'Turn handoffs now clear unused console charges and shuttle fuel after Coordination Phase, keep overrunning missions and their docking state in place, and show the numbered successor turn with an AIRSPACE CLOSED, survivor, and OBJECTIVE // SURVIVE. transmission.',
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
      'GM Console now requires a second click to advance from Turn 0, while Skip to Turn 1 bypasses the fullscreen transmission and keeps its own wording independent.',
      'The former launcher hacking transmissions are restored as a future-ready capability, but remain disabled in the current opening experience until Wolf gameplay provides the context.',
    ],
  },
  {
    version: '0.2.85',
    changes: [
      'The Turn 1 traitor reveal now lingers longer for a clearer read, and the final survivors slide fades out more deliberately.',
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
      'Turn transmissions now close on one survivor-count beat before fading out, and the fleet survivor readout stays at the reduced total through the next turn transition.',
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
      'During Turn 0, the fleet ticker now warns that consoles remain locked out until Iris authentication is complete, then drops that bulletin when Turn 1 begins.',
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
      'The Turn 0 → Turn 1 transmission now gives its closing PEOPLE and SURVIVE. beats more room to land, removes the stray dash, and fades out over a full second.',
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
      'GM Console now keeps the normal Advance to Turn 1 command alongside the fast Skip to Turn 1 shortcut during setup.',
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
      'The Turn 0 → Turn 1 fleet transmission scan now travels all the way to the bottom edge of its instrument frame.',
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
      'The Turn 1 fleet transmission now delivers “There are traitors among us; that’s kind of sus” as one complete slide.',
      'GM Console now offers a Skip to Turn 1 control during setup so you can start a live debug session faster.',
    ],
  },
  {
    version: '0.2.61',
    changes: [
      'Turn transitions now arrive as a ruled fleet instrument, showing the exact handoff between turns, transmission progress, live survivor count, and the Wolf pursuit status inside the same CIC visual language as the rest of the console.',
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
      'The Turn 1 warning now identifies the Wolves and reveals “ARE TRAITORS.” in place after a tense pause.',
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
      'The Turn 0 connection light now reads “Connected, Awaiting Iris Authentication,” and the live Turn 1 briefing opens with “Iris Authentication Confirmed.”',
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
      'Live-turn instruments and shuttle procedures now say AIRSPACE RESTRICTED and AIRSPACE OPEN.',
      'SNN ticker lettering now has clear vertical room instead of clipping along its lower edge.',
    ],
  },
  {
    version: '0.2.43',
    changes: [
      'Turn 1 now delivers its opening fleet briefing as clear, individually timed messages, giving everyone time to read the situation before play begins.',
    ],
  },
  {
    version: '0.2.42',
    changes: [
      'The top-right connection light now shows blue “Connected, Awaiting Uplink” while Turn 0 systems boot, then returns to green when Turn 1 begins.',
    ],
  },
  {
    version: '0.2.41',
    changes: [
      'The session join prompt now stays focused on entering your code.',
    ],
  },
  {
    version: '0.2.40',
    changes: [
      'New games now begin at Turn 0: players can choose and inspect stations while gameplay waits for the GM to start Turn 1.',
      'Every live turn start now opens with a fleet transmission, including the current survivor count and a longer Turn 1 briefing.',
      'Turn 1 begins with 10 minutes of restricted airspace and 20 minutes of open airspace; later turns run 5 and 15 minutes. Airspace bulletins yield to the Press’s next dispatch.',
      'AEGIS can grant the Press an airspace exception from Systems control, and early GM turn advances now require a red confirmation.',
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
