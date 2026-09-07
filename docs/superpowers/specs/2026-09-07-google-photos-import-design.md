# Google Photos import — design

Spec 3 of the observations logged 2026-09-06 (item 4, "Google-based sign-in" + "add photos from Google Photos or Google Drive"). **Supersedes `2026-09-07-google-signin-design.md` (Spec 3a)** — that design used Google sign-in as an alternate way to unlock general editing, gated by an email allowlist. Per clarification, that's not what's wanted: Google sign-in should do nothing to the edit gate. It exists purely to let someone pick a photo from their own Google Photos library and import it — the passphrase remains the only thing that gates add/edit/delete/upload, completely unchanged. This spec replaces 3a's premise entirely (no allowlist table, no RPC changes, no Supabase Auth integration).

## Problem

Today, adding a photo to a person's profile means the file must already be saved locally on the device (`PersonProfile.tsx`'s "Upload photo" button opens a native `<input type="file">`). Many family members' actual photos of relatives live in Google Photos, not as loose files on disk — the observation asks for a more direct path: pick a photo from Google Photos and import it, without a manual download-then-upload round trip.

## Design

### 1. Client-side Google OAuth (no backend secret)

Google Identity Services' browser token-client flow (`google.accounts.oauth2.initTokenClient`, loaded via `<script src="https://accounts.google.com/gsi/client">`) obtains a short-lived OAuth access token scoped to `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` — requested fresh each time the user clicks "Import from Google Photos," not persisted across sessions. This flow uses only a public OAuth **Client ID** (no client secret), the standard pattern for browser-only apps — nothing for the app to store or protect server-side.

### 2. The Google Photos Picker flow

Per Google's current Photos Picker API (their 2024+ replacement for broader Library API access, which Google restricted in April 2025):
1. Create a picker **session** (`POST photospicker.googleapis.com/v1/sessions`), which returns a `pickerUri` and a recommended `pollInterval`.
2. Open `pickerUri` in a new tab/popup (Google's docs explicitly disallow embedding it in an iframe) — this is Google's own hosted picking UI; the user selects one or more photos there, entirely on Google's domain.
3. Poll `sessions.get` at the recommended interval until `mediaItemsSet` becomes `true`.
4. List the session's selected media items, and fetch the chosen photo's bytes via its returned `baseUrl` (with the OAuth access token attached as the request's Authorization header).
5. Delete the session (cleanup, per Google's guidance).

**Open technical question to resolve as the first implementation step, not assumed here:** whether `photospicker.googleapis.com`'s REST endpoints accept direct authenticated browser `fetch()` calls (CORS), or require a server-side intermediary. If direct calls work, the whole flow stays client-side. If not, the fallback is a new thin Supabase Edge Function that proxies the session-create/poll/media-fetch calls, forwarding the caller's Google OAuth Bearer token through unchanged — the same `Deno.serve` pattern this project already uses for `upload-photo`, just relaying rather than holding a secret. Either way, no change to how photos ultimately land in Supabase Storage (see below).

### 3. Feeding a picked photo into the existing (unchanged) upload pipeline

Once the selected photo's bytes are fetched, they're wrapped in a `File`/`Blob` client-side and handed to the **exact same** `onUploadPhoto` prop `PersonProfile.tsx` already calls for a locally-selected file — which is `App.tsx`'s existing `requestUploadPhoto(personId, file)`, itself unchanged. That function already implements "pick first, gate at commit": it doesn't require the passphrase to select a file, only to actually complete the upload — if not already unlocked, it opens the passphrase gate, and on success retries the upload automatically. The Google Photos path reuses this exactly, so:
- Browsing/picking a Google Photo requires **only** a Google account (via the OAuth popup) — no passphrase needed to look.
- Actually saving that photo to the person's profile still requires the family passphrase, unchanged from every other write in the app.

No changes to `App.tsx`, `api/photos.ts`, the `upload-photo` Edge Function, or any database migration are needed for this to work — assuming the CORS question above resolves in favor of direct browser calls. If it doesn't, the new proxy Edge Function is the only backend addition, and it holds no family data or secrets of its own (it only relays the user's own Google token).

### 4. UI

`PersonProfile.tsx` gains a second button next to the existing "Upload photo": **"Import from Google Photos."** Clicking it: requests the OAuth token (Google's own consent popup appears if not already granted this browser session), opens the picker in a new tab, and once the user finishes picking, fetches the photo and calls `onUploadPhoto` exactly as today's file-input path does. Loading/error states (waiting for the user to finish picking, a fetch failure, the user closing the picker without choosing anything) get inline feedback next to the button, following the same `uploadStatus` state machine `PersonProfile.tsx` already has for the local-file path.

### 5. Manual setup (external, done later by the user)

1. Create (or reuse) a Google Cloud Console project; enable the **Google Photos Picker API**.
2. Configure an OAuth consent screen (External, personal Gmail accounts) and create an OAuth 2.0 **Client ID** of type "Web application," with this app's origin(s) (including the GitHub Pages URL) as authorized JavaScript origins. No client secret is needed for this flow.
3. No Supabase Dashboard changes, no new database migrations, no allowlist — this feature touches only the client (and, conditionally, one new proxy Edge Function).

### Testing

- Client tests mocking the Google Identity Services token client and the Picker API's fetch calls: token acquisition, session creation, polling until `mediaItemsSet`, fetching the chosen media item, and handing the resulting `File` to `onUploadPhoto` — verifying it's the same prop/path the existing local-upload test already covers.
- Error paths: user closes the picker without selecting anything (session never reaches `mediaItemsSet`, needs a timeout/cancel affordance), the OAuth popup is blocked or dismissed, a fetch failure downloading the chosen photo's bytes.
- No new passphrase-gating tests needed — `requestUploadPhoto`'s existing behavior and its existing tests are unchanged and already cover the gate itself.

### Non-goals

- No Google Drive import (the original observation mentioned it, but the clarified ask is specifically Google Photos) — could be a future extension of the same picker pattern if wanted later, not built now.
- No Google identity used anywhere else in the app — no accounts, no attribution, no alternate edit-unlock path. This fully supersedes Spec 3a's design.
- No persistence of the Google OAuth token across sessions/browser restarts — requested fresh each time, matching "only used to grant Photos access for this one action."
