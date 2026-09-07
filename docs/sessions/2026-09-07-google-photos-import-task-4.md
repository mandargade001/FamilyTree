# 2026-09-07 — Google Photos import: Task 4 (profile panel button)

## Request

Implement Task 4 of the Google Photos import plan: add an "Import from Google Photos" button to the person profile panel, reusing the existing passphrase-gated `onUploadPhoto` upload flow unchanged, per `.superpowers/sdd/2026-09-07-google-photos-import/task-4-brief.md`.

## What was done

- `client/src/components/profile/PersonProfile.tsx`: imported `pickGooglePhoto` from `../../lib/googlePhotosPicker` (Task 3). Refactored `handleFileChange` to extract a shared `handleFile(file)` used by both the native file input and the new Google Photos path. Added `handleGooglePhotoClick`, which sets `uploading`, calls `pickGooglePhoto()`, delegates to `handleFile` on a picked file, resets to `idle` on `null` (user closed picker), and sets an `error` state with the thrown error's message on rejection. Wrapped the existing "Upload photo" button and the new "Import from Google Photos" button in a `.photo-actions` flex column.
- `client/src/styles/global.css`: added `.photo-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }` after `.upload-status-error`.
- `client/src/components/profile/PersonProfile.test.tsx`: added the `pickGooglePhoto` mock and the three tests specified in the brief verbatim (upload-via-picker success, picker closed without choosing, picker/proxy failure shows error message).
- Deviation from the brief: added `mockPickGooglePhoto.mockReset()` to the existing `beforeEach`. Without it, the mock's call count leaked across tests (vi.fn() isn't auto-reset between tests in this suite), causing the "does nothing if the user closes the picker" test to fail intermittently depending on test order (`toHaveBeenCalledOnce()` saw a stale count of 2 from a prior test's click). Confirmed by running the single test in isolation (passed) vs. the full file (failed) before the fix.

## Outcome

- `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx` → 17/17 passed (14 original + 3 new).
- `cd client && npm test` → 16/16 files, 128/128 tests passed (125 prior + 3 new).
- Pre-existing React `act()` warnings in this test file (from the `useEffect`-driven `listPhotos` call) are unrelated to this change and were present before it.
- Files touched: `client/src/components/profile/PersonProfile.tsx`, `client/src/components/profile/PersonProfile.test.tsx`, `client/src/styles/global.css`.
- Committed as `244aeeb` on `worktree-google-photos-import`.
- Full report written to `.superpowers/sdd/2026-09-07-google-photos-import/task-4-report.md`.
