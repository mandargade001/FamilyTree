# 2026-09-07 — Google Photos picker: fix review finding (Task 3)

## Request

Fix an Important review finding on Task 3 (`client/src/lib/googlePhotosPicker.ts`, commit `5389230`): no HTTP status/error checking on `callProxy` calls, so a failed `create` (e.g. 401 from the Edge Function) or a failed `download` (502) was silently treated as success instead of throwing — masking auth failures as an ordinary "nothing picked" timeout, and producing a corrupt `File` from a failed download.

## What was done

- Added an `assertOk(action, response)` helper in `googlePhotosPicker.ts` that checks `response.ok`, and on failure throws `Error(\`Google Photos proxy '${action}' failed: ${detail}\`)` — `detail` is the Edge Function's JSON `{error}` body when parseable, falling back to `HTTP <status>` (needed because the `download` action's success body is a raw blob, not JSON, so `.json()` can't always be assumed on the error path either; read the body once, correctly, per call).
- Wrapped the `create`, `get`, `list`, and `download` `callProxy` call sites in `pickGooglePhoto()` with `assertOk`. Left the two fire-and-forget `delete` calls unwrapped, per the brief (nothing downstream depends on them).
- Preserved the `Promise<File | null>` contract: `null` still means "session timed out, nothing picked"; a thrown `Error` now means a real backend/network failure — previously indistinguishable from the former.
- Applied both minor suggestions from the review since they touched the same code:
  - `parseDurationSeconds` now guards against `NaN` (malformed duration string) by returning `0` instead.
  - File extension for `image/jpeg` is now `jpg` instead of `jpeg` (still falls back to `mimeType.split('/')[1] ?? 'jpg'` for other types).
- Added two tests to `googlePhotosPicker.test.ts`:
  - `create` returns 401 with `{error: 'missing Google Authorization header'}` → asserts `pickGooglePhoto()` rejects with a message containing that detail, and that `window.open` is never called.
  - `download` returns 502 with `{error: 'Google returned 500 downloading the photo'}` (after a normal create/get/list) → asserts the promise rejects with that detail instead of resolving a corrupt `File`.
  - Had to attach `expect(promise).rejects.toThrow(...)` *before* advancing fake timers in the download test, to avoid a Node `UnhandledRejection` warning caused by the rejection firing before anything had a `.catch` attached to it.

## Outcome

- `npx vitest run src/lib/googlePhotosPicker.test.ts` → 4/4 passed (2 original + 2 new), no unhandled-rejection warnings.
- `npm test` (full suite) → 125/125 passed, 16/16 files.
- `npx tsc --noEmit` → clean.
- Files touched: `client/src/lib/googlePhotosPicker.ts`, `client/src/lib/googlePhotosPicker.test.ts`.
- Fix report appended to `.superpowers/sdd/2026-09-07-google-photos-import/task-3-report.md`.
- Committed directly on `worktree-google-photos-import`; see git log for the exact SHA.
