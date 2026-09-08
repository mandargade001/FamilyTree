# 2026-09-08 — Last-name inheritance: final whole-branch review fixes

## Fix all five findings from the final review

**Asked:** Fix five findings (1 critical, 4 important) from a final whole-branch review of the
last-name auto-inheritance feature (`client/src/lib/lastNameInheritance.ts`, wired into
`client/src/App.tsx`), and only those five — other findings were explicitly deferred as follow-ups.

**Done:**

1. **Order-dependent married-daughter resolution** (`lastNameInheritance.ts`): split the single
   interleaved fixed-point loop into two phases — phase 1 iterates `Male <- father` /
   `Female <- spouse` only (never a father fallback for a blank female) to a fixed point; phase 2
   is one final sweep giving any still-blank female her father's name. This makes the result
   provably independent of array order, since no woman's name is ever a propagation source for
   anyone else. Added a regression test constructing the same bride/groom/fathers graph in both
   orderings and asserting identical output.
2. **Reconcile failure surfacing as a user-facing save/link error** and **3. partial application on
   mid-loop failure** (`App.tsx`'s `reconcileLastNames`): implemented together as one coherent
   layer — each per-person `updatePerson` call is caught and logged individually (so one failure
   doesn't stop the batch; a name that fails just stays blank and retries next reconcile), and the
   whole loop is wrapped in `try { ... } finally { await refresh() }` so state always gets
   reconciled with the database regardless of how the loop went. The function now never throws to
   its callers.
4. **Doomed backfill write for read-only visitors** (`App.tsx`'s `load()`): guarded the load-path
   call with `if (getPassphrase())`, mirroring the passphrase-gating pattern already used elsewhere
   in the file.
5. **Untested spouse-link call site** (`App.test.tsx`): added an integration test that links an
   existing Male (non-blank last name) to a Female (blank last name) as spouses via the
   relationship-picker UI flow and asserts `updatePerson` is eventually called with the resolved
   name.

Also updated one pre-existing test (the load-time backfill test) to store a passphrase first, since
Finding 4's fix now makes that a precondition for the write to fire, and added one bonus test
confirming a passphrase-less load never calls `updatePerson`.

**Outcome:** `npm test` (vitest run, non-watch): 18 test files / 159 tests, all passing.
`npx tsc --noEmit`: clean, no errors. Committed as `e54aa8e` — "Fix five final-review findings on
last-name inheritance" (`client/src/lib/lastNameInheritance.ts`,
`client/src/lib/lastNameInheritance.test.ts`, `client/src/App.tsx`, `client/src/App.test.tsx`, plus
this log entry). Full detail in
`.superpowers/sdd/2026-09-08-last-name-inheritance/final-fix-report.md`. Nothing left open.
