# Triage roles in the prompt tracker

These are semantic mappings to existing records, not new catalog status values
or external labels. Preserve the catalog schema and its completion states.

| Skill role | Existing tracker representation |
| --- | --- |
| `needs-triage` | Evaluate the existing prompt definition, scope and related work before changing readiness. |
| `needs-info` | Record the specific unresolved decision and decision owner in the existing prompt/planning record. |
| `ready-for-agent` | Existing scoped prompt with satisfied hard prerequisites and applicable execution authorization; completion remains `missing` or `partial` until proved. |
| `ready-for-human` | Record the concrete owner-only action or decision in the existing planning record; continue independent work. |
| `wontfix` | Record the explicit deferral or retirement through existing catalog conventions; never mark it `done`. |

A skill requesting a label means record or establish the corresponding condition.
Do not invent a `ready-for-agent` completion status or add labels to GitHub.
