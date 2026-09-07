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

## Request (final whole-branch review fix wave)

Apply fixes from a final whole-branch security/correctness review covering both files this feature touches: `supabase/functions/google-photos-proxy/index.ts` and the full client picker flow. Six numbered fixes plus three cheap wins, in priority order (SSRF first).

## What was done

1. **SSRF / open relay (Critical)** — `google-photos-proxy/index.ts`'s `download` action now validates `body.baseUrl` is a well-formed `https://` URL whose hostname is `googleusercontent.com` or a subdomain of it, before fetching it with the caller's Authorization header attached. Anything else is rejected with 400. Updated the file's top comment: it previously claimed callers could at worst fetch their own Google Photos data via *any* action; that was never true for `download` pre-fix, and the comment now says so and explains the new validation.
2. **Wrong media-item field shape (Important)** — `MediaItem` in `googlePhotosPicker.ts` now matches Google's real `PickedMediaItem` schema: `{ id, mediaFile: { baseUrl, mimeType } }` instead of flat `baseUrl`/`mimeType`. Updated every read site (`item.mediaFile.baseUrl`, `item.mediaFile.mimeType`) and both `list` mocks in `googlePhotosPicker.test.ts`.
3. **`window.open` popup-blocked after awaits (Important)** — `pickGooglePhoto()` now calls `window.open('', '_blank')` as its first synchronous statement (before any `await`), throws a clear "popup blocked" error if it returns `null`, and later navigates that same tab via `popup.location.href = session.pickerUri` once the real URI is known — no second `window.open` call. Added a test asserting a blocked popup rejects immediately without calling `requestGoogleAccessToken` or touching `fetch`; updated the `beforeEach` mock to return a fake popup object (`{ location: { href: '' } }`) instead of `undefined`, since a truthy return value from `window.open` is now required for the existing flow tests to proceed past the guard.
4. **Unguarded array access on empty picker result (Important)** — `pickGooglePhoto()` now throws `Error('No photo was selected.')` if `listData.mediaItems` is missing or empty, instead of crashing on `undefined.mediaFile`.
5. **Unguarded JSON parsing / no top-level error handling in the Edge Function (Important)** — wrapped all request-handling logic (everything after the OPTIONS/auth checks) in a try/catch that returns `jsonResponse({error}, 502)` on any exception, guaranteeing CORS headers on every response path. Added a `readJsonSafely()` helper used by `create`/`get`/`list` that reads the Google response as text first and attempts `JSON.parse`, falling back to the raw text as the error detail instead of letting a non-JSON body (e.g. an HTML error page during a Google outage) throw uncaught.
6. **Picker sessions not cleaned up on every error path (Important)** — restructured `pickGooglePhoto()` so everything from right after session creation onward runs inside `try { ... } finally { void callProxy(googleToken, { action: 'delete', sessionId: session.id }) }`, removing the two now-duplicated individual `delete` calls (timeout path and success path).

Cheap wins:
- `googleAuth.ts`: `requestGoogleAccessToken()` now rejects with `'Google Photos import is not configured (missing client ID).'` if `VITE_GOOGLE_CLIENT_ID` is empty/unset, before calling `initTokenClient`. Added a covering test, and had to add `vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')` in `beforeEach`/`vi.unstubAllEnvs()` in `afterEach` for this test file, since vitest doesn't set that env var by default — the two pre-existing tests were failing against the new guard until this was added.
- `README.md`: fixed the "three secrets ... respectively" sentence that incorrectly mapped 3 items to 2 sources, and added a pointer to `docs/google-photos-setup.md` (which existed but wasn't linked from anywhere).
- Committed the previously-untracked `docs/sessions/2026-09-07-google-photos-import-task-4.md` (a prior implementer's per-task note that had never been added to git) — left its content untouched, just tracked it.

## Outcome

- `npx vitest run src/lib/googlePhotosPicker.test.ts src/lib/googleAuth.test.ts` → 9/9 passed (5 + 4).
- `npm test` (full suite) → 130/130 passed, 16/16 files.
- `npx tsc --noEmit` → clean.
- Edge Function has no automated test coverage; self-reviewed by full read after changes — every response path (OPTIONS, 401 auth, each action success/error, unknown action, and the outer catch-all) returns via `jsonResponse` or an explicit `Response` that spreads `corsHeaders`, so CORS is present on every path.
- Files touched: `supabase/functions/google-photos-proxy/index.ts`, `client/src/lib/googlePhotosPicker.ts`, `client/src/lib/googlePhotosPicker.test.ts`, `client/src/lib/googleAuth.ts`, `client/src/lib/googleAuth.test.ts`, `README.md`; plus newly-tracked `docs/sessions/2026-09-07-google-photos-import-task-4.md`.
- Fix report: `.superpowers/sdd/2026-09-07-google-photos-import/final-fix-report.md`.
- Committed directly on `worktree-google-photos-import`; see git log for exact SHAs.
