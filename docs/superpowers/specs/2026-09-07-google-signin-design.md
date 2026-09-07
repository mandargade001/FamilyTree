# Google sign-in as an alternate unlock method — design

Spec 3a of the observations logged 2026-09-06 (item 4, "Google-based sign-in", split from the Google Photos/Drive picker request — see Non-goals). Scope: add "Sign in with Google" as a second way to unlock editing, alongside (not replacing) the existing shared passphrase.

## Problem / context

The app's current edit gate (`PassphraseGate.tsx`, `verify_passphrase`, and every write RPC checking it) is a single shared secret — anyone who knows the family passphrase can edit, with no per-person identity. PRODUCT.md explicitly commits to this: "No individual accounts/attribution... explicitly out of scope" and "Minimal gate, not a wall... never add friction beyond that single shared secret."

The observation asks for Google-based sign-in. Introducing it as a *replacement* for the passphrase would be a real break from that stated principle. Per discussion, the resolution is: **add Google sign-in as an alternative unlock path, keep the passphrase exactly as it is today.** Both paths coexist — whichever is easier for a given family member. PRODUCT.md's "no accounts" principle is superseded specifically for this feature, not abandoned generally: Google sign-in here is used purely as a second *unlock mechanism*, not as a basis for attribution, profiles, or per-user features elsewhere in the app.

**Key nuance surfaced during design:** Supabase's Google OAuth provider does not restrict *which* Google accounts can complete the sign-in flow — any Google account can authenticate. Restricting Google's own consent screen to specific accounts only works for Google Workspace orgs, not personal Gmail addresses, so that path isn't available. The actual gate is therefore a **second check, after sign-in**: an email allowlist enforced server-side at the point of every write. Signing in with Google gets someone a session; it does not by itself get them edit access — matching the passphrase's existing security property (knowing the door exists isn't the same as being let in).

## Design

### 1. Backend — allowlist + shared authorization check

New migration (`supabase/migrations/0007_google_signin.sql`):

```sql
create table allowed_editors (
  email text primary key
);
alter table allowed_editors enable row level security;
-- Deliberately no policies — same pattern as app_config: only reachable
-- through the SECURITY DEFINER function below, never directly.

create or replace function is_authorized(p_passphrase text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if verify_passphrase(p_passphrase) then
    return true;
  end if;
  if auth.uid() is not null then
    return exists (
      select 1 from allowed_editors
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
  end if;
  return false;
end;
$$;

grant execute on function is_authorized(text) to anon, authenticated;
```

Each of the 5 write RPCs (`add_person`, `update_person`, `delete_person`, `delete_relationship`, `add_relationship`) changes exactly one line: `if not verify_passphrase(p_passphrase) then` becomes `if not is_authorized(p_passphrase) then`. No signature changes, no other logic changes. `verify_passphrase` itself is untouched — `PassphraseGate.tsx`'s existing passphrase-entry flow keeps calling it directly, unaffected.

`is_authorized(null)` — the value the client sends when unlocked only via Google, with no passphrase stored — correctly falls through: `verify_passphrase(null)` already returns false (existing code, checked), so it proceeds to the `auth.uid()` check. When called by an anonymous (passphrase-only) request, `auth.uid()` is null and the function returns false, correctly requiring the passphrase to have matched instead.

### 2. Edge Function — photo upload

`supabase/functions/upload-photo/index.ts` currently creates its own service-role Supabase client and calls `verify_passphrase` directly — it never sees the calling browser's identity. Add a fallback: if the passphrase check fails, read the incoming request's `Authorization` header (present automatically when the browser has an active Supabase Auth session — see below), call `supabase.auth.getUser(token)` using the service-role client to resolve the token to an email, and check that email against `allowed_editors` (a plain `select`, since the service-role client bypasses RLS).

No client-side change is needed for this part: `supabase.functions.invoke()` (used by `api/photos.ts`'s `uploadPhoto`) already forwards the current session's access token in the `Authorization` header automatically whenever a Supabase Auth session exists — this is existing `@supabase/supabase-js` behavior, not something to build.

### 3. Client

- **New `client/src/lib/googleAuth.ts`:**
  - `signInWithGoogle(): Promise<void>` — calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <app's own base URL> } })`.
  - `signOutGoogle(): Promise<void>` — calls `supabase.auth.signOut()`.
  - No custom session-storage code needed — `createClient` already defaults to `detectSessionInUrl: true` and persists sessions in `localStorage` under its own key, independent of `vansh:passphrase`.

- **`client/src/App.tsx`:** adds `const [googleEmail, setGoogleEmail] = useState<string | null>(null)`, populated on mount via `supabase.auth.getSession()` and kept live via `supabase.auth.onAuthStateChange`. The existing `requirePassphrase(action)` gate (and its async twin `requestUploadPhoto`'s equivalent check) changes its condition from `if (getPassphrase())` to `if (getPassphrase() || googleEmail)` — both call sites, no other logic changes. A small control in the app toolbar — `Signed in as {googleEmail} · Sign out` — renders only when `googleEmail` is set; nothing renders when unlocked via passphrase only, preserving today's silent/unlabeled pattern for that path.

- **`client/src/components/gate/PassphraseGate.tsx`:** adds a "Sign in with Google" button below the existing passphrase field and Unlock button, separated by a plain "or" divider. Clicking it calls `signInWithGoogle()`, which redirects away and back (standard OAuth flow) — the gate itself doesn't need to handle the callback specially; `App.tsx`'s `onAuthStateChange` listener picks up the resulting session on return, and the existing gate-closing logic (`onUnlocked` callback path already wired for the passphrase case) needs a matching path for "closed because Google sign-in completed," handled by the same `onAuthStateChange` listener triggering `setPanel({ kind: 'none' })` when a session newly appears while the gate is open.

### 4. Manual setup (external, done later by the user — not part of the implementation plan itself)

Documented as an explicit checklist at implementation time, not performed by the assistant (no account access):
1. Create a Google Cloud Console project, configure the OAuth consent screen (External, since family members use personal Gmail), and create an OAuth 2.0 Client ID (Web application) with the Supabase project's callback URL as an authorized redirect URI.
2. In the Supabase Dashboard → Authentication → Providers → Google, enter the Client ID/Secret from step 1, and add the app's GitHub Pages URL to the allowed redirect URLs.
3. Insert family members' emails into `allowed_editors` via SQL (`insert into allowed_editors (email) values ('name@gmail.com'), ...`) — no admin UI exists for this; additions/removals are done by request, matching how the passphrase itself is currently rotated (direct SQL, documented in the `app_config` migration's own comment).

### Testing

- DB-level tests (this project's existing native-Postgres test setup, per README) for `is_authorized`: passphrase-only path still works with no session; an allowlisted email with a valid session (no passphrase) is authorized; a non-allowlisted email with a valid session is rejected; a null passphrase with no session is rejected.
- Each write RPC's existing "incorrect passphrase" test path is unaffected (still exercises the passphrase branch of `is_authorized`); no new per-RPC tests needed beyond confirming the swapped function name still rejects/accepts identically.
- Client tests mock `supabase.auth` (`getSession`, `onAuthStateChange`, `signInWithOAuth`, `signOut`) to verify: `requirePassphrase`'s gate opens the action directly when a Google session exists and no passphrase is stored; the toolbar sign-in indicator renders only when signed in; clicking "Sign out" clears it; the gate closes automatically when a session appears while it's open.

### Non-goals

- No attribution, profiles, avatars, or per-user features anywhere else in the app — Google identity is used solely as a second unlock mechanism for the existing shared-editing model. Every write remains anonymous in the data itself (no `created_by`/`edited_by` columns), exactly as today.
- No admin UI for managing `allowed_editors` — additions/removals are manual SQL, matching the existing passphrase-rotation pattern.
- No changes to the passphrase path itself, and no forced migration off it — it remains fully functional and unchanged.
- The Google Photos/Drive photo-import picker (the other half of the original observation) is Spec 3b, a separate spec, sequenced after this one.
