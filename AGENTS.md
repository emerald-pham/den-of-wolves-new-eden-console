# AGENTS.md

**Read [`CLAUDE.md`](./CLAUDE.md) first and follow it.** It is the single source
of truth for how work is done in this repository, and it applies to every agent
and every tool — Claude Code, Codex, Cursor, Copilot, anything else.

Two rules from it are non-negotiable, repeated here so no agent can claim it
only read this file:

1. **Test first.** A failing test exists and has been *run* before any
   implementation code is written. No exceptions for "small" changes.
2. **Merge once done.** Work happens on a branch and lands on `main` the moment
   it is green and complete. No long-lived branches, no stacked half-finished
   work, no "I'll merge it later."

3. **Version every completed edit.** Keep the monotonic application version in
   sync and visible. Patch numbers may exceed 9; reserve `0.9.x` for genuine
   release-candidate maturity, and never call a build `1.0.0` until the complete
   20-player set has full, complex gameplay across interacting systems and a
   clear game end. See `CLAUDE.md` for the full policy.

Everything else — stack, layout, the security model, what may and may not be
written from a client, commit conventions — is in `CLAUDE.md`. Go read it.
