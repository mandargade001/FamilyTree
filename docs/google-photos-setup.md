# Google Photos import — manual setup

One-time setup in Google Cloud Console, needed before the "Import from Google Photos" button will work. No code changes here — this is account/console configuration only.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or pick an existing one you're comfortable using for this).
2. **Enable the Google Photos Picker API**: APIs & Services → Library → search "Google Photos Picker API" → Enable.
3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent screen.
   - User type: **External** (family members use personal Gmail accounts, not a Google Workspace org).
   - Fill in the required app name/support email fields (any reasonable values — this is a private family tool, not a published app).
   - Add the scope `.../auth/photospicker.mediaitems.readonly` under "Scopes."
   - Add each family member's Gmail address under "Test users" — **while the app is in "Testing" publishing status, only listed test users can complete sign-in.** (Publishing to "Production" removes this restriction but triggers Google's verification process, which isn't necessary for a private family tool — stay in Testing and just list everyone who needs access as a test user.)
4. **Create an OAuth 2.0 Client ID**: APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**.
   - Authorized JavaScript origins: add the app's GitHub Pages URL (e.g. `https://<username>.github.io`) and, for local development, `http://localhost:5173`.
   - No redirect URI is needed for this flow (it's a token-only popup flow, not a redirect-based one).
   - Copy the resulting **Client ID** (not the secret — this flow doesn't use one).
5. **Set the Client ID in two places:**
   - As a GitHub repository secret named `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions) — used by the deploy workflow.
   - In your local `.env` (or however you run `npm run dev`) as `VITE_GOOGLE_CLIENT_ID=<the client ID>`.
6. **Deploy the Edge Function** (if not already done as part of implementing this feature): `cd supabase && npx supabase functions deploy google-photos-proxy --no-verify-jwt`. The `--no-verify-jwt` flag is required — see the function's own top comment for why. It needs no secrets of its own.

That's it — no Supabase Dashboard changes, no database migrations, no allowlist to maintain. Adding or removing who can use the feature means editing the OAuth consent screen's test-user list in step 3.
