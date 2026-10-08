# PC10 emulator log preservation

The October8 idle shutdown lost the old2,477,551,649byte verbose log because
Firebase CLI15.29.0 removes its debug-log pathname on successful exit when
`DEBUG` is absent. A copy made after shutdown is too late. The lost multi-day
trace is not recovered, and those bytes receive no lossless-cleanup credit.
The replacement log and all retained native packets remain distinct evidence.

This procedure is for a verified task-owned, append-only log. It is not
authorization to stop another task or clean unique evidence. No further real
log cleanup occurred in this source-only continuation. The protocol must
receive its bounded independent review before use on unique logs.

1. Verify the exact owner, source pathname, device/inode, regular-file type,
   idle gameplay scope, consumers and writers. Preserve other task reservations.
   Record those observations before touching the writer. Use the supported
   `--debug` option for future Firebase runs; it supplements preservation.
2. Before any shutdown signal, create an exclusive protected hard link to the
   same inode in the evidence directory on the same filesystem. Verify both
   pathnames still reference the recorded device/inode. If linking, ownership
   or identity verification fails, hold shutdown and retain the original.
   Do not rename, truncate or replace the writer's live log.
3. Still before shutdown, capture the protected log's byte length and copy
   exactly that prefix to a new exclusive file. Verify its byte count and
   SHA256 against the same prefix of the protected inode. Record the copy,
   hash, inode and verification time before authorizing a stop. A live prefix
   is not claimed as the complete final log: the independent link retains
   subsequent shutdown bytes. Hold if the file is truncated, rotated,
   rewritten or changes identity; keep every existing copy.
4. Only after those checks pass, stop the verified owned process and verify
   that all of its log writers have closed. The protected link survives an
   unlink of the original pathname and preserves the final appended suffix.
   No other task's process or log may be touched.
5. From the closed protected inode, make a new complete copy. Verify its full
   byte count and SHA256, and compare its original prefix with the verified
   pre-shutdown copy. Retain both copies and the complete protected inode.
   Any mismatch holds cleanup and must be reported honestly.
6. Compression follows full-copy verification and writer closure. Decompress
   and compare all bytes and the checksum before considering plaintext
   removal. Preserve plaintext until the reviewed, authorized cleanup scope
   permits removal. A successful archive check never recovers an earlier lost
   log or grants gameplay/release acceptance.

The disposable experiment first ran the installed CLI's exact exit callback
with real Node exit and filesystem unlink. Copying afterward failed `ENOENT`.
It then verified a protected copy and same-inode link before exit, observed the
original pathname disappear, retained the final shutdown suffix, verified the
complete copy and passed a gzip/decompression byte comparison. All protected
disposable plaintext remains. Notification and configstore dependencies were
inert; the full Firebase CLI/emulators were not launched. No actual task log,
real service or unique retained evidence was stopped, rotated or deleted.

The first disposable fixture attempt lacked an inert configstore dependency
and failed after the callback's unlink. That attempt and script are retained;
they are not credited as protocol acceptance or product RED. The corrected
experiment passed. This is a source-backed operational experiment and prose
procedure, with no new production or general log-rotation implementation.

Evidence:

- `/tmp/dow-pc10-evidence/OWNER_PC10_VERBOSE_LOG_LOSS_INCIDENT_20261008.json`
- `/tmp/dow-pc10-evidence/proof-draft/disposable-firebase-exit-log-preservation-20261008.mjs`
- `/tmp/dow-pc10-evidence/OWNER_PC10_DISPOSABLE_LOG_PRESERVATION_PROTOCOL_20261008.json`
  (SHA256`92fc4d9067452e4d7581b4d7415868f693d365fd42df40caea33bd0770a9bac9`)
- `/tmp/dow-pc10-evidence/OWNER_PC10_DISPOSABLE_LOG_PRESERVATION_PROTOCOL_FINAL_20261008.log`
