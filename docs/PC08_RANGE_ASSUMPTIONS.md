# PC08 Range Assumptions

This note records the narrow rule resolutions used by PC08. The canonical catalog and printed-source text remain unchanged.

## Boa target validity

The Capybara expansion lets Boa spend one Scrap at each Long, Medium, and Short Range step to deal one damage to a Wolf ship (private primary `sources/capybara-v1.1/capybara-home-printing-a4-duplex-v1.1.pdf`, printed p. 4; routed derivative `references/REFERENCE_ONLY_CAPYBARA_EXPANSION.md`, “Wolf attacks,” lines 141–151). The same derivative’s ambiguity list, AMB-06 in the source-routing inventory, says the rules do not specify whether Boa may target an already-destroyed Wolf.

For PC08 automatic play, a Boa target is selected from the contacts that are alive and legal at the start of that range. A Wolf destroyed before the range cannot be selected. If there is no legal target, the Recycler passes and no Scrap is spent. This is a bounded product assumption needed to make the requested normal range action playable; it does not settle other AMB-06 cases.

## Fighter target shifts and expansion ring

The Alpha/Bravo and PDF fighter sheets print a ±1 target-number adjustment with wraparound (private primary `sources/base-v1.1/downe-home-printing-a4-single-sided-v1.1.pdf`, printed p. 36, and `sources/base-v1.1/downe-home-printing-a4-double-sided-v1.1.pdf`, printed p. 81; see the source index and matching SHA-256 entries in `SOURCE_PROVENANCE.md`). The routed derivatives are `references/REFERENCE_ONLY_ROLES_AND_LOYALTIES.md` and `references/REFERENCE_ONLY_WOLF_ATTACKS.md`. For the six-target ring, wrapped endpoints 0 and 7 resolve to Refinery 124 and AEGIS; a later shift normalizes that endpoint before applying its own adjustment. When Capybara is included as the seventh target, all fighter shifts wrap over the configured seven-target ring, so 7 denotes Capybara rather than the six-target AEGIS endpoint. The attack stores each shift in an immutable range receipt and carries the resulting target forward without rewriting the original targeting receipt.

## Medium shifts and same-range destruction

The Alpha/Bravo and PDF pages above give a Medium Range choice between attacking and shifting, and list a destruction effect for each Wolf ship card by range. The owner-set digital ordering is: lock all range attack dice, preserve the complete pre-range target snapshot, apply the committed Medium shifts, then assign that range's destruction effects to each destroyed ship's resulting current target. Therefore a Long destruction effect keeps its Long target, while a Medium shift may change the Medium destruction target in that same range. This records the ordering selected for PC08 automation without changing printed card data.
