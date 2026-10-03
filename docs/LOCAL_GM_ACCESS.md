# Local emulator GM access

This opt-in developer path authorizes the current **local Auth emulator** identity
for the usual 24-hour GM lease. It does not replace production passwords, change
production callables/rules, assign roles, or fabricate game/session state. The
normal session join and named GM instance claim still apply.
The October 2 repository-wide owner decision accepts normal authenticated
local/emulator gameplay for future checkpoints, with independent review, CI
and production deployment retained; see [the milestone guide](PRODUCT_MILESTONES.md).

From this checkout, configure a free emulator row if it has none:

```sh
npm run emulators:configure -- auto
```

In one terminal, start the isolated demo backend:

```sh
npm run emulators -- --project demo-pc06-local --only auth,firestore,functions
```

In another terminal, opt the development server into that same demo project:

```sh
VITE_LOCAL_GM_ACCESS=1 VITE_FIREBASE_PROJECT_ID=demo-pc06-local npm run dev:emulators
```

The example project name may be replaced by another isolated `demo-` project;
both terminals and every client must use that same name and configured row.

Open the loopback URL printed by Vite. Its port comes from the worktree's ignored
`.env.emulators.local`. In Settings, choose **Authorize local emulator GM**. Create
or join a local session, follow **GM join**, enter a GM name, and choose **Join as
GM**. Other local actors join through the normal participant flow. Use a separate
ordinary browser identity when an acceptance needs different actors; separate
tabs sharing Auth are not different actors.

**Revoke GM access** uses the normal logout callable and removes the emulator
lease. Stopping the development server removes the helper endpoint; stopping
emulators without export discards their temporary data. No production credential
is required, retrieved, copied, or stored by this path.

## Verify the loaded implementation

After Functions source changes, a successful compilation alone does not prove
the running emulator loaded the new handlers. Check a discriminating normal
authenticated request against the intended behavior before collecting final
gameplay evidence. If the runtime is stale, pause only actors using the owned
row, export its disposable state outside Git when it is still needed, then
restart that same row and import the export. Do not stop another task's runtime
or discard an unfinished actor setup. Confirm a current-source request before
resuming dependent scenarios. Keep stale-runtime failures separate from final
native/HTTP/UI/Rules proof.

## Isolation and proof

The helper is a Vite `serve` middleware installed only with both explicit flags,
a `demo-` project and valid local emulator ports. It contacts hardcoded
`127.0.0.1` Auth/Firestore endpoints. It requires a loopback TCP peer, a same-host
HTTP Origin, and an Auth emulator token whose audience and issuer match the demo
project; lookup must identify exactly one valid actor before the lease is saved.
No client privileged Firestore write is enabled. The helper has no session ID
input and cannot claim a GM instance itself.

The UI module is behind Vite's compile-time development flag. Production build,
preview and Firebase Hosting install no helper endpoint; production output omits
the local control and helper URL even when the opt-in environment flags are set.
The normal deployed GM password/lease authorization is unchanged.

Focused rejection coverage runs with:

```sh
node --test scripts/local-gm-access.test.mjs
VITE_FIREBASE_PROJECT_ID=demo-pc06-local node scripts/test-local-gm-native.mjs
```

Local/emulator checks establish local behavior through the production handlers
and rules. They are labeled separately from deployment and production gameplay;
they never claim a production credential, Cloud Tasks transport, or physical
device result.

Native emulator verification passed: normal create/resume, unseeded claim denial,
incorrect password denial, normal client privileged-write denial, helper lease,
normal named GM claim, logout and post-revoke denial. Actual UI authorization,
normal named claim and revoke/re-authorize also passed. The production build was
checked both normally and with opt-in flags accidentally set; executable local
helper/control/module code was absent in both. This is local verification.
