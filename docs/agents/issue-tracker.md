# Issue tracker: Existing prompt catalog

Work is tracked in `docs/implementation-prompts.json`. Use explicit prompt IDs,
not array positions. `docs/IMPLEMENTATION_PLAN.md` and
`docs/IMPLEMENTATION_PROGRESS.md` are generated views, not independent trackers.

## Reading and publishing

Read the relevant catalog rows, their prerequisites, evidence and release
boundaries before changing work. Check current checkpoint plans and owner
feedback for scope and authorization. Use `npm run coordination:dependencies
-- --prompt NNN` for read-only readiness information.

When a skill says to publish a spec or ticket, reconcile it into the existing
prompt definitions and relevant checkpoint planning records. Update an existing
prompt when it already owns the behavior; add a prompt only for genuinely new,
authorized behavior. Cross-cutting owner decisions belong in
`docs/PRODUCT_MILESTONE_FEEDBACK.md` and affected plans, with catalog changes
only where prompt facts change. Preserve fixed checkpoint membership and totals.
Do not create GitHub issues or a parallel `.scratch/` tracker for this workflow.

Catalog completion states are `missing`, `partial`, and `done`. Readiness and
owner authorization are separate from completion. Preserve evidence classes;
a spec, prepared tour or authorization does not establish behavior completion.

After catalog changes, regenerate with `node scripts/generate-prompt-views.mjs`
and any affected dependency chart using its existing generator. Verify generated
views and `npm run validate:dependencies`. Never hand-edit generated projections.

## Execution subdivisions

Approved context-bounded briefs may live one per document under
`docs/pc10-tickets/`, linked from the owning catalog row's planning evidence and
the existing checkpoint plan. They refine execution of existing IDs; they are
not new prompts or a parallel tracker. The catalog alone records completion.
All briefs belonging to an ID must satisfy that ID's entire acceptance before
it closes. Their explicit text blockers supplement execution ordering without
changing the canonical prerequisite graph or adding release gates.
