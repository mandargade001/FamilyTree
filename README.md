# Vansh

A digital family tree — a React tree view backed by Supabase (Postgres + Storage + Edge Functions), styled per the "Family Quilt" design system. See `PRODUCT.md` and `DESIGN.md` for product and design background, and `docs/superpowers/specs/` / `docs/superpowers/plans/` for the original design spec and implementation plan.

Live at: https://mandargade001.github.io/FamilyTree/ (once the deploy workflow below has run at least once).

## Project layout

```
client/     React + Vite + TypeScript frontend
supabase/   Postgres schema, RLS policies, RPC functions, Edge Function, and a local test harness
```

## Local development

### Prerequisites

- Node.js 20+
- A native local PostgreSQL install (not Docker) — this project's local database tests run against a real local Postgres instance directly, not the Supabase CLI's Docker-based stack.

### One-time database setup

```bash
brew install postgresql@16
pg_ctl -D /opt/homebrew/var/postgresql@16 start   # if `brew services start` doesn't actually start it on your machine, use this instead
createdb vansh_dev
psql vansh_dev -c "create role anon nologin; create role authenticated nologin;"
```

Apply the migrations, in order, by explicit filename:

```bash
psql vansh_dev -f supabase/migrations/0001_init_schema.sql
psql vansh_dev -f supabase/migrations/0002_rls_and_passphrase.sql
psql vansh_dev -f supabase/migrations/0003_rpc_functions.sql
psql vansh_dev -f supabase/migrations/0004_protect_app_config.sql
psql vansh_dev -f supabase/migrations/0005_prevent_reversed_spouse_duplicates.sql
```

The local dev passphrase is seeded as `changeme` (see `0002_rls_and_passphrase.sql`). Change it locally with:

```sql
update app_config set value = crypt('<your local passphrase>', gen_salt('bf')) where key = 'passphrase_hash';
```

### Running the database tests

```bash
cd supabase
npm install
cp .env.example .env   # edit DATABASE_URL inside if your Postgres runs on a non-default port
npm test
```

### Running the frontend

```bash
cd client
npm install
npm test              # unit/component tests (mocked Supabase client, no database needed)
npm run build          # production build
```

To actually run the app against a real Supabase project during local development:

```bash
VITE_SUPABASE_URL=<your project URL> VITE_SUPABASE_ANON_KEY=<your anon key> npm run dev
```

(There's no local dev-server mode against the local Postgres instance — the local Postgres setup above is for testing the SQL/RPC layer directly; the actual app always talks to a real Supabase project's REST/RPC API, local or hosted.)

## Deploying

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Link and push the schema:**
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Set the real family passphrase** via the Supabase SQL Editor:
   ```sql
   set search_path = public, extensions;
   update app_config set value = crypt('<a real passphrase>', gen_salt('bf')) where key = 'passphrase_hash';
   ```
   (The `set search_path` line is needed because hosted Supabase installs the `pgcrypto` extension — which provides `crypt`/`gen_salt` — into an `extensions` schema rather than `public`.)
4. **Create a public `photos` storage bucket** (Storage → New bucket, name it `photos`, public read).
5. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy upload-photo
   ```
6. **Push this repo to GitHub**, then set two repository secrets (Settings → Secrets and variables → Actions): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, from the Supabase project's API settings.
7. **Enable GitHub Pages** (Settings → Pages → Source = "GitHub Actions"). Pushing to `main`/`master` triggers `.github/workflows/deploy.yml`, which builds and deploys automatically.

**Note on the deploy path:** `client/vite.config.ts`'s `base` is set to match this repository's name. If you rename the GitHub repo, update that value to match, or the built assets will 404 on Pages.

## Security notes

- The shared passphrase is not rate-limited at the database level. Use a genuinely long passphrase, and consider configuring rate limiting in the Supabase dashboard for the `verify_passphrase` RPC if this becomes a concern.
- There are no individual accounts — anyone who knows the passphrase can add, edit, or delete any person. This is a deliberate design choice for a small family tool, not an oversight (see `docs/superpowers/specs/2026-09-05-family-tree-design.md`).

## Known follow-ups (not yet built)

- Uploaded photos are stored and listed per-person, but the app has no way to reorder, caption, or delete an individual photo once uploaded.
- There's no way to browse *all* people at once outside of the tree view and relationship search — a person with no relationships yet is only reachable by searching for them by name from another profile, or by having just created them (which now navigates to their profile automatically).
- No passphrase-rotation UI; rotating it is the manual SQL step above.

