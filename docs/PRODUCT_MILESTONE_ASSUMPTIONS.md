# Source-backed rules assumptions

When a printed rule is ambiguous during an approved milestone build, use the
best reading supported by the rulebook and keep building. Record the decision
here **before the dependent behavior is claimed complete**. This is not a
request to wait for the product owner. Do not invent a source passage: if the
relevant source is unavailable, report the limitation and continue independent
work.

For each assumption, record:

| Field | Required record |
|---|---|
| ID and milestone | Stable assumption ID and affected playtest milestone. |
| Source passage | Exact rulebook/component title, edition, page/card/section, and a concise paraphrase of the relied-on passage. Do not copy private source wording into Git. |
| Ambiguity and alternatives | What the passage leaves open and the plausible readings. |
| Chosen reading | The best source-backed interpretation and why. |
| Product effect | Which player action, result, prompt IDs, and tests rely on it. |
| Review state | New, accepted, corrected, or superseded, with the linked product-owner feedback note and cooldown evidence when resolved. |

List each checkpoint's **new** assumptions at the very top of its nontechnical
end report, including ID, short reading, and rulebook citation. A correction
from the owner enters [feedback](PRODUCT_MILESTONE_FEEDBACK.md) and is fixed in
the cooldown pass before a new milestone build. Do not retroactively rewrite
the original assumption; append the resolution so the decision is traceable.

## Entries

None recorded for PC01 shaping. Add source-backed entries as they arise during
building.
