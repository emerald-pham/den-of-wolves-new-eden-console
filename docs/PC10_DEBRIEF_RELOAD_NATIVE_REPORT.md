# Cold GM debrief and closed history — October 15, 2026

Root accepts a scoped authenticated local/emulator lifecycle check on source
`3757256e4c4b85b9760eaaac769ee477e139a59a`. This does not accept either failed
Ring run, every role/function, whole P565/P566/P650, or a release.

The two Ring failures led to a fast reproduction through the real App and
EndgameDialog: a cached GM identity dispatched a private read before Firebase
Auth restoration. Test-first regressions precede the bounded original-UID
restoration/session/instance recheck and visible read failure/Retry repair.
Five new consumer regressions, 281 existing UI/service checks and 14 server
checks pass. Independent Sol review found no actionable issue in the bounded
fix, including closed-history semantics, changed principal/session/lease and
late completion after the 15-second deadline.

## Actual native result

Fresh project `demo-pc10-debrief-f9f3-20261016-r2` admitted eight configured roles
using ten genuine Auth accounts (crew, controller and GM), two Chrome
processes/contexts and zero humans. Ordinary GM authorization/manual start and
manual phase controls reached the source-normal pursuit-limit failure at
Cycle 5, then the real failure-review/debrief. The original GM cold-reloaded
with the same UID, session and instance and rendered the exact frozen snapshot.
UI closure preserved it; the same ordinary crew actor reloaded closed history.

All seven captured authorized GM debrief reads returned HTTP 200 with Auth.
The ordinary crew's detailed GM read returned the expected HTTP 403
PERMISSION_DENIED. That negative is preserved, not discarded as an incidental
error. Page errors and remote requests were empty. Source and build bindings
were unchanged. This lifecycle check traversed no full role-function tour,
used no admin gameplay writes/seeded outcome/accelerated clock, and does not
claim printed resource acquisition or Ring completion.

Evidence is outside Git in
`/private/tmp/pc10-debrief-reload-f9f3-20261016-r2`:

| Receipt | SHA256 |
| --- | --- |
| `evidence.json` | `bc08b3ce4808c265b421b0a665ec4a443808608bf98a823ecefb7daf87397e70` |
| `cold-original-GM-debrief.json` | `baa2d9d0f37ba041a1d21da61f96f915f4b79654c9048e57e2880e9a833f951d` |
| `pursuit-limit-ending.json` | `9d27d939bd282fe5293eb4a62d49a3de4c4ab3d8617956b09ce09536d4f56926` |
| `all-debrief-responses.json` | `885001972c01144d38297f467256d3dc9f7b46ea4c20c451d3dcec8a683b9043` |
| `strict-return.json` | `1907b7a9ba8813e7cf983b83446493ee472db1779cc48bf44c0ccbf97622713e` |

## Setup history and return

R1 remains a failed setup attempt: loopback address correction retained its
original clock, but the served Vite environment omitted local-GM opt-in.
It stopped in Settings before GM grant, crew admission or gameplay. R1 was
strictly returned; no native acceptance is drawn from it. The corrected R2
preflight verified actual DEV/demo/ports/opt-in and the installed endpoint's
unauthenticated 403 before browser/Auth creation. A supported own-entry resume
preserved R1 coordination history without reusing its runtime allocation.

R2's original acquisition was 02:53:38.274 UTC on October 16, with both browsers
launched at 02:55:10/11 before the original 120-second bound. Physical return at
02:58:08.072 UTC preceded the unchanged 03:05:38.274 deadline. All 22 IPv4/IPv6
bindings were free, captured owned processes were absent, and only the owned
configuration/resource claim was released. Fresh RAM emulator state was
discarded without import/export; no per-UID deletion or old-namespace cleanup
is claimed. The checkpoint was parked, not declared deployed.

Prepared responsive failure/Retry renders are separate presentation evidence.
Final built-app typography, broader privacy/recovery, total-loss/candidate
branches, complete prompt acceptance, CI and deployment remain open.
