# Worktree and coordination reference

[`CLAUDE.md`](../CLAUDE.md) is the canonical workflow. This page keeps the
small set of commands that help concurrent tasks share a Mac safely. The
coordination ledger is host-wide; set `CODEX_COORDINATION_FILE` only when every
participating project is intentionally using the same absolute file. Never
create a per-repository ledger or act on another project's entry by guesswork.

## Start a task

From the checkout that will be edited or run:

```bash
pwd -P
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git worktree list --porcelain
```

Use a short-lived, attached non-`main` branch and preserve any existing work.
Install dependencies only when needed:

```bash
npm ci
npm ci --prefix functions
```

For prompt-driven work, read the matching JSON record in
[`implementation-prompts.json`](implementation-prompts.json). The generated
implementation Markdown is a view, not a second source of truth. Update the
catalog and regenerate views when roadmap facts change. The optional dependency
check is read-only and produces no local nonce or goal receipt:

```bash
npm run coordination:dependencies -- --prompt NNN
```

After catalog edits, regenerate its Markdown views with
`node scripts/generate-prompt-views.mjs`; `--check` verifies them without
writing.

`NEXT` is a ready-work hint. A hard prerequisite or owner decision still blocks
work, while independent ready prompts may proceed concurrently. Freeze accepted
scope; queue unrelated additions and make only directly blocking defect fixes
inside the accepted task.

## Optional coordination

Coordination is optional. Use it when it clarifies ownership or protects a shared hotspot. It is
not a universal registration gate, and an `Implementation-Prompt` commit
trailer is not required for every tooling or documentation change.

```bash
npm run coordination:begin -- \
  --intent "Describe the bounded change." \
  --work-type "product|tooling|documentation|investigation" \
  --implementation-prompt "NNN" \
  --scope "advisory paths or file context" \
  --resources "central-release-or-emulator-slot"
npm run coordination:status
```

The prompt value is optional. `coordination:status` is the current source for
owner, worktree, process, and reservation state. Use it before touching shared
session/callable/rules code, deploy or authentication infrastructure, release
metadata, or an emulator row. Claim only the actual hotspot; do not reserve
every leaf file or a whole directory by default. Preserve other tasks' claims,
processes, and port reservations. An old timestamp, missing live process, or
empty reservation does not prove that another task is safe to stop. Never infer
stale ownership or safety from age alone.

`--scope` is advisory context. Use `--resources` (or the supported singular
`--resource` form) for an exclusive shared-resource reservation; central claims
remain separate from the descriptive scope.

If an owner must pause, record a simple parked status and a concrete next action
with the supported `coordination:park` command. Retain the owner's resource
reservation until it is explicitly released. Do not run a status/heartbeat
polling loop. Optional goals belong in chat or the normal session record; no
immutable goal artifact, digest comparison, one-shot provenance chain, or
exact-SHA ancestry ritual is required. Close an entry with
`coordination:finish` when one was opened, recording landed, preserved, or
discarded truthfully.

## Emulator rows

Never share a configured row between worktrees. Select one complete free row
atomically, then use its generated ignored configuration for every emulator
command:

```bash
npm run emulators:configure -- auto
npm run emulators
npm run dev:emulators
npm run test:rules
```

The configure command checks all Firebase ports plus Vite while holding the
coordination lock. Do not scan first and select later, mix rows, or release a
reservation owned by another worktree. A configured row stays unavailable while
its owner is active even if no process is listening. For a specific free row,
use `npm run emulators:configure -- <slot 0-14>` only after checking the whole
row. The wrapper that creates a process reservation owns its teardown and must
forward signals only to its own child process group.

The repository provides these complete rows; each row increments every port by
10. Auth, Functions, Firestore, Firestore WebSocket, Hosting, UI, Hub, Logging,
and Vite are kept together:

| Slot | Auth | Functions | Firestore | Firestore WS | Hosting | UI | Hub | Logging | Vite |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 9099 | 5001 | 8080 | 9300 | 5000 | 4000 | 4400 | 4600 | 5173 |
| 1 | 9109 | 5011 | 8090 | 9310 | 5010 | 4010 | 4410 | 4610 | 5174 |
| 2 | 9119 | 5021 | 8100 | 9320 | 5020 | 4020 | 4420 | 4620 | 5175 |
| 3 | 9129 | 5031 | 8110 | 9330 | 5030 | 4030 | 4430 | 4630 | 5176 |
| 4 | 9139 | 5041 | 8120 | 9340 | 5040 | 4040 | 4440 | 4640 | 5177 |
| 5 | 9149 | 5051 | 8130 | 9350 | 5050 | 4050 | 4450 | 4650 | 5178 |
| 6 | 9159 | 5061 | 8140 | 9360 | 5060 | 4060 | 4460 | 4660 | 5179 |
| 7 | 9169 | 5071 | 8150 | 9370 | 5070 | 4070 | 4470 | 4670 | 5180 |
| 8 | 9179 | 5081 | 8160 | 9380 | 5080 | 4080 | 4480 | 4680 | 5181 |
| 9 | 9189 | 5091 | 8170 | 9390 | 5090 | 4090 | 4490 | 4690 | 5182 |
| 10 | 9199 | 5101 | 8180 | 9400 | 5100 | 4100 | 4500 | 4700 | 5183 |
| 11 | 9209 | 5111 | 8190 | 9410 | 5110 | 4110 | 4510 | 4710 | 5184 |
| 12 | 9219 | 5121 | 8200 | 9420 | 5120 | 4120 | 4520 | 4720 | 5185 |
| 13 | 9229 | 5131 | 8210 | 9430 | 5130 | 4130 | 4530 | 4730 | 5186 |
| 14 | 9239 | 5141 | 8220 | 9440 | 5140 | 4140 | 4540 | 4740 | 5187 |

Before a manually selected row, verify every port with
`lsof -nP -iTCP:<port> -sTCP:LISTEN`. Do not commit port-only configuration.

## Validate and land

Choose focused checks that prove the changed behavior. For documentation-only
work, review rendered Markdown, links, examples, and the final diff:

```bash
git diff --check
npm run coordination:docs
```

For code, run the relevant unit/component, rules, lint, and build checks. Risky
shared session, callable/rules, deploy, or auth changes get one independent
review with all findings returned together; the task owner repairs findings and
then runs one final appropriate validation after reconciliation with `main`.
Rerun only after a meaningful input change, a failure, or an unresolved concern.

One owner carries the change through implementation, review, commit, merge, push,
and deployment verification. A successful push is not proof of a completed production deploy;
check the workflow or live behavior separately. Do not claim capacity proof from
local tests. Product changes update version metadata and the player changelog;
tooling and docs do not.

After a landed branch is pushed, its worktree may be cleaned up when the task is
terminal, no live process uses it, no uncommitted or untracked files remain,
and no unique unmerged work would be lost. No 48-hour retention wait is needed.
Do not clean another active task or infer that a branch is disposable from age.
