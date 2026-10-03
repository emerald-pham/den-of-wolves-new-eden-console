# PC08 boarding assumptions and source routing

This note records the source decisions used for the connected opening boarding
and returning-Wing flow. The private source index and originals remain outside
Git; this file paraphrases rather than reproduces them.

## Printed rules routed to the assigned prompts

| Prompt IDs | Printed source and implemented behavior |
| --- | --- |
| 394, 395, 460 | Base home-printing A4 duplex PDF sheet pages 73 and 81, and Capybara home-printing A4 duplex sheet page 4: docked Pallas, Chepu, or Macaw lets its host ship use its Security Teams during boarding. The support choice is attached to the current craft control, not inferred from the ship's owner or fuel state. |
| 461 | Base home-printing A4 duplex PDF sheet pages 73 and 81: only fuelled Pallas and Chepu may relocate at the beginning of Boarding; the choice is made after the attack target is known. |
| 462 | Base home-printing A4 duplex PDF sheet pages 75, 77, 79 and 83: Blacksmith, Black Sheep, Condor, Chacau, Wobbly and Ally provide their docked host's Security Teams. Their service or engineering role, holder, host and fuel state remain separate. |
| 463 | AEGIS Battle Sheet, printed p. 1, and base home-printing A4 duplex PDF sheet page 73: the AEGIS Executive Officer and Pallas each have their own allowance of up to three defence-die rerolls. |
| 464 | Base home-printing A4 single-sided PDF pages 21–22: the Wolf Commander contributes two additional assault parties and commits before shuttle abilities. The exact consequence when the Commander is unavailable is not fully specified; the connected game requires an explicitly labelled, private, audited facilitator ruling instead of silently inventing one. |
| 465–467 | Base Player's Guide, printed p. 13, and base home-printing A4 duplex PDF card sheets 1–7: count the attacking parties, resolve Security Team defence, then apply surviving boarder damage to the fleet. At Short Range, assign simultaneous damage to eligible Wings first; one hit remains a whole card hit. Destroyed cards use their printed destruction effect, and the later range or boarding phase sees only surviving cards. |
| 468 | Rosal Militia role sheet, base home-printing A4 single-sided PDF page 20: when the attackers outnumber available Security Teams, the Militia may roll up to two defence dice per team; it may also expose up to three front-line dice when not outnumbered. Any rolled one carries the printed Militia Leader risk. |
| 469, 469a–469e | Base home-printing A4 duplex PDF card sheets 1–7: use each exact Battlestation, Strikecarrier, Cruiser, Destroyer, Assault Transport and Fighter Wing destruction outcome. Apply the committed range target changes before that range's destruction consequences, without rewriting earlier range receipts. |
| 470 | Facilitator Guide, printed p. 10: after an attack finishes, the facilitator chooses a later due window and whether the game has one or two additional attacks. The allowed total is the first attack plus at most two additional attacks (three total); a fourth total attack is rejected. The printed 15–24 threshold refers to total damage capacity of the prepared Wolf composition, not a ship count. Returning Wings occupy prepared Wing slots; the next attack records prior-instance to next-instance identity and consumes the prior result once. |

## Product-owner rulings and deliberate app behavior

- The AEGIS and Pallas reroll allowances are independent: both source windows may select the same defence die, with the later reroll using its current stored value. Each window has a three-die budget and cannot select the same die twice within that source. An immutable stored outcome is replayed rather than redrawn.
- An assigned holder who is disconnected remains entitled and pending until reconnect. Automatic unavailability applies when there is no current assigned actor or the holder/craft is no longer eligible; heartbeat expiry alone does not resolve a choice.
- A Commander consequence remains an explicit facilitator ruling with a private audit entry. The app does not turn missing printed wording into a fixed automatic penalty.
- In the seven-target Capybara ring, a committed range shift is replayed against that configured ring. Its target is effective in the current range before destruction damage is attributed, and subsequent ranges begin from the resulting roster.
- A repeat attack is a facilitator-selected later window, not an automatic schedule or immediate Wolf-station action. The previous finalization stays immutable; only verified surviving Wings can be mapped once into the next prepared Wing slots.
- Private card identity, rolls and facilitator ruling remain GM-only. Crew-facing projections expose only the choices and outcomes that their audience may see. These authority, replay, and privacy guarantees are application behavior rather than additional printed game rules.

## Deliberately outside this slice

PC09 aftermath and the broader post-attack campaign remain outside this
implementation. This note covers only the connected PC08 boarding, printed
destruction outcomes and the bounded later-attack consumer required by prompt
470.
