# Unfinished prompt dependency audit (2026-09-12)

This bounded audit covers every catalog row whose status is not `done` at the audit baseline. The JSON catalog remains authoritative; the generated dependency and plan views are projections.

Baseline coverage: 626 unfinished prompts (747 total; 121 done). Outcomes: 532 added, 26 existing-correct, 58 unchanged, 10 uncertain.

Release reconciliation: Prompt 104 is now complete in 0.3.46, leaving 625 currently unfinished prompts (122 of 747 complete). Its completion evidence and release record are preserved alongside the audited prerequisites. The table below retains the historical audit baseline.

Method: inspect each acceptance/description, existing typed dependency evidence, neighboring producer/consumer contracts, and the current source surface where needed. Hard edges mean the consumer cannot implement its acceptance against the named producer contract; `relatedConsumes` is navigation context and never blocks readiness. Ranges use only canonical numeric prompt IDs. No universal serial chain was added.

P100 correction: the catalog contains concrete producer prompts for transfer (113), scouting (321), and research (211/212), while the current source already contains movement and jump Coordination gating in `actionMetadata.ts`/`jumpShip`. P100 now records those producer IDs as hard prerequisites; no fabricated prompt IDs were added.

| Prompt | Status | Outcome | Hard prerequisites | Related/consumes | Audit basis |
| --- | --- | --- | --- | --- | --- |
| 020a | missing | existing-correct | 020;074-081;177;287-304 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 031a | missing | existing-correct | 030;031;032;034 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 100 | partial | added | 113;321;212 | none | Concrete transfer, scouting, and research producer prompts are 113, 321, and 212 (which consumes tracks 211); movement and jump gates already exist. |
| 103a | missing | existing-correct | 091-096;098;101-103;106b;108-109;154-158 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 104 | missing | added | 078;103 | none | Final-turn evaluation consumes the configured turn limit and committed next-turn/phase transition. |
| 105 | partial | added | 077;485 | none | Terminal pursuit evaluation consumes initial pursuit and the authoritative pursuit state. |
| 106a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 106c | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 107 | missing | uncertain | none | none | Split-fleet clock policy is an owner/product decision; no implementation prerequisite is implied. |
| 110 | missing | added | 103 | none | The two-turn proof consumes the committed next-turn transition. |
| 111 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 112 | missing | added | 111 | none | A trade needs the authoritative typed resource ledgers. |
| 113 | missing | added | 111;164;361 | none | Shuttle transfer needs typed ledgers, cargo allowlists, and authoritative craft manifest/dock state. |
| 114 | missing | added | 161;162 | none | Maintenance order is defined by the registered vessel and printed statistics. |
| 116 | missing | added | 117;162 | none | Ration selection needs the recorded wording decision and printed vessel tables. |
| 117 | missing | uncertain | none | none | Ration wording is an owner/source decision; implementation rows must not guess the interpretation. |
| 118 | missing | added | 116;162 | none | Population table switching consumes the ration selection and printed thresholds. |
| 119 | missing | added | 111;116;117 | none | The unrest check consumes typed resources, both ration choices, and their recorded interpretation. |
| 120 | missing | added | 119;130 | none | Riot resolution consumes the authoritative unrest result and common damage draw. |
| 121 | missing | added | 114;120 | none | Small-ship maintenance exceptions extend the ordered maintenance and riot paths. |
| 122a | missing | existing-correct | 122-125;128;138 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 123 | missing | added | 122;162 | none | Damaged Reactor penalties extend the capacity contract and printed vessel values. |
| 124 | missing | added | 122 | none | Reactor upgrades extend the base capacity contract. |
| 125 | missing | added | 122;138 | none | Charge eligibility uses Reactor capacity and atomic maintenance authority. |
| 126 | missing | added | 127;361 | none | The two-bay behavior consumes the ordinary bay and authoritative craft-manifest contracts. |
| 127 | missing | added | 361 | none | Single-bay fuelling resolves against the authoritative shuttle manifest. |
| 128 | missing | added | 103 | none | Expiry is applied at the authoritative turn rollover. |
| 129 | missing | added | 127 | none | The denial surface consumes the single-bay eligibility result. |
| 130 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 131 | missing | added | 130 | none | Empty-deck destruction is the terminal branch of the common damage draw. |
| 134 | missing | added | 118 | none | The threshold alert consumes the authoritative population-dependent ration table. |
| 135 | missing | added | 119;120 | none | Population-zero unrest extends the unrest and riot transition path. |
| 136 | missing | added | 119 | none | Mutiny consumes authoritative unrest state; population-zero unrest is a separate consequence. |
| 137 | missing | added | 136 | none | Replacement-captain recovery consumes the authoritative mutiny state. |
| 140 | missing | added | 114;171;183;194;204;216;224;235;241;242;246;250;571 | none | The all-vessel matrix needs ordered maintenance plus each core, small-ship, Voyage 33-0, and Capybara maintenance producer. |
| 140a | missing | added | 111;164;361 | none | Evacuation transfers need typed ledgers, cargo permissions, and the craft manifest. |
| 140b | missing | added | 140a | none | Destination capacity is checked within the evacuation transfer contract. |
| 140c | missing | added | 140a;140b | none | Retry safety composes evacuation transfer and capacity decisions. |
| 140d | missing | added | 131 | none | Escape pods are created from the authoritative ship-destruction flow. |
| 140e | missing | added | 140d | none | Escape state follows durable pod creation. |
| 140f | missing | added | 140d;361 | none | Retained craft state follows destruction and the authoritative manifest. |
| 140g | missing | added | 140d;111 | none | Scavenging follows destruction and typed resource reconciliation. |
| 142 | missing | added | 141;361 | none | Team-start docking consumes normal airspace and the craft manifest. |
| 143 | missing | added | 361 | none | Holder and dock identity are fields of the authoritative craft manifest. |
| 144 | missing | added | 141;143 | none | A legal shuttle move needs open airspace and holder/dock authority. |
| 145 | missing | added | 141 | none | Wolf locking extends the existing normal airspace contract. |
| 146 | missing | uncertain | none | none | Nearest-host tie handling is an owner/product decision; consumers should wait for the recorded policy. |
| 147 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 148 | missing | added | 145 | none | Post-attack parking follows the authoritative Wolf lock. |
| 149 | missing | added | 143 | none | Quarantine docking consumes holder and host identity. |
| 150 | missing | added | 149 | none | Quarantine reset protection extends the per-turn docking limit. |
| 151 | missing | added | 286 | none | Split-fleet communication scope needs authoritative fleet-group identity. |
| 152 | missing | added | 337;338 | none | Shuttle-state redaction consumes the group-local roster and cross-group denial contracts. |
| 153 | missing | added | 143;336 | none | Cross-group docking needs holder/dock authority and an authoritative split. |
| 154 | missing | added | 142;141;145;149;336;414 | none | Airspace transition proof also needs Team-start docking and the mission-overrun restriction producer. |
| 155 | missing | added | 154 | none | Status announcements follow the committed airspace state machine. |
| 156 | missing | added | 154 | none | Movement reopens only from the committed airspace state machine. |
| 157 | missing | added | 145 | none | Attack overrun behavior extends the authoritative attack lock. |
| 158 | missing | added | 154 | none | Reconnect during restriction consumes the authoritative airspace state. |
| 159 | missing | added | 140;145;156;373 | none | The start-to-airspace proof composes the vessel matrix, attack lock, movement reopening, and actual craft parking producer. |
| 160 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 161 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 162 | missing | added | 161 | none | Printed statistics belong to a registered vessel definition. |
| 163 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 164 | missing | added | 161;162 | none | Cargo permissions are typed by registered vessels and their printed statistics. |
| 165 | missing | added | 161;162 | none | Console metadata is attached to registered vessel and printed-system definitions. |
| 166 | missing | added | 161;165 | none | Role action binding consumes vessel and console metadata. |
| 167 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 168 | missing | uncertain | none | none | Vessel-rule ambiguity is a source/facilitator decision; no source-backed edge is available. |
| 169 | missing | added | 161;162;165 | none | Shared fixtures exercise the common vessel and console contracts. |
| 170 | missing | added | 048;049 | none | Observer-safe projections extend the existing observer entry and reset contracts. |
| 171 | missing | added | 114;161;162 | none | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| 172 | missing | added | 130;161;162 | none | Armoured Hull behavior consumes common damage draws and vessel data. |
| 173 | missing | added | 115 | none | Each Storage lane extends the existing damaged-Storage contract. |
| 174 | missing | added | 122;125 | none | Each Reactor lane consumes capacity and charge eligibility. |
| 175 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 176 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 178 | missing | added | 161;162;262 | none | Construction Bay uses vessel data and the registered fighter-wing state. |
| 179 | missing | added | 166 | none | Role workspaces consume authoritative role-to-action binding. |
| 180 | missing | added | 166;182 | none | Executive Officer actions consume role binding and AEGIS combat-console registration. |
| 181 | missing | added | 166;260;262 | none | Wing Commander workspace consumes role binding and the registered scouting/fighter craft. |
| 182 | missing | added | 165 | none | Combat-console registration extends shared console metadata. |
| 183 | missing | added | 161;162 | none | Dione roster gating consumes vessel registration and printed capacity/population data. |
| 184 | missing | added | 116;118 | none | Dione ration thresholds consume the common ration and population-table contracts. |
| 185 | missing | added | 115;183 | none | Dione Storage consumes damaged-Storage behavior and Dione roster identity. |
| 186 | missing | added | 122;125 | none | Each Reactor lane consumes capacity and charge eligibility. |
| 187 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 188 | missing | added | 122;125;183 | none | Dione production consumes Reactor eligibility and Dione identity. |
| 189 | missing | added | 122;125;183 | none | Dione production consumes Reactor eligibility and Dione identity. |
| 190 | missing | added | 167 | none | Private VIP ownership uses the standard authoritative action envelope. |
| 191 | missing | added | 119;190 | none | The VIP reroll consumes the unrest roll and private card ownership. |
| 192 | missing | added | 182;264 | none | Dione fighter-bay gating consumes combat registration and Maliades craft identity. |
| 193 | missing | added | 166 | none | Role workspaces consume authoritative role-to-action binding. |
| 193a | missing | added | 166;183 | none | Dione Engineer actions consume role binding and Dione identity. |
| 193b | missing | added | 166;183 | none | President actions consume role binding and Dione identity. |
| 194 | missing | added | 114;161;162 | none | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| 195 | missing | added | 115 | none | Each Storage lane extends the existing damaged-Storage contract. |
| 196 | missing | added | 122;125 | none | Each Reactor lane consumes capacity and charge eligibility. |
| 197 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 198 | missing | added | 114;122;125;194 | none | Icebreaker production consumes ordered maintenance, Reactor eligibility, and Icebreaker identity. |
| 199 | missing | added | 114;122;125;194 | none | Icebreaker production consumes ordered maintenance, Reactor eligibility, and Icebreaker identity. |
| 200 | missing | added | 114;122;125;194 | none | Icebreaker production consumes ordered maintenance, Reactor eligibility, and Icebreaker identity. |
| 201 | missing | added | 177;287-304 | none | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| 202 | missing | added | 201 | none | Ram Scoop uses the authoritative Icebreaker jump result. |
| 203 | missing | added | 166 | none | Role workspaces consume authoritative role-to-action binding. |
| 203a | missing | added | 166;194;361 | none | Icebreaker Engineer actions consume role, vessel, and craft contracts. |
| 203b | missing | added | 166;194;265;388 | none | Miner workspace consumes role, vessel, Highwall, and mining contracts. |
| 204 | missing | added | 114;161;162 | none | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| 205 | missing | added | 115 | none | Each Storage lane extends the existing damaged-Storage contract. |
| 206 | missing | added | 122;125 | none | Each Reactor lane consumes capacity and charge eligibility. |
| 207 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 208 | missing | added | 122;125;204 | none | Shepherd production consumes Reactor eligibility and Shepherd identity. |
| 209 | missing | added | 122;125;204 | none | Shepherd production consumes Reactor eligibility and Shepherd identity. |
| 210 | missing | added | 177;287-304 | none | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| 211 | missing | added | 165;204;267 | none | Research tracks consume console metadata, Shepherd identity, and Endeavour registration. |
| 212 | missing | added | 211 | none | Research cadence consumes the research-track contract. |
| 213 | missing | added | 211 | none | Endeavour devices consume research-track state. |
| 214 | missing | added | 211 | none | Endeavour devices consume research-track state. |
| 215 | missing | added | 166 | none | Role workspaces consume authoritative role-to-action binding. |
| 215a | missing | added | 166;204;361 | none | Shepherd Engineer actions consume role, vessel, and craft contracts. |
| 215b | missing | added | 166;204;211;321 | none | Scientist workspace consumes role, vessel, research, and scout-entitlement contracts. |
| 216 | missing | added | 114;161;162 | none | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| 217 | missing | added | 115 | none | Each Storage lane extends the existing damaged-Storage contract. |
| 218 | missing | added | 122;125 | none | Each Reactor lane consumes capacity and charge eligibility. |
| 219 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 220 | missing | added | 122;125;216 | none | Quellon production consumes Reactor eligibility and Quellon identity. |
| 221 | missing | added | 122;125;216 | none | Quellon production consumes Reactor eligibility and Quellon identity. |
| 222 | missing | added | 177;287-304 | none | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| 223 | missing | added | 166 | none | Role workspaces consume authoritative role-to-action binding. |
| 223a | missing | added | 166;216;361 | none | Quellon Engineer actions consume role, vessel, and craft contracts. |
| 223b | missing | added | 166;216;269;321 | none | Explorer workspace consumes role, vessel, Hummingbird, and scout-entitlement contracts. |
| 224 | missing | added | 114;161;162 | none | Each full-ship maintenance lane consumes ordered maintenance, vessel registration, and printed statistics. |
| 225 | missing | added | 115 | none | Each Storage lane extends the existing damaged-Storage contract. |
| 226 | missing | added | 122;125 | none | Each Reactor lane consumes capacity and charge eligibility. |
| 227 | missing | added | 127;361 | none | Each shuttle-bay lane consumes single-bay eligibility and the craft manifest. |
| 228 | missing | added | 122;125;224 | none | Refinery production consumes Reactor eligibility and Refinery identity. |
| 229 | missing | added | 122;125;224 | none | Refinery production consumes Reactor eligibility and Refinery identity. |
| 230 | missing | added | 122;125;224 | none | Refinery production consumes Reactor eligibility and Refinery identity. |
| 231 | missing | added | 182;273 | none | Refinery fighter-bay gating consumes combat registration and the PDF wing identity. |
| 232 | missing | added | 177;287-304 | none | Each vessel jump audit extends the existing AEGIS/common jump contract. |
| 233 | missing | added | 166 | none | Role workspaces consume authoritative role-to-action binding. |
| 233a | missing | added | 166;224;361 | none | Refinery Engineer actions consume role, vessel, and craft contracts. |
| 233b | missing | added | 166;224;273 | none | PDF Colonel workspace consumes role, vessel, and Escort Wing contracts. |
| 234 | missing | added | 161;162;111;141 | none | Small-ship rules consume vessel/ledger definitions and normal airspace. |
| 234a | missing | uncertain | none | none | Extra-role balancing is facilitator guidance and does not authorize an automatic attack rule. |
| 235 | missing | added | 234;161;162 | none | Small-ship identity lanes consume shared small-ship rules and printed vessel data. |
| 236 | missing | added | 234;287-304 | none | Small-ship jump lanes consume small-ship identity and the common jump contract. |
| 237 | missing | added | 234;402 | none | Mission support consumes small-ship identity and the mission deck. |
| 238 | missing | added | 234;361 | none | Small-ship repair actions consume small-ship identity and craft authority. |
| 239 | missing | added | 234;165 | none | Small-ship combat registration consumes shared small-ship and console metadata. |
| 240 | missing | added | 234;165 | none | Small-ship combat registration consumes shared small-ship and console metadata. |
| 241 | missing | added | 234;161;162 | none | Small-ship identity lanes consume shared small-ship rules and printed vessel data. |
| 241a | missing | added | 234;287-304 | none | Small-ship jump lanes consume small-ship identity and the common jump contract. |
| 241b | missing | added | 241;401 | none | Bulk haulage consumes Capybara identity and mission eligibility. |
| 241c | missing | added | 241;164 | none | Capybara cargo transfer consumes Capybara identity and cargo permissions. |
| 241d | missing | added | 241;122;125 | none | Capybara production consumes identity and Reactor eligibility. |
| 241e | missing | added | 241;122;125 | none | Capybara fuel processing consumes identity and Reactor eligibility. |
| 242 | missing | added | 234;161;162 | none | Warrior identity consumes shared small-ship and printed vessel data. |
| 243 | missing | added | 242;402 | none | Warrior salvage consumes Warrior identity and the mission deck. |
| 244 | missing | added | 234;361 | none | Small-ship repair actions consume small-ship identity and craft authority. |
| 245 | missing | added | 242 | none | Warrior Salvage Drones consume Warrior identity. |
| 246 | missing | added | 234;161;162 | none | Small-ship identity lanes consume shared small-ship rules and printed vessel data. |
| 247 | missing | added | 246;182 | none | Vulcan combat consumes Vulcan identity and combat-console registration. |
| 248 | missing | added | 246;122;125 | none | Vulcan labour actions consume Vulcan identity and Reactor/charge eligibility. |
| 249 | missing | added | 525 | none | Voyage admission is a crisis-path outcome. |
| 250 | missing | added | 249;114 | none | Voyage maintenance consumes its admission and ordered maintenance. |
| 251 | missing | added | 249;287-304 | none | Voyage movement consumes its admission and common jump authority. |
| 252 | missing | added | 057;058 | none | Expansion mode consumes the existing mode-selection and expansion-roster contracts. |
| 253 | missing | added | 252;161;162 | none | Expansion identity consumes the mode gate and printed vessel data. |
| 254 | missing | added | 253;122;125 | none | Expansion consoles consume expansion identity and Reactor eligibility. |
| 255 | missing | added | 253;122;125 | none | Expansion consoles consume expansion identity and Reactor eligibility. |
| 256 | missing | added | 253;122;125 | none | Expansion consoles consume expansion identity and Reactor eligibility. |
| 257 | missing | added | 253;122;125 | none | Expansion consoles consume expansion identity and Reactor eligibility. |
| 258 | missing | added | 253;122;125 | none | Expansion consoles consume expansion identity and Reactor eligibility. |
| 259 | missing | added | 253;287-304 | none | Expansion jump audit consumes expansion identity and common jump authority. |
| 260 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 261 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 262 | missing | added | 161;162;165 | none | Fighter-wing registration consumes vessel, statistics, and console metadata. |
| 263 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 264 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 265 | missing | added | 161;162;164;388 | none | Highwall registration consumes vessel/cargo contracts and its mining action. |
| 266 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 267 | missing | added | 161;162;165 | none | Endeavour registration consumes vessel and console metadata. |
| 268 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 269 | missing | added | 161;162;321 | none | Hummingbird registration consumes vessel data and scout entitlements. |
| 270 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 271 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 272 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 273 | missing | added | 161;162;262 | none | PDF wing registration consumes vessel and fighter-wing contracts. |
| 274 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 275 | missing | added | 161;162 | none | Craft registration consumes the canonical vessel/statistics definitions. |
| 275b | missing | added | 275a | none | Dispatch Desk restoration consumes the optional Press station contract. |
| 276 | missing | added | 053;166 | none | Union assignment consumes the configured Union substitution and role binding. |
| 277 | missing | added | 053;166 | none | Union assignment consumes the configured Union substitution and role binding. |
| 278 | missing | added | 166;234 | none | Extra-ship Captain workspaces consume role binding and small-ship rules. |
| 279 | missing | added | 166;252 | none | Expansion role workspaces consume role binding and expansion mode. |
| 280 | missing | added | 060;166 | none | Replacement workspaces consume authoritative casting and role-action binding. |
| 281 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 282 | missing | added | 281 | none | Chart selection consumes the immutable chart graph. |
| 283 | missing | added | 281;282 | none | System codes consume the selected chart graph. |
| 284 | missing | added | 283;006 | none | Unknown-system redaction consumes chart lookup and projection authority. |
| 285 | missing | added | 281 | none | Per-ship position consumes the canonical graph nodes. |
| 286 | missing | added | 285 | none | Fleet-group identity is attached to authoritative ship positions. |
| 287 | missing | added | 281;285 | none | Jump distance consumes graph adjacency and current position. |
| 288 | missing | added | 162;287 | none | Jump cost consumes printed vessel statistics and distance. |
| 289 | missing | added | 177;287 | none | Jump readiness consumes the existing jump-drive contract and distance. |
| 290 | missing | added | 287;103 | none | Once-per-turn jump state consumes distance and turn transitions. |
| 291 | missing | added | 288;167 | none | Atomic fuel reservation consumes jump cost and request-envelope identity. |
| 292 | missing | unchanged | none | none | Coordinate shape can be validated before graph lookup or any jump mutation; no producer prerequisite is required. |
| 293 | missing | added | 281;282;285 | none | Printed reachability consumes selected graph and current position. |
| 294 | missing | added | 287-293 | none | Independent jump execution composes distance, cost, readiness, validation, reachability, and reservation. |
| 295 | missing | uncertain | none | none | Unprinted-coordinate integrity behavior names a chosen policy but does not identify a canonical decision prompt. |
| 296 | missing | added | 289;291 | none | Denials consume readiness and atomic fuel reservation. |
| 297 | missing | added | 289;294;130 | none | Damaged-drive randomness consumes jump authority and the common damage path. |
| 298 | missing | added | 289;124 | none | Upgrade behavior consumes jump readiness and authoritative upgrades. |
| 299 | missing | uncertain | none | none | Failed-jump damage routing names a chosen policy but does not identify a canonical decision prompt. |
| 300 | missing | added | 289;291 | none | Emergency jump consumes jump readiness and atomic fuel reservation. |
| 301 | missing | added | 291;294 | none | Concurrent jumps compose reservation and committed jump execution. |
| 302 | missing | added | 294;167 | none | Jump events consume committed execution and the standard action envelope. |
| 303 | missing | added | 289;294 | none | Jump-button truthfulness consumes readiness and committed jump state. |
| 304 | missing | added | 294;291;302 | none | Retry reconciliation consumes committed jump, reservation, and event identity. |
| 305 | missing | added | 103 | none | Pursuit rise occurs at the committed turn transition. |
| 306 | missing | added | 281;285;305 | none | Chart-depth reduction consumes graph distance, ship position, and pursuit timing. |
| 307 | missing | added | 286;305 | none | Split pursuit consumes group identity and pursuit transition. |
| 308 | missing | added | 306 | none | Location exceptions consume chart-depth pursuit calculation. |
| 309 | missing | added | 306 | none | Location exceptions consume chart-depth pursuit calculation. |
| 310 | missing | added | 313;315 | none | Repeatable system missions consume history and first-arrival eligibility. |
| 311 | missing | added | 313;315 | none | Repeatable system missions consume history and first-arrival eligibility. |
| 312 | missing | added | 283;313 | none | Outpost pressure consumes system identity and persisted history. |
| 313 | missing | added | 281;283 | none | System history is keyed by canonical graph and system-code identity. |
| 314 | missing | added | 285 | none | Destroyed ships are removed from authoritative position state. |
| 315 | missing | added | 283;313 | none | First-arrival eligibility consumes system identity and history. |
| 316 | missing | added | 313;315 | none | Arrival idempotency composes history and mission eligibility. |
| 317 | missing | added | 114;313 | none | Environmental maintenance uses ordered maintenance and authoritative location history. |
| 318 | missing | added | 313 | none | Candidate discovery consumes persisted system history. |
| 319 | missing | added | 318 | none | Turn 6 planning consumes candidate discovery. |
| 320 | missing | added | 281;282;294;313;316 | none | The jump-and-system proof composes chart, jump, history, and arrival contracts. |
| 321 | missing | added | 260;267;269;280 | none | Scout entitlements consume the registered eligible craft and replacement role. |
| 322 | missing | added | 321;177 | none | Starlight scan consumes scout entitlement and AEGIS position authority. |
| 323 | missing | added | 321;322 | none | The second scan consumes entitlement and the first-scan contract. |
| 324 | missing | added | 321;216 | none | Hummingbird scan consumes entitlement and Quellon identity. |
| 325 | missing | added | 321;267 | none | Endeavour scan consumes entitlement and Endeavour identity. |
| 326 | missing | added | 321;280;177 | none | Comms Officer scan consumes entitlement, replacement role, and AEGIS position. |
| 327 | missing | added | 321;285 | none | Scout range consumes entitlement and current authoritative position. |
| 328 | missing | added | 321;327;006 | none | Private scout results consume entitlement/range and projection authority. |
| 329 | missing | added | 283;328 | none | Facilitator reveal consumes chart lookup and private scout result state. |
| 330 | missing | added | 313;328 | none | Discovery notes consume history and private scout results. |
| 331 | missing | added | 167;328;330 | none | Scouting audit consumes action identity, result privacy, and persisted notes. |
| 332 | missing | added | 313;328 | none | Deep Nebula scan accumulation consumes history and private scout results. |
| 333 | missing | added | 332 | none | Hidden Nebula total consumes the accumulated private state. |
| 334 | missing | added | 315;313 | none | Exploration rewards consume arrival eligibility and history. |
| 335 | missing | added | 315;313 | none | Exploration rewards consume arrival eligibility and history. |
| 336 | missing | added | 285;286;294 | none | Partial arrival split consumes position, group, and committed jump state. |
| 337 | missing | added | 286;006 | none | Group-local roster consumes group identity and projection authority. |
| 338 | missing | added | 337 | none | Cross-group denial consumes the group-local roster. |
| 339 | missing | added | 337 | none | Cross-group denial consumes the group-local roster. |
| 340 | missing | added | 337;339 | none | Local Coordination messaging consumes local roster and cross-group denial. |
| 341 | missing | added | 337;099 | none | Group-local Team actions consume the group projection and existing Team action metadata. |
| 342 | missing | added | 336;337 | none | Audience-scoped announcements consume split and group projection. |
| 343 | missing | added | 321;336 | none | Scout taxi consumes scout entitlement and split state. |
| 344 | missing | added | 343 | none | Taxi fuel and illegal-route denial extend scout taxi authority. |
| 345 | missing | added | 343 | none | Taxi fuel and illegal-route denial extend scout taxi authority. |
| 346 | missing | added | 285;336 | none | Rejoin eligibility consumes current position and split state. |
| 347 | missing | added | 346 | none | Membership merge consumes rejoin eligibility. |
| 348 | missing | uncertain | none | none | Rejoined pursuit combination is a product/facilitator decision; no rule is invented here. |
| 349 | missing | added | 339;347 | none | Communication restoration follows denial and committed merge. |
| 350 | missing | added | 346;347 | none | Split/rejoin retries compose eligibility and merge identity. |
| 351 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 352 | partial | added | 294 | none | Transit presentation consumes authoritative jump departure state. |
| 353 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 354 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 355 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 356 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 357 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 358 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 359 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 360 | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 361 | missing | added | 161;162 | none | The craft manifest is typed by vessel and printed statistics. |
| 362 | missing | added | 361 | none | Control transfer consumes the craft manifest. |
| 363 | missing | added | 361;362 | none | Holder-based docking consumes manifest and current-holder authority. |
| 364 | missing | added | 142;361 | none | Team-start docking consumes Team docking and manifest authority. |
| 365 | missing | added | 141;363 | none | Departure consumes open airspace and holder-based docking. |
| 366 | missing | added | 365 | none | Transit begins from an authorized departure. |
| 367 | missing | added | 366;313 | none | Arrival consumes transit state and persisted visit history. |
| 368 | missing | added | 366 | none | Retargeting consumes authoritative transit state. |
| 369 | missing | added | 361;363 | none | Shuttle fuelling consumes manifest and host/dock authority. |
| 370 | missing | added | 369;128 | none | Shuttle-fuel expiry consumes fuelling state and rollover expiry. |
| 371 | missing | added | 145;146;366 | none | Restriction parking consumes attack lock, tie policy, and transit state. |
| 372 | missing | added | 145;275a | none | The SNN exception consumes the airspace restriction and optional Press station. |
| 373 | missing | added | 145;147 | none | Attack parking consumes airspace lock and combat-capability filtering. |
| 374 | missing | added | 130;373 | none | Shuttle damage immunity is evaluated alongside damage draws and attack parking. |
| 375 | missing | added | 361;369 | none | Ordinary bay capacity consumes manifest and fuelling eligibility. |
| 376 | missing | added | 126;369 | none | AEGIS bay capacity consumes dual-bay and fuelling contracts. |
| 377 | missing | added | 164;361;363 | none | Cargo transfer consumes permissions, manifest, and dock authority. |
| 378 | missing | added | 377 | none | Security semantics and invalid-move denial extend cargo transfer. |
| 379 | missing | added | 377 | none | Security semantics and invalid-move denial extend cargo transfer. |
| 380 | missing | added | 365;366;367 | none | Movement conflict recovery consumes departure, transit, and arrival states. |
| 381 | missing | added | 263;361 | none | Philia repair consumes craft registration and manifest authority. |
| 382 | missing | added | 266;361 | none | Blacksmith repair consumes craft registration and manifest authority. |
| 383 | missing | added | 271;361 | none | Chacau repair consumes craft registration and manifest authority. |
| 384 | missing | added | 275;361 | none | Ally repair consumes craft registration and manifest authority. |
| 385 | missing | added | 361;377 | none | Dismantling consumes manifest and permissioned cargo/action authority. |
| 386 | missing | added | 361;369 | none | Service recharge consumes manifest and fuelling eligibility. |
| 387 | missing | added | 386 | none | Immediate effects follow committed recharge. |
| 388 | missing | added | 265;111 | none | Highwall mining consumes craft identity and typed resource ledgers. |
| 389 | missing | added | 265;426 | none | Highwall combat consumes craft identity and attack composition. |
| 390 | missing | added | 269;111 | none | Hummingbird harvesting consumes craft identity and typed ledgers. |
| 391 | missing | added | 267;165;124 | none | Endeavour upgrades consume craft identity, console metadata, and upgrade authority. |
| 392 | missing | added | 401 | none | Craft mission bonuses consume mission eligibility and contribution identity. |
| 393 | missing | added | 401 | none | Craft mission bonuses consume mission eligibility and contribution identity. |
| 394 | missing | added | 261;466 | none | Pallas boarding support consumes craft identity and boarding defence. |
| 395 | missing | added | 272;466 | none | Chepu boarding support consumes craft identity and boarding defence. |
| 396 | missing | added | 262;182 | none | Fighter state consumes wing registration and combat-console registration. |
| 397 | missing | added | 264;182 | none | Maliades state consumes craft and combat-console registration. |
| 398 | missing | added | 273;182 | none | PDF wing state consumes wing and combat-console registration. |
| 399 | missing | added | 253;164 | none | Capybara craft actions consume expansion identity and cargo permissions. |
| 400 | missing | added | 253;164 | none | Capybara craft actions consume expansion identity and cargo permissions. |
| 401 | missing | added | 315;361 | none | Mission eligibility consumes first-arrival state and craft manifest. |
| 402 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 403 | missing | added | 402 | none | Private card dealing consumes the authoritative mission deck. |
| 404 | missing | added | 403 | none | Private card operations consume private initial hands. |
| 405 | missing | added | 403 | none | Private card operations consume private initial hands. |
| 406 | missing | added | 403 | none | Private card operations consume private initial hands. |
| 407 | missing | added | 403;405 | none | Opportunity assignment consumes private hands and request state. |
| 408 | missing | added | 402 | none | Facilitator cards consume the mission deck. |
| 409 | missing | added | 407;408 | none | Opportunity totals consume player and facilitator card assignments. |
| 410 | missing | added | 409 | none | Bonus, empty, and critical branches consume opportunity totals. |
| 411 | missing | added | 409 | none | Bonus, empty, and critical branches consume opportunity totals. |
| 412 | missing | added | 409 | none | Bonus, empty, and critical branches consume opportunity totals. |
| 413 | missing | added | 409 | none | Rewards and overruns consume resolved opportunity totals. |
| 414 | missing | added | 409 | none | Rewards and overruns consume resolved opportunity totals. |
| 415 | missing | added | 413 | none | Oversized drop-off consumes mission custody. |
| 416 | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 416a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 416b | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 417 | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 417a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 417b | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 418 | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 418a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 418b | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 419 | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 420 | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 421 | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 421a | missing | added | 281;283 | none | Mission-system entries consume the canonical graph and code registry. |
| 422 | missing | added | 401;409;415;410;411;412;414;622 | none | Away-mission proof composes eligibility, totals, reward custody, bonus/failure branches, overrun custody, and mission reconnect. |
| 423 | missing | added | 361;367;371;373;352;353;368;377;156;380 | none | Shuttle-airspace proof composes manifest, arrival, parking, attack parking, transit/contact presentation, retarget, transfer, reopen, and conflict reconciliation. |
| 424 | missing | added | 336;337;328;347;338;339;343;401;409;307 | none | Split-fleet proof composes split/roster state, scouting, jump, privacy, communications, scout taxi, mission eligibility/totals, and group-isolated pursuit. |
| 425 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 426 | missing | added | 425 | none | Attack composition consumes the Wolf ship catalog. |
| 427 | missing | added | 426 | none | Private attack preparation consumes attack composition. |
| 428 | missing | added | 425;426 | none | Combat math consumes Wolf catalog and composition. |
| 429 | missing | added | 425;428 | none | Targeting consumes Wolf catalog and centralized combat math. |
| 430 | missing | added | 425;428 | none | Targeting consumes Wolf catalog and centralized combat math. |
| 431 | missing | added | 425;428 | none | Targeting consumes Wolf catalog and centralized combat math. |
| 432 | missing | added | 427;428 | none | Atomic attack declaration consumes prepared composition and combat math. |
| 432a | missing | added | 432 | none | GM attack operation consumes the declared attack state. |
| 433 | missing | added | 432 | none | Audience projection consumes declared attack state. |
| 433a | missing | added | 432;433 | none | The stable DRADIS attack contract consumes declared and projected attack state. |
| 433b | missing | added | 433 | none | Affected-console choices consume audience-safe attack projection. |
| 434 | missing | added | 432 | none | Attack retry safety consumes atomic declaration. |
| 434a | missing | added | 432a;434 | none | Intervention consumes GM operation and retry-safe attack state. |
| 435 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 436 | missing | existing-correct | none | 435 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 437 | missing | added | 426;428;240 | none | Force-field timing consumes composition/math and the registered projector. |
| 438 | missing | added | 432;428 | none | Range resolution consumes declared attack and combat math. |
| 439 | missing | added | 432;428 | none | Range resolution consumes declared attack and combat math. |
| 440 | missing | added | 432;428 | none | Range resolution consumes declared attack and combat math. |
| 441 | missing | added | 438;439;440 | none | Five-step order consumes the three range resolvers. |
| 442 | missing | added | 438;439;440;130 | none | Destruction effects consume range resolution and damage draws. |
| 443 | missing | added | 440;396 | none | Short-range fighter priority consumes short-range order and fighter state. |
| 444 | missing | added | 441;442 | none | Range audit consumes ordered resolution and destruction effects. |
| 445 | missing | added | 441;182 | none | AEGIS missile actions consume attack order and combat-console registration. |
| 446 | missing | added | 445 | none | Enriched warheads extend missile-launcher authority. |
| 447 | missing | added | 441;182 | none | AEGIS missile actions consume attack order and combat-console registration. |
| 448 | missing | added | 441;182 | none | Point Defence consumes attack order and combat-console registration. |
| 449 | missing | added | 443;396 | none | Fighter launch consumes short-range priority and wing state. |
| 450 | missing | added | 449 | none | Fleet-fighter actions consume fighter launch authority. |
| 451 | missing | added | 449 | none | Fleet-fighter actions consume fighter launch authority. |
| 452 | missing | added | 449 | none | Fleet-fighter actions consume fighter launch authority. |
| 453 | missing | added | 264;397 | none | Maliades combat consumes craft and Maliades state. |
| 454 | missing | added | 265 | none | Highwall combat consumes Highwall craft identity. |
| 455 | missing | added | 239;441 | none | Gorgoneion missiles consume registration and attack order. |
| 456 | missing | added | 273;449 | none | PDF launch consumes wing registration and fighter launch authority. |
| 457 | missing | added | 456 | none | PDF range actions consume PDF launch authority. |
| 458 | missing | added | 456 | none | PDF range actions consume PDF launch authority. |
| 459 | missing | added | 400;441 | none | Boa combat consumes craft identity and attack order. |
| 460 | missing | added | 399;466 | none | Macaw boarding consumes craft identity and boarding defence. |
| 461 | missing | added | 261;272;363 | none | Boarding relocation consumes craft identities and docking authority. |
| 462 | missing | added | 361;386 | none | Engineering support consumes manifest and service recharge. |
| 463 | missing | added | 394;395;428 | none | Boarding rerolls consume support actions and combat randomness. |
| 464 | missing | added | 435;466 | none | Commander boarding consumes rerolls and boarding defence. |
| 465 | missing | added | 426;428 | none | Assault Transport drop consumes composition and combat math. |
| 466 | missing | added | 378;465 | none | Security defence consumes team semantics and boarder drop. |
| 467 | missing | added | 466 | none | Boarder damage follows security defence. |
| 468 | missing | added | 466;280 | none | Militia defence consumes boarding defence and replacement-role identity. |
| 469 | missing | added | 442 | none | Wolf-ship destruction consumes range-specific destruction effects. |
| 469a | missing | added | 442 | none | Wolf-ship destruction consumes range-specific destruction effects. |
| 469b | missing | added | 442 | none | Wolf-ship destruction consumes range-specific destruction effects. |
| 469c | missing | added | 442 | none | Wolf-ship destruction consumes range-specific destruction effects. |
| 469d | missing | added | 442 | none | Wolf-ship destruction consumes range-specific destruction effects. |
| 469e | missing | added | 442 | none | Wolf-ship destruction consumes range-specific destruction effects. |
| 470 | missing | added | 469 | none | Surviving fighters follow Wolf-fighter destruction. |
| 471 | missing | added | 469e;442 | none | Battlestation immunity consumes its destruction branch and combat effects. |
| 472 | missing | added | 469d;470 | none | Strikecarrier bonus consumes destruction and surviving fighters. |
| 473 | missing | added | 469;130 | none | Surviving Wolf damage consumes destruction state and damage draws. |
| 474 | missing | added | 444;473 | none | Immediate result consumes range audit and surviving-ship damage. |
| 475 | missing | added | 130 | none | Common combat damage reuses the existing damage draw. |
| 476 | missing | added | 475 | none | Combat-deck exhaustion consumes common damage draw. |
| 477 | missing | added | 466;467 | none | Casualties consume boarding defence and boarder damage. |
| 478 | missing | added | 477;280 | none | Doctor mitigation consumes casualties and replacement-role identity. |
| 479 | missing | added | 242;477 | none | Warrior salvage consumes Warrior identity and casualties. |
| 480 | missing | added | 253;477 | none | Capybara Scrap consumes expansion identity and casualties. |
| 481 | missing | added | 399;400;480 | none | Macaw/Boa Scrap consumes craft actions and Scrap result. |
| 482 | missing | added | 475 | none | Post-attack repairs consume common damage state. |
| 483 | missing | added | 178;469;396 | none | Fighter rebuilding consumes construction, destruction, and wing state. |
| 484 | missing | added | 474;477;482 | none | Complete aftermath consumes result, casualties, and repairs. |
| 485 | missing | added | 077 | none | Authoritative pursuit starts from the server-owned initial pursuit. |
| 485a | missing | added | 485 | none | Pursuit color consumes authoritative pursuit state. |
| 486 | missing | added | 485;305 | none | Per-turn pursuit rise consumes authority and transition logic. |
| 487 | missing | added | 485;306 | none | Jump reduction consumes pursuit and chart-depth calculation. |
| 488 | missing | added | 485;306 | none | Pursuit exceptions consume authoritative pursuit calculation. |
| 489 | missing | added | 485;306 | none | Pursuit exceptions consume authoritative pursuit calculation. |
| 490 | missing | added | 485;307 | none | Split-group threat consumes pursuit and group isolation. |
| 491 | missing | added | 312 | none | Outpost/Fortress attacks consume arrival pressure. |
| 492 | missing | added | 312 | none | Outpost/Fortress attacks consume arrival pressure. |
| 493 | missing | added | 312 | none | Station attack consumes arrival pressure. |
| 494 | missing | added | 425;435 | none | Commander attack dial consumes Wolf catalog and reroll authority. |
| 495 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 496 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 497 | missing | added | 495;496 | none | Wolf action authorization consumes hidden loyalty assignment and the server-derived Wolf count. |
| 498 | missing | added | 497 | none | Wolf actions consume one-action-per-turn authorization. |
| 499 | missing | added | 497;111 | none | Supply sabotage consumes one-action authorization and typed resource ledgers. |
| 500 | missing | added | 497 | none | Wolf actions consume one-action-per-turn authorization. |
| 501 | missing | added | 497 | none | Wolf actions consume one-action-per-turn authorization. |
| 502 | missing | added | 497 | none | Wolf actions consume one-action-per-turn authorization. |
| 503 | missing | added | 497;167 | none | Wolf receipts consume action authorization and action envelopes. |
| 503a | missing | added | 497;498 | none | Hacking overlay consumes authorized Wolf action and sabotage state. |
| 504 | missing | added | 502;503 | none | Suspicion history consumes clue results and receipts. |
| 505 | missing | added | 280;501 | none | Investigation consumes replacement-role identity and private Wolf intelligence. |
| 506 | missing | added | 505;428 | none | Investigation randomness consumes investigator action and server randomness. |
| 507 | missing | added | 505;502 | none | Investigator suspicion consumes investigation and clue rolls. |
| 508 | missing | added | 214;506 | none | Detector tests consume the device and randomness ownership. |
| 509 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 510 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 511 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 512 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 513 | missing | added | 497 | none | Wolf actions consume one-action-per-turn authorization. |
| 514 | missing | added | 513;098 | none | Arrest deadline consumes posse calculation and idempotent expiry. |
| 515 | missing | added | 060;062 | none | Replacement role assignment consumes casting and pre-start reassignment. |
| 516 | missing | added | 515;326 | none | Comms Officer activation consumes replacement role and scout action. |
| 517 | missing | added | 515;190 | none | VIP Host activation consumes replacement role and VIP card ownership. |
| 518 | missing | added | 515 | none | Commissar activation consumes replacement role. |
| 519 | missing | added | 515;468 | none | Militia activation consumes replacement role and defence behavior. |
| 520 | missing | added | 515;456 | none | Fighter Ace activation consumes replacement role and PDF launch. |
| 521 | missing | added | 515;494 | none | Wolf Commander powers consume replacement role and attack dial. |
| 521a | missing | added | 521 | none | Commander address consumes Commander powers. |
| 521b | missing | added | 521a | none | Commander amnesty consumes the address state. |
| 522 | missing | added | 044;045 | none | Facilitator ownership consumes eligibility and GM instance authority. |
| 523 | missing | added | 522;167 | none | Facilitator calls consume ownership and action envelopes. |
| 523a | missing | added | 522 | none | Difficulty configuration consumes facilitator ownership. |
| 523b | missing | added | 522 | none | Difficulty configuration consumes facilitator ownership. |
| 523c | missing | added | 522 | none | Difficulty configuration consumes facilitator ownership. |
| 524 | missing | added | 485;497;522 | none | Wolf/deduction proof composes pursuit, Wolf actions, and facilitator ownership. |
| 524a | missing | added | 193b | none | Political capital consumes the President workspace. |
| 524b | missing | added | 524a | none | President address consumes political capital. |
| 524c | missing | added | 524b | none | Presidential visit consumes the address. |
| 524d | missing | added | 524c;044 | none | Presidential authority boundaries consume visit and eligibility. |
| 525 | missing | added | 008;522 | none | Crisis state machine consumes lifecycle state and facilitator ownership. |
| 526 | missing | added | 525 | none | Crisis configuration consumes the crisis state machine. |
| 527 | missing | added | 525 | none | Each crisis delivery consumes the crisis state machine. |
| 528 | missing | added | 527 | none | Approaching Vessel choices consume its delivered state. |
| 529 | missing | added | 249;527 | none | Voyage arrival consumes Voyage admission and crisis delivery. |
| 530 | missing | added | 525 | none | Each crisis delivery consumes the crisis state machine. |
| 531 | missing | added | 530;149 | none | Quarantine policy consumes Disease Outbreak and docking restrictions. |
| 532 | missing | added | 525 | none | Each crisis delivery consumes the crisis state machine. |
| 533 | missing | added | 532 | none | Zealotry response consumes its delivered crisis. |
| 534 | missing | added | 525 | none | Each crisis delivery consumes the crisis state machine. |
| 535 | missing | added | 534 | none | Civil Unrest resolution consumes its delivered crisis. |
| 536 | missing | added | 525 | none | Each crisis delivery consumes the crisis state machine. |
| 537 | missing | added | 536 | none | Election procedure consumes election delivery. |
| 538 | missing | added | 537 | none | Private election resolution consumes election procedure. |
| 539 | missing | added | 538;101 | none | Binding resolution announcement consumes private resolution and lifecycle announcement. |
| 540 | missing | added | 525;528;531;533;535;538 | none | Crisis proof composes the state machine and each resolved branch. |
| 541 | missing | added | 318;525 | none | Candidate reveal consumes discovery and crisis/session state. |
| 542 | missing | added | 541 | none | Candidate retry safety consumes candidate reveal. |
| 543 | missing | added | 541;319 | none | Candidate plans consume reveal and Turn 6 checkpoint. |
| 544 | missing | added | 541 | none | Ring prerequisites consume candidate state. |
| 545 | missing | added | 544;211;361;111 | none | Ring repair consumes prerequisites, research, craft, and materials. |
| 546 | missing | added | 545 | none | Contribution uniqueness consumes Ring repair state. |
| 547 | missing | added | 545;111 | none | Ring fuel consumes repair and typed ledgers. |
| 548 | missing | added | 546;547 | none | Ring passage consumes unique contributions and fuel. |
| 549 | missing | added | 548;485 | none | Blocked pursuit consumes passage and pursuit authority. |
| 550 | missing | added | 328;332 | none | Deep Nebula accumulation consumes private scouting and hidden scan state. |
| 551 | missing | added | 550;287-304 | none | Nebula jump consumes scouting threshold and common jump authority. |
| 552 | missing | added | 551;140d | none | Nebula loss consumes jump state and destruction/pod flow. |
| 553 | missing | added | 551;552 | none | Nebula threshold consumes attempts and loss state. |
| 554 | missing | added | 551;553 | none | Repeat prevention consumes Nebula attempt and threshold state. |
| 555 | missing | added | 493;432 | none | Station combat consumes station attack trigger and attack declaration. |
| 556 | missing | added | 555 | none | Repeat Station combat consumes the first combat state. |
| 557 | missing | added | 556 | none | Liberation consumes surviving Station combat. |
| 558 | missing | added | 557 | none | Station Reactor contributions consume liberation state. |
| 559 | missing | added | 558 | none | Station power consumes Reactor contributions. |
| 560 | missing | added | 105 | none | Pursuit-failure freeze consumes terminal failure state. |
| 561 | missing | added | 560 | none | Total-loss distinction consumes the frozen terminal state. |
| 562 | missing | added | 561;140e | none | Survivor outcomes consume total-loss evaluation and escape state. |
| 563 | missing | added | 562;541 | none | Candidate results consume survivors and candidate state. |
| 564 | missing | added | 563 | none | Debrief consumes resolved outcomes. |
| 565 | missing | added | 560;564 | none | Closure consumes terminal failure/debrief state. |
| 566 | missing | added | 565 | none | Debrief read access consumes authoritative closure. |
| 567 | missing | added | 252 | none | Capybara mode revalidation consumes expansion-mode gating. |
| 568 | missing | added | 163;567 | none | Scrap access consumes optional resource and Capybara mode. |
| 569 | missing | added | 567;253 | none | Capybara casting consumes mode and expansion identity. |
| 570 | missing | added | 569 | none | Capybara targeting consumes Capybara role/casting. |
| 571 | missing | added | 114;253;569 | none | Capybara maintenance consumes ordered maintenance, identity, and casting. |
| 572 | missing | added | 571 | none | Capybara thresholds consume maintenance state. |
| 573 | missing | added | 571;130 | none | Capybara damage consumes maintenance and common damage draws. |
| 574 | missing | added | 369;399 | none | Macaw refuelling consumes fuelling and Macaw identity. |
| 575 | missing | added | 399 | none | Macaw repairs consume Macaw identity. |
| 576 | missing | added | 385;575 | none | Macaw dismantling consumes permissioned dismantling and repairs. |
| 577 | missing | added | 164;377;399 | none | Macaw cargo consumes permissions, transfer, and craft identity. |
| 578 | missing | added | 400 | none | Boa recycling consumes Boa identity. |
| 579 | missing | added | 578 | none | Boa reclamation consumes recycling state. |
| 580 | missing | added | 459;578 | none | Boa combat consumes range action and recycling craft state. |
| 581 | missing | added | 573;577 | none | Scrap pickups consume damage and cargo state. |
| 582 | missing | added | 569;006 | none | Capybara objectives consume casting and private projection. |
| 583 | missing | added | 234a;569 | none | Capybara balance consumes facilitator dial and Capybara casting. |
| 584 | missing | added | 567;571;577;580 | none | Capybara proof composes mode, maintenance, cargo, and combat. |
| 585 | missing | added | 567;584 | none | Mode-isolation proof consumes mode and Capybara proof. |
| 586 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 587 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 588 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 589 | missing | added | 586 | none | Ground rules follow roster configuration. |
| 589a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 589b | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 590 | missing | added | 589 | none | Core-loop help consumes ground rules. |
| 591 | missing | added | 161;162;114 | none | Vessel help consumes vessel definitions and maintenance order. |
| 592 | missing | added | 361 | none | Craft help consumes the authoritative manifest. |
| 593 | missing | added | 541 | none | Candidate help consumes candidate state. |
| 594 | missing | added | 168 | none | Facilitator-decision labels consume the ambiguity ledger. |
| 595 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 596 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 597 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 598 | partial | added | 041;042 | none | Connectivity truth consumes local and queued disconnect contracts. |
| 599 | missing | added | 586;589 | none | Setup checklist consumes roster configuration and ground rules. |
| 600 | missing | added | 590;599 | none | Onboarding proof composes core-loop help and setup checklist. |
| 601 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 602 | partial | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 602a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 603 | missing | added | 361 | none | Narrow-console layout composes shared vessel/craft console data. |
| 604 | missing | added | 603 | none | Short-landscape maintenance extends narrow-console layout. |
| 605 | partial | added | 351 | none | Responsive DRADIS consumes the local-contact presentation contract; sampled transit remains a separate consumer. |
| 605a | missing | existing-correct | 433a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 606 | missing | added | 361;365;367 | none | Touch shuttle travel consumes manifest, departure, and arrival. |
| 607 | missing | added | 289;303 | none | Keyboard jump controls consume readiness and truthful jump presentation. |
| 608 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 609 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 610 | missing | added | 589a | none | Global motion behavior consumes the motion-safety gate. |
| 611 | missing | added | 601 | none | Non-color status extends universal status semantics. |
| 611a | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 612 | missing | added | 088;089 | none | Persisted resume consumes snapshot ordering and event replay. |
| 613 | missing | added | 612 | none | Invalid persisted-session clearing consumes snapshot hydration. |
| 614 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 615 | missing | added | 034;612 | none | Seat reclaim consumes resume and persisted snapshot state. |
| 616 | missing | added | 041;042 | none | Disconnect replay consumes local and queued disconnect contracts. |
| 617 | missing | added | 012;089 | none | Command outbox reconciliation consumes idempotency and replay. |
| 618 | missing | added | 084;085;086;612 | none | Projection reconnect consumes existing audience projections and hydration. |
| 619 | missing | added | 542;612 | none | Candidate retry reconnect consumes candidate retry and hydration. |
| 620 | missing | added | 014;088 | none | Stale revisions consume stale-snapshot semantics and ordering. |
| 621 | missing | added | 433;434;612 | none | Attack recovery consumes attack projection, retry, and hydration. |
| 622 | missing | added | 401;402;612 | none | Away-mission recovery consumes mission eligibility/deck and hydration. |
| 623 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 624 | missing | added | 623 | none | Service-worker update safety consumes deep-link behavior. |
| 625 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 626 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 627 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 628 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 629 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 630 | missing | added | 007;019;428 | none | Randomness proof consumes event/audit envelopes and centralized combat randomness. |
| 631 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 632 | missing | added | 015 | none | Payload rejection consumes the command-error taxonomy. |
| 633 | missing | added | 012;015 | none | Retry guidance consumes idempotency and error taxonomy. |
| 634 | missing | added | 019;630 | none | Security denial records consume audit and randomness/security proof. |
| 635 | missing | added | 007;019;167 | none | Action audit records consume event, privacy, and action-envelope contracts. |
| 636 | missing | added | 167 | none | Health measurement consumes standardized action envelopes. |
| 637 | missing | added | 009 | none | Render baselines consume deterministic fixtures. |
| 638 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 639 | missing | added | 636;638 | none | 60-browser exercise consumes health measurement and core capacity target. |
| 640 | missing | added | 638;639 | none | Capacity conclusions consume both target exercises. |
| 641 | missing | added | 159;320;422;524;540 | none | The base-game proof requires the foundation, jump/system, away-mission, Wolf, and crisis scenario proofs before it can pass. |
| 642 | missing | added | 584 | none | Capybara playthrough consumes the Capybara vertical scenario. |
| 643 | missing | added | 424 | none | Split-fleet playthrough consumes the split exploration proof. |
| 644 | missing | added | 423 | none | Shuttle-airspace playthrough consumes the shuttle-airspace proof. |
| 645 | missing | added | 524;484 | none | Wolf playthrough consumes Wolf/deduction and combat aftermath proofs. |
| 646 | missing | added | 422 | none | Away-mission playthrough consumes the away-mission proof. |
| 647 | missing | added | 548;559 | none | Jump Ring proof consumes passage and Station power. |
| 648 | missing | added | 554 | none | Deep Nebula proof consumes repeat-prevention state. |
| 649 | missing | added | 559 | none | Station proof consumes Station power. |
| 650 | missing | added | 560;565;621;622;140c;136;514 | none | Terminal recovery proof consumes failure/closure, attack recovery, mission recovery, evacuation retry, mutiny, and arrest-deadline producers. |
| 651 | missing | added | 641-650 | none | Final release-readiness audit requires every preceding release-proof prompt in the 641-650 closure set. |
| 652 | missing | added | 106c | none | Ticker overlap prevention consumes the server-authoritative ticker lifecycle. |
| 652a | missing | existing-correct | 106c;652 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 652b | missing | existing-correct | 106c;603a;652;652a | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 653 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 654 | missing | uncertain | none | none | The owner-approved zero-eligible-Wolf outcome remains a genuine milestone/decision gate already represented in the catalog. |
| 655 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 656 | missing | added | 034;050 | none | Launcher routing consumes session resume and established return paths. |
| 657 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 658 | missing | added | 030;050 | none | Seat-change copy consumes authoritative seat claim and return-path context. |
| 659 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 662 | missing | uncertain | none | 054;075;496;586-588 | Wolf designation policy remains owner-deferred and its existing related set is preserved. |
| 663 | missing | added | 106c | none | Fleetwide Red Alert presentation consumes server-authoritative ticker lifecycle. |
| 667 | missing | existing-correct | 665 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 668 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 669 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 670 | missing | existing-correct | 044;045;046 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 671 | missing | existing-correct | none | 668 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 672 | missing | added | 361;367 | none | Docking history consumes manifest and authoritative arrival history. |
| 673 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 674 | missing | existing-correct | 048;049;170;628 | none | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 675 | missing | existing-correct | 034;038;040;097;108 | 098 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 676 | missing | unchanged | none | none | No source-backed hard producer prerequisite or useful related consumer was identified; ordering remains milestone/sequence context. |
| 677 | missing | existing-correct | 084;284;313;330 | 328 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 678 | missing | existing-correct | 328;339;340;677 | 330;331 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 679 | missing | existing-correct | 281;282;285;294;304;677 | 283;313 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |
| 680 | missing | existing-correct | none | 178;262;396;449 | Existing hard/related fields match the acceptance and typed evidence; preserved unchanged. |

The audit intentionally leaves owner decisions and closure-only evidence as non-blocking context unless the catalog already defines a typed hard gate. Regenerate views after changing the catalog and validate with `npm run coordination:docs`, `npm run validate:dependencies`, and `git diff --check`.
