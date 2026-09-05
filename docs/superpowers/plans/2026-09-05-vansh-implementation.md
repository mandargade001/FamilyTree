# Vansh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Vansh, a digital family tree app — a React/Vite frontend on GitHub Pages talking directly to Supabase (Postgres + Storage + Edge Functions), rendering a collapsible, passphrase-gated, "Family Quilt" styled tree.

**Architecture:** Two independent halves that meet only at the Supabase API surface. The database half (`supabase/`) owns schema, RLS, and passphrase-checked RPC functions — the only way to write data. The frontend half (`client/`) is a static SPA: pure graph functions compute what to render from `people`/`relationships` rows, presentational components render it in the Family Quilt visual language, and thin API wrappers call the RPCs. No custom server process exists anywhere.

**Tech Stack:** React 18 + TypeScript + Vite, `@supabase/supabase-js`, Vitest + React Testing Library (frontend tests), a native local PostgreSQL install + `pg` + Node's built-in test runner (database tests — see the note below), GitHub Actions + GitHub Pages (deploy).

**Deviation from spec — local database testing:** the original plan used the Supabase CLI's Docker-based local stack (`supabase start`) for database tests. This machine's container policy blocks Docker, so database tests (Tasks 2–6) instead run against a native local PostgreSQL install via the `pg` npm package, through a thin shim (`supabase/tests/db.js`) that mimics the `@supabase/supabase-js` calls the real app uses. This only changes how local tests connect — the migrations themselves are unchanged and portable, and the deployed app always talks to a real hosted Supabase project (see Task 22).

**Deviation from spec, noted here so it isn't mistaken for drift later:** the original design spec named the `family-chart` npm library for tree rendering. The approved Family Quilt visual/interaction system (dashed stitched patches, unfolding sibling flaps, seam-line connectors, focus-mode dimming) was designed and validated directly in HTML/CSS/flexbox, not against that library's rendering model, and doesn't map cleanly onto it. This plan builds the tree with plain React components and CSS layout instead of `family-chart`, since that's what the approved comp actually is.

## Global Constraints

- Node.js 20+, npm (not yarn/pnpm) for the client; a native local PostgreSQL install (via Homebrew) for local database development and tests — no Docker/Supabase CLI locally (see the deviation note above).
- All colors, spacing, radii, and type come from `DESIGN.md` — copy the exact hex/px/font values from that file into `client/src/styles/tokens.css`; no ad-hoc colors.
- Every table write goes through an RPC function that checks the passphrase; no table ever gets a public insert/update/delete RLS policy.
- `people.first_name` is the only required person field; every other person field and every relationship must degrade gracefully when absent.
- Dates are stored and passed as free text, never as SQL `date`/JS `Date` types.
- No individual accounts, no GEDCOM import/export, no passphrase-rotation UI — out of scope per the design spec.

---

## File Structure

```
FamilyTree/
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts
│       ├── styles/
│       │   ├── tokens.css
│       │   └── global.css
│       ├── lib/
│       │   ├── supabaseClient.ts
│       │   ├── passphrase.ts
│       │   └── familyGraph.ts
│       ├── api/
│       │   ├── people.ts
│       │   ├── relationships.ts
│       │   └── photos.ts
│       └── components/
│           ├── shared/
│           │   ├── Button.tsx
│           │   ├── Field.tsx
│           │   └── Icon.tsx
│           ├── tree/
│           │   ├── TreeView.tsx
│           │   ├── PersonPatch.tsx
│           │   ├── SeamLine.tsx
│           │   ├── SiblingFlap.tsx
│           │   └── AddParentSlot.tsx
│           ├── profile/
│           │   └── PersonProfile.tsx
│           ├── form/
│           │   └── PersonForm.tsx
│           ├── picker/
│           │   └── RelationshipPicker.tsx
│           └── gate/
│               └── PassphraseGate.tsx
├── .github/workflows/deploy.yml
└── supabase/
    ├── package.json
    ├── migrations/
    │   ├── 0001_init_schema.sql
    │   ├── 0002_rls_and_passphrase.sql
    │   └── 0003_rpc_functions.sql
    ├── functions/
    │   └── upload-photo/index.ts
    └── tests/
        ├── db.js
        └── rpc.test.js
```

---

### Task 1: Scaffold the client app and design tokens

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/vitest.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/styles/tokens.css`
- Create: `client/src/styles/global.css`
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Produces: `App` component (default export from `client/src/App.tsx`), mounted at `#root`.

- [ ] **Step 1: Create the Vite project files**

`client/package.json`:
```json
{
  "name": "vansh-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

`client/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/vansh/',
})
```

`client/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
})
```

`client/vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

`client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vansh</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`client/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`client/src/App.tsx`:
```tsx
export default function App() {
  return <div className="app">Vansh</div>
}
```

`client/src/styles/tokens.css` — every value copied verbatim from `DESIGN.md`:
```css
:root {
  --canvas: #EAE5D9;
  --patch: #F5F1E7;
  --patch-alt: #EFE8DA;
  --ink: #2B2A26;
  --muted: #7A705F;
  --border: #C9C0AE;
  --border-strong: #A89A80;
  --thread: #33436E;
  --thread-soft: #DCE1EE;
  --thread-ink: #1F2A47;
  --stitch-new: #A85630;
  --stitch-new-soft: #F1DED2;
  --shadow-resting: 0 1px 2px rgba(43, 42, 38, 0.10);
  --shadow-lifted: 0 6px 16px -4px rgba(43, 42, 38, 0.22), 0 2px 5px rgba(43, 42, 38, 0.10);
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-pill: 16px;
  --space-xs: 6px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 22px;
  --space-xxl: 26px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --canvas: #211F1A;
    --patch: #2A2721;
    --patch-alt: #302C25;
    --ink: #EDE7DA;
    --muted: #A79E8C;
    --border: #4A4438;
    --border-strong: #675E4C;
    --thread: #93A6DB;
    --thread-soft: #2B3550;
    --thread-ink: #DCE4FA;
    --stitch-new: #D98860;
    --stitch-new-soft: #4A2E22;
    --shadow-resting: 0 1px 2px rgba(0, 0, 0, 0.35);
    --shadow-lifted: 0 10px 22px -6px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4);
  }
}

:root[data-theme='dark'] {
  --canvas: #211F1A;
  --patch: #2A2721;
  --patch-alt: #302C25;
  --ink: #EDE7DA;
  --muted: #A79E8C;
  --border: #4A4438;
  --border-strong: #675E4C;
  --thread: #93A6DB;
  --thread-soft: #2B3550;
  --thread-ink: #DCE4FA;
  --stitch-new: #D98860;
  --stitch-new-soft: #4A2E22;
  --shadow-resting: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-lifted: 0 10px 22px -6px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4);
}
```

`client/src/styles/global.css`:
```css
* { box-sizing: border-box; }
::selection { background: var(--thread-soft); color: var(--ink); }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.app { max-width: 1180px; margin: 0 auto; padding: 28px 20px 72px; }
```

- [ ] **Step 2: Write the failing smoke test**

`client/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the app shell', () => {
  render(<App />)
  expect(screen.getByText('Vansh')).toBeInTheDocument()
})
```

- [ ] **Step 3: Install dependencies and run the test**

Run: `cd client && npm install && npm test`
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add client/
git commit -m "Scaffold Vite/React client with Family Quilt design tokens"
```

---

### Task 2: Local Postgres and core schema

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`
- Create: `supabase/package.json`
- Create: `supabase/tests/db.js`
- Create: `supabase/tests/rpc.test.js`

**Interfaces:**
- Produces: tables `people(id, first_name, last_name, gender, birth_date, death_date, birth_place, occupation, bio, created_at, updated_at)` and `relationships(id, type, from_id, to_id, created_at)`; a `supabase/tests/db.js` test harness exposing a `supabase`-shaped object (`.rpc()`, `.from(table).select()/.insert()`) backed directly by Postgres via the `pg` npm package, plus the raw `pool` for role-switching.

**Local database setup (no Docker):** this project's database tests run against a native local PostgreSQL install, not the Supabase CLI's Docker-based local stack (blocked by this machine's container policy). The deployed app is unaffected — it always talks to a real hosted Supabase project, never this local database.

- [ ] **Step 1: Install and start PostgreSQL locally, create the dev database and roles**

Run: `brew install postgresql@16`
Run: `brew services start postgresql@16`
Run: `createdb vansh_dev`
Run: `psql vansh_dev -c "create role anon nologin; create role authenticated nologin;"` — one-time, local-only. These exact role names (`anon`, `authenticated`) already exist in any real Supabase project; creating them locally means the same migration SQL (which only ever `grant`s to these names) works unchanged in both places.

Confirm connectivity: `psql vansh_dev -c "select 1;"` → expect a single row containing `1`.

- [ ] **Step 2: Write the schema migration**

`supabase/migrations/0001_init_schema.sql`:
```sql
create extension if not exists pgcrypto;

create table people (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text,
  gender        text,
  birth_date    text,
  death_date    text,
  birth_place   text,
  occupation    text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table relationships (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('parent-child', 'spouse')),
  from_id    uuid not null references people(id) on delete cascade,
  to_id      uuid not null references people(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index relationships_from_id_idx on relationships(from_id);
create index relationships_to_id_idx on relationships(to_id);
```

- [ ] **Step 3: Apply the migration and verify the tables exist**

Run: `for f in supabase/migrations/*.sql; do psql vansh_dev -f "$f"; done` (this is the standard way every later task applies new migrations too — always re-run the whole loop, it's idempotent-safe since each task only adds new files)
Run: `psql vansh_dev -c "select table_name from information_schema.tables where table_schema = 'public' order by table_name;"`
Expected output includes: `people`, `relationships`

- [ ] **Step 4: Set up the database test harness**

`supabase/package.json`:
```json
{
  "name": "vansh-supabase-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  },
  "dependencies": {
    "pg": "^8.13.0"
  }
}
```

`supabase/tests/db.js` — a thin shim exposing the same `.rpc()` / `.from(table).select()/.insert()` shape the app's real `@supabase/supabase-js` client uses, so every later task's test code reads identically to what it would against real Supabase:
```js
import pg from 'pg'

const { Pool } = pg
export const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql:///vansh_dev' })

function toError(err) {
  return { message: err.message }
}

export const supabase = {
  async rpc(fnName, args = {}) {
    const keys = Object.keys(args)
    const values = keys.map((k) => args[k])
    const namedArgs = keys.map((k, i) => `${k} := $${i + 1}`).join(', ')
    try {
      const res = await pool.query(`select ${fnName}(${namedArgs}) as result`, values)
      return { data: res.rows[0]?.result ?? null, error: null }
    } catch (err) {
      return { data: null, error: toError(err) }
    }
  },
  from(table) {
    return {
      select(cols = '*') {
        const state = { filters: [], limitN: null }
        async function run() {
          let sql = `select ${cols} from ${table}`
          const values = []
          state.filters.forEach((f, i) => {
            sql += i === 0 ? ' where' : ' and'
            values.push(f.val)
            sql += ` ${f.col} = $${values.length}`
          })
          if (state.limitN) sql += ` limit ${state.limitN}`
          try {
            const res = await pool.query(sql, values)
            return { data: res.rows, error: null }
          } catch (err) {
            return { data: null, error: toError(err) }
          }
        }
        const builder = {
          eq(col, val) {
            state.filters.push({ col, val })
            return builder
          },
          limit(n) {
            state.limitN = n
            return builder
          },
          async single() {
            const r = await run()
            if (r.error) return r
            return r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { message: 'no rows' } }
          },
          then(resolve, reject) {
            return run().then(resolve, reject)
          },
        }
        return builder
      },
      async insert(row) {
        const keys = Object.keys(row)
        const values = keys.map((k) => row[k])
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
        try {
          await pool.query(`insert into ${table} (${keys.join(', ')}) values (${placeholders})`, values)
          return { error: null }
        } catch (err) {
          return { error: toError(err) }
        }
      },
    }
  },
}
```

`supabase/tests/rpc.test.js` (starter — grows in later tasks):
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { supabase } from './db.js'

test('people table exists and accepts a row via service-level insert check', async () => {
  const { error } = await supabase.from('people').select('id').limit(1)
  assert.equal(error, null)
})
```

Run: `cd supabase && npm install && npm test`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "Add Supabase project with people/relationships schema"
```

---

### Task 3: Row-Level Security and the passphrase check

**Files:**
- Create: `supabase/migrations/0002_rls_and_passphrase.sql`
- Modify: `supabase/tests/rpc.test.js`

**Interfaces:**
- Produces: SQL function `verify_passphrase(p_passphrase text) returns boolean`.
- Consumes: `pool` (raw `pg` Pool) from `supabase/tests/db.js`, Task 2 — needed here because the test connection is the database owner/superuser by default, which bypasses Row-Level Security entirely; asserting RLS actually blocks a write requires briefly running the query as the low-privilege `anon` role instead.

- [ ] **Step 1: Write the failing test (direct write must be rejected, verify_passphrase must exist)**

First, change the existing top-of-file import in `supabase/tests/rpc.test.js` from `import { supabase } from './db.js'` to `import { supabase, pool } from './db.js'`. Then add:
```js
test('anon cannot insert into people directly (RLS blocks it)', async () => {
  await pool.query('set role anon')
  try {
    const { error } = await supabase.from('people').insert({ first_name: 'Blocked' })
    assert.ok(error, 'expected an RLS error but insert succeeded')
  } finally {
    await pool.query('reset role')
  }
})

test('verify_passphrase rejects the wrong passphrase', async () => {
  const { data, error } = await supabase.rpc('verify_passphrase', { p_passphrase: 'definitely-wrong' })
  assert.equal(error, null)
  assert.equal(data, false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd supabase && npm test`
Expected: FAIL — insert currently succeeds (no RLS yet) and `verify_passphrase` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0002_rls_and_passphrase.sql`:
```sql
alter table people enable row level security;
alter table relationships enable row level security;

create policy people_select_all on people for select using (true);
create policy relationships_select_all on relationships for select using (true);
-- Deliberately no insert/update/delete policies: every write must go through
-- a security-definer RPC function that checks the passphrase itself.

create table app_config (
  key   text primary key,
  value text not null
);

-- Deploy-time value: replace via
--   update app_config set value = crypt('<real passphrase>', gen_salt('bf')) where key = 'passphrase_hash';
insert into app_config (key, value) values ('passphrase_hash', crypt('changeme', gen_salt('bf')));

create or replace function verify_passphrase(p_passphrase text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select value into v_hash from app_config where key = 'passphrase_hash';
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_passphrase, v_hash);
end;
$$;

grant execute on function verify_passphrase(text) to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and run the tests**

Run: `for f in supabase/migrations/*.sql; do psql vansh_dev -f "$f"; done`
Run: `cd supabase && npm test`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "Add RLS (read-open, write-closed) and passphrase verification"
```

---

### Task 4: `add_person` and `update_person` RPCs

**Files:**
- Create: `supabase/migrations/0003_rpc_functions.sql`
- Modify: `supabase/tests/rpc.test.js`

**Interfaces:**
- Produces: `add_person(p_passphrase, p_first_name, p_last_name, p_gender, p_birth_date, p_death_date, p_birth_place, p_occupation, p_bio) returns uuid`; `update_person(p_passphrase, p_id, p_first_name, ...same fields) returns void`.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/tests/rpc.test.js`:
```js
test('add_person rejects a missing first name', async () => {
  const { error } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: '',
  })
  assert.ok(error)
})

test('add_person rejects the wrong passphrase', async () => {
  const { error } = await supabase.rpc('add_person', {
    p_passphrase: 'wrong',
    p_first_name: 'Anna',
  })
  assert.ok(error)
})

test('add_person creates a person with the correct passphrase', async () => {
  const { data, error } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: 'Anna',
    p_last_name: 'Gade',
    p_birth_date: '1932',
  })
  assert.equal(error, null)
  assert.ok(data, 'expected a returned uuid')

  const { data: row } = await supabase.from('people').select('*').eq('id', data).single()
  assert.equal(row.first_name, 'Anna')
  assert.equal(row.birth_date, '1932')
})

test('update_person changes fields on an existing person', async () => {
  const { data: id } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: 'Ravi',
  })
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: 'changeme',
    p_id: id,
    p_first_name: 'Ravi',
    p_occupation: 'Engineer',
  })
  assert.equal(error, null)

  const { data: row } = await supabase.from('people').select('*').eq('id', id).single()
  assert.equal(row.occupation, 'Engineer')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd supabase && npm test`
Expected: FAIL — `add_person`/`update_person` do not exist yet.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0003_rpc_functions.sql`:
```sql
create or replace function add_person(
  p_passphrase   text,
  p_first_name   text,
  p_last_name    text default null,
  p_gender       text default null,
  p_birth_date   text default null,
  p_death_date   text default null,
  p_birth_place  text default null,
  p_occupation   text default null,
  p_bio          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'first name is required';
  end if;

  insert into people (first_name, last_name, gender, birth_date, death_date, birth_place, occupation, bio)
  values (p_first_name, p_last_name, p_gender, p_birth_date, p_death_date, p_birth_place, p_occupation, p_bio)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function add_person(text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function update_person(
  p_passphrase   text,
  p_id           uuid,
  p_first_name   text,
  p_last_name    text default null,
  p_gender       text default null,
  p_birth_date   text default null,
  p_death_date   text default null,
  p_birth_place  text default null,
  p_occupation   text default null,
  p_bio          text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'first name is required';
  end if;

  update people set
    first_name = p_first_name,
    last_name = p_last_name,
    gender = p_gender,
    birth_date = p_birth_date,
    death_date = p_death_date,
    birth_place = p_birth_place,
    occupation = p_occupation,
    bio = p_bio,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'person not found';
  end if;
end;
$$;

grant execute on function update_person(text, uuid, text, text, text, text, text, text, text, text) to anon, authenticated;
```

- [ ] **Step 4: Apply and run the tests**

Run: `for f in supabase/migrations/*.sql; do psql vansh_dev -f "$f"; done`
Run: `cd supabase && npm test`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "Add add_person and update_person RPC functions"
```

---

### Task 5: `delete_person` and `delete_relationship` RPCs

**Files:**
- Modify: `supabase/migrations/0003_rpc_functions.sql`
- Modify: `supabase/tests/rpc.test.js`

**Interfaces:**
- Produces: `delete_person(p_passphrase, p_id) returns void`; `delete_relationship(p_passphrase, p_id) returns void`.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/tests/rpc.test.js`:
```js
test('delete_person removes the row and cascades its relationships', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Deletable Parent' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Deletable Child' })
  await supabase.rpc('add_relationship', { p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId })

  const { error } = await supabase.rpc('delete_person', { p_passphrase: 'changeme', p_id: parentId })
  assert.equal(error, null)

  const { data: remaining } = await supabase.from('relationships').select('*').eq('from_id', parentId)
  assert.equal(remaining.length, 0)
})

test('delete_person rejects the wrong passphrase and leaves the row intact', async () => {
  const { data: id } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Protected' })
  const { error } = await supabase.rpc('delete_person', { p_passphrase: 'wrong', p_id: id })
  assert.ok(error)

  const { data: row } = await supabase.from('people').select('*').eq('id', id).single()
  assert.ok(row)
})
```

(Note: `add_relationship` is written in Task 6 — this test file is committed to failing until then; run it again after Task 6 lands.)

- [ ] **Step 2: Write the migration addition**

Append to `supabase/migrations/0003_rpc_functions.sql`:
```sql
create or replace function delete_person(p_passphrase text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  delete from people where id = p_id;
  if not found then
    raise exception 'person not found';
  end if;
end;
$$;

grant execute on function delete_person(text, uuid) to anon, authenticated;

create or replace function delete_relationship(p_passphrase text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  delete from relationships where id = p_id;
  if not found then
    raise exception 'relationship not found';
  end if;
end;
$$;

grant execute on function delete_relationship(text, uuid) to anon, authenticated;
```

- [ ] **Step 3: Apply the migration**

Run: `for f in supabase/migrations/*.sql; do psql vansh_dev -f "$f"; done`

- [ ] **Step 4: Run the tests once Task 6's `add_relationship` also exists, verify pass**

Run: `cd supabase && npm test`
Expected: the two new tests pass once Task 6 is also complete (they depend on `add_relationship`).

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "Add delete_person and delete_relationship RPC functions"
```

---

### Task 6: `add_relationship` RPC with cycle guard

**Files:**
- Modify: `supabase/migrations/0003_rpc_functions.sql`
- Modify: `supabase/tests/rpc.test.js`

**Interfaces:**
- Produces: `add_relationship(p_passphrase, p_type, p_from_id, p_to_id) returns uuid`. For `type = 'parent-child'`, `from_id` is the parent and `to_id` is the child (matches the `people`/`relationships` example in the design spec).

- [ ] **Step 1: Write the failing tests**

Add to `supabase/tests/rpc.test.js`:
```js
test('add_relationship links a parent to a child', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Meera' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Rohan' })

  const { data, error } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId,
  })
  assert.equal(error, null)
  assert.ok(data)
})

test('add_relationship rejects a relationship that would make someone their own ancestor', async () => {
  const { data: grandparentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Grandparent' })
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Parent' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Child' })

  await supabase.rpc('add_relationship', { p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: grandparentId, p_to_id: parentId })
  await supabase.rpc('add_relationship', { p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId })

  // Child cannot become an ancestor of Grandparent — this would create a cycle.
  const { error } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: childId, p_to_id: grandparentId,
  })
  assert.ok(error, 'expected the cycle to be rejected')
})

test('add_relationship rejects an invalid relationship type', async () => {
  const { data: a } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'A' })
  const { data: b } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'B' })
  const { error } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'sibling', p_from_id: a, p_to_id: b,
  })
  assert.ok(error)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd supabase && npm test`
Expected: FAIL — `add_relationship` does not exist yet.

- [ ] **Step 3: Write the migration addition**

Append to `supabase/migrations/0003_rpc_functions.sql`:
```sql
create or replace function add_relationship(
  p_passphrase text,
  p_type       text,
  p_from_id    uuid,
  p_to_id      uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_would_cycle boolean;
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  if p_type not in ('parent-child', 'spouse') then
    raise exception 'invalid relationship type: %', p_type;
  end if;
  if p_from_id = p_to_id then
    raise exception 'a person cannot be related to themselves';
  end if;

  if p_type = 'parent-child' then
    -- p_from_id is the proposed parent, p_to_id is the proposed child.
    -- Reject if p_from_id is already a descendant of p_to_id — that would
    -- make the new "parent" also a descendant of their own new "child".
    with recursive descendants as (
      select to_id as id from relationships where type = 'parent-child' and from_id = p_to_id
      union
      select r.to_id from relationships r
      join descendants d on r.from_id = d.id
      where r.type = 'parent-child'
    )
    select exists(select 1 from descendants where id = p_from_id) into v_would_cycle;

    if v_would_cycle then
      raise exception 'this relationship would make one person their own ancestor';
    end if;
  end if;

  insert into relationships (type, from_id, to_id) values (p_type, p_from_id, p_to_id)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function add_relationship(text, text, uuid, uuid) to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and run all Supabase tests**

Run: `for f in supabase/migrations/*.sql; do psql vansh_dev -f "$f"; done`
Run: `cd supabase && npm test`
Expected: PASS (all tests across Tasks 3–6, including the Task 5 tests that depended on this function)

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "Add add_relationship RPC with ancestor-cycle guard"
```

---

### Task 7: Frontend types, Supabase client, and API wrappers

**Files:**
- Create: `client/src/types.ts`
- Create: `client/src/lib/supabaseClient.ts`
- Create: `client/src/lib/passphrase.ts`
- Create: `client/src/api/people.ts`
- Create: `client/src/api/relationships.ts`
- Test: `client/src/lib/passphrase.test.ts`
- Test: `client/src/api/people.test.ts`

**Interfaces:**
- Produces: `Person`, `RelationshipType`, `Relationship` types; `getPassphrase()`, `setPassphrase(value: string)`, `clearPassphrase()`; `fetchPeople(): Promise<Person[]>`, `addPerson(fields): Promise<string>`, `updatePerson(id, fields): Promise<void>`, `deletePerson(id): Promise<void>`; `fetchRelationships(): Promise<Relationship[]>`, `addRelationship(type, fromId, toId): Promise<string>`, `deleteRelationship(id): Promise<void>`.

- [ ] **Step 1: Write the types**

`client/src/types.ts`:
```ts
export interface Person {
  id: string
  first_name: string
  last_name: string | null
  gender: string | null
  birth_date: string | null
  death_date: string | null
  birth_place: string | null
  occupation: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

export type PersonFields = Omit<Person, 'id' | 'created_at' | 'updated_at'>

export type RelationshipType = 'parent-child' | 'spouse'

export interface Relationship {
  id: string
  type: RelationshipType
  from_id: string
  to_id: string
}
```

- [ ] **Step 2: Write the Supabase client**

`client/src/lib/supabaseClient.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set')
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 3: Write the failing passphrase test**

`client/src/lib/passphrase.test.ts`:
```ts
import { getPassphrase, setPassphrase, clearPassphrase } from './passphrase'

beforeEach(() => localStorage.clear())

test('returns null when nothing is stored', () => {
  expect(getPassphrase()).toBeNull()
})

test('stores and retrieves the passphrase', () => {
  setPassphrase('sesame')
  expect(getPassphrase()).toBe('sesame')
})

test('clearPassphrase removes it', () => {
  setPassphrase('sesame')
  clearPassphrase()
  expect(getPassphrase()).toBeNull()
})
```

Run: `cd client && npm test`
Expected: FAIL — `./passphrase` module does not exist.

- [ ] **Step 4: Implement passphrase.ts**

`client/src/lib/passphrase.ts`:
```ts
const KEY = 'vansh:passphrase'

export function getPassphrase(): string | null {
  return localStorage.getItem(KEY)
}

export function setPassphrase(value: string): void {
  localStorage.setItem(KEY, value)
}

export function clearPassphrase(): void {
  localStorage.removeItem(KEY)
}
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 5: Write the failing people API test**

`client/src/api/people.test.ts`:
```ts
import { vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../lib/passphrase', () => ({
  getPassphrase: () => 'sesame',
}))

import { supabase } from '../lib/supabaseClient'
import { fetchPeople, addPerson } from './people'

test('fetchPeople selects all rows from the people table', async () => {
  const select = vi.fn().mockResolvedValue({ data: [{ id: '1', first_name: 'Anna' }], error: null })
  ;(supabase.from as any).mockReturnValue({ select })

  const people = await fetchPeople()
  expect(supabase.from).toHaveBeenCalledWith('people')
  expect(people).toEqual([{ id: '1', first_name: 'Anna' }])
})

test('addPerson calls the add_person RPC with the stored passphrase', async () => {
  ;(supabase.rpc as any).mockResolvedValue({ data: 'new-id', error: null })

  const id = await addPerson({
    first_name: 'Anna', last_name: null, gender: null,
    birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null,
  })

  expect(supabase.rpc).toHaveBeenCalledWith('add_person', expect.objectContaining({
    p_passphrase: 'sesame',
    p_first_name: 'Anna',
  }))
  expect(id).toBe('new-id')
})
```

Run: `cd client && npm test`
Expected: FAIL — `./people` module does not exist.

- [ ] **Step 6: Implement people.ts and relationships.ts**

`client/src/api/people.ts`:
```ts
import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'
import type { Person, PersonFields } from '../types'

export async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from('people').select('*')
  if (error) throw error
  return data as Person[]
}

export async function addPerson(fields: PersonFields): Promise<string> {
  const { data, error } = await supabase.rpc('add_person', {
    p_passphrase: getPassphrase(),
    p_first_name: fields.first_name,
    p_last_name: fields.last_name,
    p_gender: fields.gender,
    p_birth_date: fields.birth_date,
    p_death_date: fields.death_date,
    p_birth_place: fields.birth_place,
    p_occupation: fields.occupation,
    p_bio: fields.bio,
  })
  if (error) throw error
  return data as string
}

export async function updatePerson(id: string, fields: PersonFields): Promise<void> {
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: getPassphrase(),
    p_id: id,
    p_first_name: fields.first_name,
    p_last_name: fields.last_name,
    p_gender: fields.gender,
    p_birth_date: fields.birth_date,
    p_death_date: fields.death_date,
    p_birth_place: fields.birth_place,
    p_occupation: fields.occupation,
    p_bio: fields.bio,
  })
  if (error) throw error
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_person', {
    p_passphrase: getPassphrase(),
    p_id: id,
  })
  if (error) throw error
}
```

`client/src/api/relationships.ts`:
```ts
import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'
import type { Relationship, RelationshipType } from '../types'

export async function fetchRelationships(): Promise<Relationship[]> {
  const { data, error } = await supabase.from('relationships').select('*')
  if (error) throw error
  return data as Relationship[]
}

export async function addRelationship(
  type: RelationshipType,
  fromId: string,
  toId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_relationship', {
    p_passphrase: getPassphrase(),
    p_type: type,
    p_from_id: fromId,
    p_to_id: toId,
  })
  if (error) throw error
  return data as string
}

export async function deleteRelationship(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_relationship', {
    p_passphrase: getPassphrase(),
    p_id: id,
  })
  if (error) throw error
}
```

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add client/src/types.ts client/src/lib/ client/src/api/
git commit -m "Add types, Supabase client, and passphrase-carrying API wrappers"
```

---

### Task 8: Family graph — basic relationship lookups

**Files:**
- Create: `client/src/lib/familyGraph.ts`
- Test: `client/src/lib/familyGraph.test.ts`

**Interfaces:**
- Produces: `getParentIds(personId, relationships): string[]`, `getChildIds(personId, relationships): string[]`, `getSpouseIds(personId, relationships): string[]`, `getSiblingIds(personId, relationships): string[]`.
- Consumes: `Relationship` type from Task 7.

- [ ] **Step 1: Write the failing tests using a shared fixture**

`client/src/lib/familyGraph.test.ts`:
```ts
import { getParentIds, getChildIds, getSpouseIds, getSiblingIds } from './familyGraph'
import type { Relationship } from '../types'

// Anna & Ravi are Meera, Sanjay, and Deepak's parents. Sanjay married Priya.
// Meera's child is Rohan.
const relationships: Relationship[] = [
  { id: 'r1', type: 'spouse', from_id: 'anna', to_id: 'ravi' },
  { id: 'r2', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r3', type: 'parent-child', from_id: 'ravi', to_id: 'meera' },
  { id: 'r4', type: 'parent-child', from_id: 'anna', to_id: 'sanjay' },
  { id: 'r5', type: 'parent-child', from_id: 'ravi', to_id: 'sanjay' },
  { id: 'r6', type: 'parent-child', from_id: 'anna', to_id: 'deepak' },
  { id: 'r7', type: 'parent-child', from_id: 'ravi', to_id: 'deepak' },
  { id: 'r8', type: 'spouse', from_id: 'sanjay', to_id: 'priya' },
  { id: 'r9', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
]

test('getParentIds returns both recorded parents', () => {
  expect(getParentIds('meera', relationships).sort()).toEqual(['anna', 'ravi'])
})

test('getParentIds returns an empty array for a root ancestor', () => {
  expect(getParentIds('anna', relationships)).toEqual([])
})

test('getChildIds returns every child regardless of which parent is queried', () => {
  expect(getChildIds('anna', relationships).sort()).toEqual(['deepak', 'meera', 'sanjay'])
  expect(getChildIds('ravi', relationships).sort()).toEqual(['deepak', 'meera', 'sanjay'])
})

test('getSpouseIds returns the other side of a spouse edge either direction', () => {
  expect(getSpouseIds('sanjay', relationships)).toEqual(['priya'])
  expect(getSpouseIds('priya', relationships)).toEqual(['sanjay'])
})

test('getSpouseIds returns an empty array when no spouse is recorded', () => {
  expect(getSpouseIds('rohan', relationships)).toEqual([])
})

test('getSiblingIds returns everyone sharing a parent, excluding self', () => {
  expect(getSiblingIds('meera', relationships).sort()).toEqual(['deepak', 'sanjay'])
})

test('getSiblingIds returns an empty array for someone with no recorded parents', () => {
  expect(getSiblingIds('anna', relationships)).toEqual([])
})
```

Run: `cd client && npm test`
Expected: FAIL — `./familyGraph` module does not exist.

- [ ] **Step 2: Implement the lookup functions**

`client/src/lib/familyGraph.ts`:
```ts
import type { Relationship } from '../types'

export function getParentIds(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'parent-child' && r.to_id === personId)
    .map((r) => r.from_id)
}

export function getChildIds(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'parent-child' && r.from_id === personId)
    .map((r) => r.to_id)
}

export function getSpouseIds(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'spouse' && (r.from_id === personId || r.to_id === personId))
    .map((r) => (r.from_id === personId ? r.to_id : r.from_id))
}

export function getSiblingIds(personId: string, relationships: Relationship[]): string[] {
  const parents = getParentIds(personId, relationships)
  if (parents.length === 0) return []
  const siblingSet = new Set<string>()
  for (const parentId of parents) {
    for (const childId of getChildIds(parentId, relationships)) {
      if (childId !== personId) siblingSet.add(childId)
    }
  }
  return [...siblingSet]
}
```

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/familyGraph.ts client/src/lib/familyGraph.test.ts
git commit -m "Add family graph lookup functions (parents, children, spouse, siblings)"
```

---

### Task 9: Family graph — immediate family (for focus mode)

**Files:**
- Modify: `client/src/lib/familyGraph.ts`
- Modify: `client/src/lib/familyGraph.test.ts`

**Interfaces:**
- Consumes: `getParentIds`, `getChildIds`, `getSpouseIds`, `getSiblingIds` from Task 8.
- Produces: `computeImmediateFamily(personId, relationships): ImmediateFamily`, and the `ImmediateFamily` type.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/lib/familyGraph.test.ts`:
```ts
import { computeImmediateFamily } from './familyGraph'

test('computeImmediateFamily gathers parents, spouse, children, and siblings', () => {
  const family = computeImmediateFamily('sanjay', relationships)
  expect(family.parents.sort()).toEqual(['anna', 'ravi'])
  expect(family.spouse).toBe('priya')
  expect(family.children).toEqual([])
  expect(family.siblings.sort()).toEqual(['deepak', 'meera'])
})

test('computeImmediateFamily handles someone with no spouse and no siblings', () => {
  const family = computeImmediateFamily('rohan', relationships)
  expect(family.parents).toEqual(['meera'])
  expect(family.spouse).toBeNull()
  expect(family.children).toEqual([])
  expect(family.siblings).toEqual([])
})
```

Run: `cd client && npm test`
Expected: FAIL — `computeImmediateFamily` does not exist.

- [ ] **Step 2: Implement it**

Add to `client/src/lib/familyGraph.ts`:
```ts
export interface ImmediateFamily {
  parents: string[]
  spouse: string | null
  children: string[]
  siblings: string[]
}

export function computeImmediateFamily(personId: string, relationships: Relationship[]): ImmediateFamily {
  const spouses = getSpouseIds(personId, relationships)
  return {
    parents: getParentIds(personId, relationships),
    spouse: spouses[0] ?? null,
    children: getChildIds(personId, relationships),
    siblings: getSiblingIds(personId, relationships),
  }
}
```

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/familyGraph.ts client/src/lib/familyGraph.test.ts
git commit -m "Add computeImmediateFamily for focus mode"
```

---

### Task 10: Family graph — ancestor lineage rows

**Files:**
- Modify: `client/src/lib/familyGraph.ts`
- Modify: `client/src/lib/familyGraph.test.ts`

**Interfaces:**
- Consumes: `getParentIds`, `getSiblingIds` from Task 8.
- Produces: `AncestorUnit` type (`{ personId: string; spouseId: string | null }`), `AncestorRow` type (`{ depth: number; units: AncestorUnit[] }`), `buildAncestorRows(focalId, relationships): AncestorRow[]`.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/lib/familyGraph.test.ts`:
```ts
import { buildAncestorRows } from './familyGraph'

test('buildAncestorRows returns the focal person alone at depth 0', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0]).toEqual({ depth: 0, units: [{ personId: 'meera', spouseId: null }] })
})

test('buildAncestorRows walks up through recorded parent couples', () => {
  const rows = buildAncestorRows('meera', relationships)
  // depth 1: Meera's parents, Anna & Ravi, as one couple unit
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'anna', spouseId: 'ravi' }])
})

test('buildAncestorRows stops at a generation with no recorded parents', () => {
  const rows = buildAncestorRows('meera', relationships)
  // Anna and Ravi have no recorded parents, so there is no depth 2 row
  expect(rows.some((r) => r.depth === 2)).toBe(false)
})

test('buildAncestorRows handles someone with only one recorded parent', () => {
  const oneParent: Relationship[] = [
    { id: 'x1', type: 'parent-child', from_id: 'solo-parent', to_id: 'solo-child' },
  ]
  const rows = buildAncestorRows('solo-child', oneParent)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'solo-parent', spouseId: null }])
})
```

Run: `cd client && npm test`
Expected: FAIL — `buildAncestorRows` does not exist.

- [ ] **Step 2: Implement it**

Add to `client/src/lib/familyGraph.ts`:
```ts
export interface AncestorUnit {
  personId: string
  spouseId: string | null
}

export interface AncestorRow {
  depth: number
  units: AncestorUnit[]
}

export function buildAncestorRows(focalId: string, relationships: Relationship[]): AncestorRow[] {
  const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: focalId, spouseId: getSpouseIds(focalId, relationships)[0] ?? null }] }]

  let currentIds = [focalId]
  let depth = 0

  while (currentIds.length > 0) {
    depth += 1
    const seenParentIds = new Set<string>()
    const units: AncestorUnit[] = []

    for (const id of currentIds) {
      for (const parentId of getParentIds(id, relationships)) {
        if (seenParentIds.has(parentId)) continue
        const spouseId = getSpouseIds(parentId, relationships)[0] ?? null
        if (spouseId) seenParentIds.add(spouseId)
        seenParentIds.add(parentId)
        units.push({ personId: parentId, spouseId })
      }
    }

    if (units.length === 0) break
    rows.push({ depth, units })
    currentIds = units.flatMap((u) => (u.spouseId ? [u.personId, u.spouseId] : [u.personId]))
  }

  return rows
}
```

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/familyGraph.ts client/src/lib/familyGraph.test.ts
git commit -m "Add buildAncestorRows for ancestor-generation tree layout"
```

---

### Task 11: Shared UI primitives (Button, Field, Icon)

**Files:**
- Create: `client/src/components/shared/Button.tsx`
- Create: `client/src/components/shared/Field.tsx`
- Create: `client/src/components/shared/Icon.tsx`
- Test: `client/src/components/shared/Button.test.tsx`

**Interfaces:**
- Produces: `<Button variant="primary" | "ghost" active={boolean}>`, `<Field label required? type="text"|"textarea">`, `<Icon name="search"|"plus"|"lock"|"photo"|"edit"|"close"|"chevron-down">`.

- [ ] **Step 1: Write the failing Button test**

`client/src/components/shared/Button.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

test('renders its label and fires onClick', () => {
  const onClick = vi.fn()
  render(<Button variant="primary" onClick={onClick}>Add Person</Button>)
  fireEvent.click(screen.getByText('Add Person'))
  expect(onClick).toHaveBeenCalledOnce()
})

test('applies the ghost variant class', () => {
  render(<Button variant="ghost">Focus Mode</Button>)
  expect(screen.getByText('Focus Mode')).toHaveClass('btn-ghost')
})
```

Run: `cd client && npm test`
Expected: FAIL — `./Button` does not exist.

- [ ] **Step 2: Implement Button, Field, Icon**

`client/src/components/shared/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'ghost'
  active?: boolean
}

export function Button({ variant, active, className, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, active ? 'on' : '', className].filter(Boolean).join(' ')
  return <button className={classes} {...rest} />
}
```

`client/src/components/shared/Field.tsx`:
```tsx
interface FieldProps {
  label: string
  required?: boolean
  type?: 'text' | 'textarea'
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function Field({ label, required, type = 'text', value, placeholder, onChange }: FieldProps) {
  return (
    <div className="form-row">
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
```

`client/src/components/shared/Icon.tsx`:
```tsx
const PATHS: Record<string, string> = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  lock: 'M8 11V7a4 4 0 0 1 8 0v4M5 11h14v9H5z',
  photo: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM21 16l-5-4-4 4-3-2-6 5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  close: 'M6 6l12 12M18 6L6 18',
  'chevron-down': 'M6 9l6 6 6-6',
}

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.btn { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 15px; border-radius: var(--radius-sm); font-weight: 600; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
.btn-primary { background: var(--thread); color: #fff; box-shadow: var(--shadow-resting); }
.btn-primary:hover { box-shadow: var(--shadow-lifted); }
.btn-ghost { background: var(--patch); border-color: var(--border-strong); color: var(--ink); }
.btn-ghost:hover { border-color: var(--thread); color: var(--thread); }
.btn-ghost.on { background: var(--thread-soft); border-color: var(--thread); color: var(--thread-ink); }
.form-row { margin-bottom: var(--space-lg); }
.form-row label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: var(--space-xs); }
.req { color: var(--stitch-new); }
.field { width: 100%; background: var(--patch); border: 1.5px solid var(--border); border-radius: var(--radius-xs); height: 38px; padding: 0 12px; font-size: 13.5px; color: var(--ink); font-family: inherit; }
.field:focus { border-color: var(--thread); outline: none; }
textarea.field { height: 74px; padding-top: 9px; resize: vertical; }
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shared/ client/src/styles/global.css
git commit -m "Add shared Button, Field, and Icon primitives"
```

---

### Task 12: PersonPatch and SeamLine components

**Files:**
- Create: `client/src/components/tree/PersonPatch.tsx`
- Create: `client/src/components/tree/SeamLine.tsx`
- Test: `client/src/components/tree/PersonPatch.test.tsx`

**Interfaces:**
- Consumes: `Person` type from Task 7.
- Produces: `<PersonPatch person={Person} inFocus={boolean} dimmed={boolean} fresh={boolean} onOpen={(id) => void} onDoubleOpen={(id) => void}>`, `<SeamLine kind="parent-child" | "spouse" dimmed={boolean}>`.

- [ ] **Step 1: Write the failing test**

`client/src/components/tree/PersonPatch.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonPatch } from './PersonPatch'
import type { Person } from '../../types'

const meera: Person = {
  id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null,
  birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null,
  created_at: '', updated_at: '',
}

test('renders the name and birth-death years', () => {
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
  expect(screen.getByText('b. 1955')).toBeInTheDocument()
})

test('fires onOpen on click and onDoubleOpen on double-click', () => {
  const onOpen = vi.fn()
  const onDoubleOpen = vi.fn()
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={onOpen} onDoubleOpen={onDoubleOpen} />)
  const patch = screen.getByText('Meera Gade').closest('.patch')!
  fireEvent.click(patch)
  fireEvent.doubleClick(patch)
  expect(onOpen).toHaveBeenCalledWith('meera')
  expect(onDoubleOpen).toHaveBeenCalledWith('meera')
})

test('shows the fresh-stitch badge only when fresh is true', () => {
  const { rerender } = render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={true} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(document.querySelector('.fresh-badge')).toBeInTheDocument()
  rerender(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(document.querySelector('.fresh-badge')).not.toBeInTheDocument()
})
```

Run: `cd client && npm test`
Expected: FAIL — `./PersonPatch` does not exist.

- [ ] **Step 2: Implement PersonPatch and SeamLine**

`client/src/components/tree/PersonPatch.tsx`:
```tsx
import type { Person } from '../../types'
import { Icon } from '../shared/Icon'

interface PersonPatchProps {
  person: Person
  inFocus: boolean
  dimmed: boolean
  fresh: boolean
  onOpen: (id: string) => void
  onDoubleOpen: (id: string) => void
}

function formatYears(person: Person): string {
  if (person.death_date) return `${person.birth_date ?? '?'}–${person.death_date}`
  if (person.birth_date) return `b. ${person.birth_date}`
  return ''
}

export function PersonPatch({ person, inFocus, dimmed, fresh, onOpen, onDoubleOpen }: PersonPatchProps) {
  const classes = ['patch', inFocus ? 'in-focus' : '', dimmed ? 'dimmed' : ''].filter(Boolean).join(' ')
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      onClick={() => onOpen(person.id)}
      onDoubleClick={() => onDoubleOpen(person.id)}
    >
      <div className="thumb"><Icon name="photo" size={18} /></div>
      <div className="name">{name}</div>
      <div className="years">{formatYears(person)}</div>
      {fresh && <div className="fresh-badge" title="Recently added or edited" />}
    </div>
  )
}
```

`client/src/components/tree/SeamLine.tsx`:
```tsx
interface SeamLineProps {
  kind: 'parent-child' | 'spouse'
  dimmed?: boolean
}

export function SeamLine({ kind, dimmed }: SeamLineProps) {
  const classes = ['seam', `seam-${kind}`, dimmed ? 'dimmed' : ''].filter(Boolean).join(' ')
  return <div className={classes} />
}
```

Add to `client/src/styles/global.css`:
```css
.patch { width: 126px; background: var(--patch); border: 2px dashed var(--border-strong); border-radius: var(--radius-sm); padding: 9px 8px 11px; display: flex; flex-direction: column; align-items: center; gap: 6px; box-shadow: var(--shadow-resting); position: relative; cursor: pointer; transition: opacity .2s ease, filter .2s ease, box-shadow .2s ease, border-color .2s ease; }
.patch:hover { box-shadow: var(--shadow-lifted); border-color: var(--thread); }
.patch.dimmed { opacity: .3; filter: saturate(.5); box-shadow: none; }
.patch.in-focus { opacity: 1; filter: none; border-color: var(--thread); box-shadow: 0 0 0 3px var(--thread-soft), var(--shadow-lifted); }
.thumb { width: 46px; height: 46px; border-radius: 50%; background: var(--patch-alt); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--muted); }
.patch .name { font-family: 'Bitter', Georgia, serif; font-weight: 600; font-size: 12px; text-align: center; line-height: 1.25; }
.patch .years { font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.fresh-badge { position: absolute; top: -7px; right: -7px; width: 16px; height: 16px; border-radius: 50%; background: var(--stitch-new); border: 2px solid var(--patch-alt); }

.seam-parent-child { width: 2px; height: 26px; background-image: linear-gradient(var(--border-strong) 60%, transparent 0%); background-size: 2px 8px; background-repeat: repeat-y; }
.seam-spouse { width: 20px; height: 2px; background-image: linear-gradient(90deg, var(--thread) 60%, transparent 0%); background-size: 8px 2px; background-repeat: repeat-x; }
.seam.dimmed { opacity: .2; }
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tree/PersonPatch.tsx client/src/components/tree/SeamLine.tsx client/src/components/tree/PersonPatch.test.tsx client/src/styles/global.css
git commit -m "Add PersonPatch and SeamLine components"
```

---

### Task 13: TreeView — ancestor rows, descendant collapse, sibling flap, add-parent slot

**Files:**
- Modify: `client/src/lib/familyGraph.ts`
- Modify: `client/src/lib/familyGraph.test.ts`
- Create: `client/src/components/tree/SiblingFlap.tsx`
- Create: `client/src/components/tree/AddParentSlot.tsx`
- Create: `client/src/components/tree/CollapseToggle.tsx`
- Create: `client/src/components/tree/TreeView.tsx`
- Test: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: `buildAncestorRows`, `getSiblingIds`, `getSpouseIds`, `getChildIds` from Tasks 8–10; `PersonPatch`, `SeamLine` from Task 12.
- Produces: `getDescendantIds(personId, relationships): string[]` (added to `familyGraph.ts`, direct children only — one generation); `<CollapseToggle expanded={boolean} onToggle={() => void}>`; `<TreeView people={Person[]} relationships={Relationship[]} focalId={string} onAddParent={(personId) => void} onOpenProfile={(id) => void}>`. `TreeView` renders the focal person's own children below them by default (per the design spec's "their own descendants down"), with each child's *own* children collapsed behind a `CollapseToggle` until clicked — distinct from the sibling flap, which hides collateral relatives, not descendants.

- [ ] **Step 0: Write the failing test for the one new graph function**

Add to `client/src/lib/familyGraph.test.ts`:
```ts
import { getDescendantIds } from './familyGraph'

test('getDescendantIds returns only direct children, not grandchildren', () => {
  expect(getDescendantIds('meera', relationships)).toEqual(['rohan'])
  expect(getDescendantIds('rohan', relationships)).toEqual([])
})
```

Run: `cd client && npm test`
Expected: FAIL — `getDescendantIds` does not exist.

Add to `client/src/lib/familyGraph.ts` (this is just `getChildIds` under the name the tree layout uses; kept as a thin alias so `TreeView` reads intent-first call sites):
```ts
export function getDescendantIds(personId: string, relationships: Relationship[]): string[] {
  return getChildIds(personId, relationships)
}
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 1: Write the failing test**

`client/src/components/tree/TreeView.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { TreeView } from './TreeView'
import type { Person, Relationship } from '../../types'

function person(id: string, first: string): Person {
  return {
    id, first_name: first, last_name: null, gender: null, birth_date: null,
    death_date: null, birth_place: null, occupation: null, bio: null,
    created_at: '', updated_at: '',
  }
}

const people = [person('anna', 'Anna'), person('ravi', 'Ravi'), person('meera', 'Meera'), person('sanjay', 'Sanjay'), person('deepak', 'Deepak')]
const relationships: Relationship[] = [
  { id: 'r1', type: 'spouse', from_id: 'anna', to_id: 'ravi' },
  { id: 'r2', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r3', type: 'parent-child', from_id: 'ravi', to_id: 'meera' },
  { id: 'r4', type: 'parent-child', from_id: 'anna', to_id: 'sanjay' },
  { id: 'r5', type: 'parent-child', from_id: 'ravi', to_id: 'sanjay' },
  { id: 'r6', type: 'parent-child', from_id: 'anna', to_id: 'deepak' },
  { id: 'r7', type: 'parent-child', from_id: 'ravi', to_id: 'deepak' },
]

test('renders the focal person and their parent couple', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('Meera')).toBeInTheDocument()
  expect(screen.getByText('Anna')).toBeInTheDocument()
  expect(screen.getByText('Ravi')).toBeInTheDocument()
})

test('siblings start collapsed behind a flap showing the correct count', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('2 siblings')).toBeInTheDocument()
  expect(screen.queryByText('Sanjay')).not.toBeInTheDocument()
})

test('clicking the sibling flap reveals the siblings', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.click(screen.getByText('2 siblings'))
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Deepak')).toBeInTheDocument()
})

test('shows an Add Parent slot above a person with no recorded parents', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('Add Parent')).toBeInTheDocument()
})

test('clicking Add Parent calls onAddParent with the topmost person', () => {
  const onAddParent = vi.fn()
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} />)
  fireEvent.click(screen.getByText('Add Parent'))
  expect(onAddParent).toHaveBeenCalledWith('anna')
})

test("renders the focal person's own children by default, below them", () => {
  const withChild = [...people, person('rohan', 'Rohan')]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('Rohan')).toBeInTheDocument()
})

test("a child's own children stay collapsed behind a toggle until clicked", () => {
  const withGrandchild = [...people, person('rohan', 'Rohan'), person('aditi', 'Aditi')]
  const relsWithGrandchild: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
    { id: 'r9', type: 'parent-child', from_id: 'rohan', to_id: 'aditi' },
  ]
  render(<TreeView people={withGrandchild} relationships={relsWithGrandchild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.queryByText('Aditi')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Show Rohan’s children'))
  expect(screen.getByText('Aditi')).toBeInTheDocument()
})
```

Run: `cd client && npm test`
Expected: FAIL — `./TreeView` does not exist.

- [ ] **Step 2: Implement SiblingFlap, AddParentSlot, and CollapseToggle**

`client/src/components/tree/SiblingFlap.tsx`:
```tsx
import { Icon } from '../shared/Icon'

interface SiblingFlapProps {
  count: number
  open: boolean
  onToggle: () => void
}

export function SiblingFlap({ count, open, onToggle }: SiblingFlapProps) {
  return (
    <div className={['flap', open ? 'open' : ''].filter(Boolean).join(' ')} onClick={onToggle}>
      <span>{open ? 'hide siblings' : `${count} sibling${count === 1 ? '' : 's'}`}</span>
      <Icon name="chevron-down" size={12} />
    </div>
  )
}
```

`client/src/components/tree/AddParentSlot.tsx`:
```tsx
import { Icon } from '../shared/Icon'

export function AddParentSlot({ onClick }: { onClick: () => void }) {
  return (
    <div className="add-parent-slot" onClick={onClick}>
      <Icon name="plus" size={13} />
      Add Parent
    </div>
  )
}
```

`client/src/components/tree/CollapseToggle.tsx`:
```tsx
interface CollapseToggleProps {
  expanded: boolean
  label: string
  onToggle: () => void
}

export function CollapseToggle({ expanded, label, onToggle }: CollapseToggleProps) {
  return (
    <button className="collapse-dot" aria-label={label} onClick={onToggle}>
      {expanded ? '−' : '+'}
    </button>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.flap { display: flex; align-items: center; gap: 6px; background: var(--patch); border: 1.5px dashed var(--border-strong); border-radius: var(--radius-pill); height: 28px; padding: 0 12px; font-size: 11px; font-weight: 600; color: var(--thread); cursor: pointer; }
.flap:hover { border-color: var(--thread); }
.flap .icon { transition: transform .3s cubic-bezier(.16,1,.3,1); }
.flap.open .icon { transform: rotate(180deg); }
.add-parent-slot { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100px; padding: 8px 4px; border: 1.5px dashed var(--border); border-radius: var(--radius-sm); color: var(--muted); font-size: 9.5px; font-weight: 600; text-align: center; cursor: pointer; margin-bottom: var(--space-md); }
.add-parent-slot:hover { color: var(--thread); border-color: var(--thread); }
.gen { display: flex; gap: var(--space-xxl); justify-content: center; align-items: flex-start; }
.gen-column { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); }
.couple { display: flex; align-items: center; position: relative; }
.tree { display: flex; flex-direction: column-reverse; align-items: center; gap: var(--space-sm); overflow-x: auto; padding: var(--space-sm); }
.descendants { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); margin-top: var(--space-lg); }
.collapse-dot { width: 17px; height: 17px; border-radius: 50%; background: var(--thread-soft); border: 1.5px solid var(--thread); color: var(--thread-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; line-height: 1; padding: 0; }
```

- [ ] **Step 3: Implement TreeView**

`client/src/components/tree/TreeView.tsx`:
```tsx
import { useState } from 'react'
import type { Person, Relationship } from '../../types'
import { buildAncestorRows, getParentIds, getSiblingIds, getSpouseIds, getDescendantIds } from '../../lib/familyGraph'
import { PersonPatch } from './PersonPatch'
import { SeamLine } from './SeamLine'
import { SiblingFlap } from './SiblingFlap'
import { AddParentSlot } from './AddParentSlot'
import { CollapseToggle } from './CollapseToggle'

interface TreeViewProps {
  people: Person[]
  relationships: Relationship[]
  focalId: string
  onAddParent: (personId: string) => void
  onOpenProfile: (id: string) => void
}

// Renders one descendant and, once expanded, their own children below them.
// The focal person's own children (depth 1) render open by default; every
// generation beyond that starts collapsed behind a CollapseToggle — this is
// the vertical/downward collapse, independent of the sideways sibling flap.
function DescendantBranch({
  personId,
  byId,
  relationships,
  onOpenProfile,
  onDoubleOpen,
  focusedSet,
  defaultExpanded,
}: {
  personId: string
  byId: Map<string, Person>
  relationships: Relationship[]
  onOpenProfile: (id: string) => void
  onDoubleOpen: (id: string) => void
  focusedSet: Set<string> | null
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const person = byId.get(personId)
  if (!person) return null
  const spouseId = getSpouseIds(personId, relationships)[0]
  const spouse = spouseId ? byId.get(spouseId) : null
  const childIds = getDescendantIds(personId, relationships).filter((id) => byId.has(id))
  const stateFor = (id: string) => (focusedSet ? { inFocus: focusedSet.has(id), dimmed: !focusedSet.has(id) } : { inFocus: false, dimmed: false })

  return (
    <div className="gen-column">
      <div className="couple">
        <PersonPatch person={person} {...stateFor(personId)} fresh={false} onOpen={onOpenProfile} onDoubleOpen={onDoubleOpen} />
        {spouse && (
          <>
            <SeamLine kind="spouse" />
            <PersonPatch person={spouse} {...stateFor(spouse.id)} fresh={false} onOpen={onOpenProfile} onDoubleOpen={onDoubleOpen} />
          </>
        )}
        {childIds.length > 0 && (
          <CollapseToggle
            expanded={expanded}
            label={expanded ? `Hide ${person.first_name}’s children` : `Show ${person.first_name}’s children`}
            onToggle={() => setExpanded((v) => !v)}
          />
        )}
      </div>
      {expanded && childIds.length > 0 && (
        <div className="descendants">
          <div className="gen">
            {childIds.map((childId) => (
              <DescendantBranch
                key={childId}
                personId={childId}
                byId={byId}
                relationships={relationships}
                onOpenProfile={onOpenProfile}
                onDoubleOpen={onDoubleOpen}
                focusedSet={focusedSet}
                defaultExpanded={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TreeView({ people, relationships, focalId, onAddParent, onOpenProfile }: TreeViewProps) {
  const [openFlaps, setOpenFlaps] = useState<Set<string>>(new Set())
  const byId = new Map(people.map((p) => [p.id, p]))
  const rows = buildAncestorRows(focalId, relationships)
  const topDepth = Math.max(...rows.map((r) => r.depth))
  const focalChildren = getDescendantIds(focalId, relationships).filter((id) => byId.has(id))
  const focusedSet = null as Set<string> | null // populated in Task 14

  function toggleFlap(personId: string) {
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      next.has(personId) ? next.delete(personId) : next.add(personId)
      return next
    })
  }

  return (
    <div className="tree">
      {focalChildren.length > 0 && (
        <div className="descendants">
          <div className="gen">
            {focalChildren.map((childId) => (
              <DescendantBranch
                key={childId}
                personId={childId}
                byId={byId}
                relationships={relationships}
                onOpenProfile={onOpenProfile}
                onDoubleOpen={() => {}}
                focusedSet={focusedSet}
                defaultExpanded={false}
              />
            ))}
          </div>
        </div>
      )}
      {rows.map((row) => (
        <div className="gen" key={row.depth}>
          {row.units.map((unit) => {
            const person = byId.get(unit.personId)
            if (!person) return null
            const spouse = unit.spouseId ? byId.get(unit.spouseId) : null
            const siblingIds = getSiblingIds(unit.personId, relationships).filter((id) => byId.has(id))
            const hasParents = getParentIds(unit.personId, relationships).length > 0
            const isTopmost = row.depth === topDepth

            return (
              <div className="gen-column" key={unit.personId}>
                {isTopmost && !hasParents && <AddParentSlot onClick={() => onAddParent(unit.personId)} />}
                <div className="couple">
                  <PersonPatch person={person} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                  {spouse && (
                    <>
                      <SeamLine kind="spouse" />
                      <PersonPatch person={spouse} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                    </>
                  )}
                </div>
                {siblingIds.length > 0 && (
                  <>
                    <SiblingFlap
                      count={siblingIds.length}
                      open={openFlaps.has(unit.personId)}
                      onToggle={() => toggleFlap(unit.personId)}
                    />
                    {openFlaps.has(unit.personId) && (
                      <div className="gen" style={{ marginTop: 8 }}>
                        {siblingIds.map((sibId) => {
                          const sibling = byId.get(sibId)
                          if (!sibling) return null
                          const sibSpouseId = getSpouseIds(sibId, relationships)[0]
                          const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) : null
                          return (
                            <div className="couple" key={sibId}>
                              <PersonPatch person={sibling} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                              {sibSpouse && (
                                <>
                                  <SeamLine kind="spouse" />
                                  <PersonPatch person={sibSpouse} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/tree/ client/src/styles/global.css client/src/lib/familyGraph.ts client/src/lib/familyGraph.test.ts
git commit -m "Add TreeView with ancestor rows, descendant collapse, sibling-flap, and Add Parent slot"
```

---

### Task 14: Focus mode in TreeView

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: `computeImmediateFamily` from Task 9.
- Produces: `TreeView` gains internal focus state; double-clicking a patch or toggling "Focus Mode" + clicking focuses that person's immediate family; an "Exit focus" control clears it.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/components/tree/TreeView.test.tsx`:
```tsx
test('double-clicking a person focuses their immediate family and dims everyone else', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)

  expect(screen.getByText('Anna').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Ravi').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')
})

test('focus mode auto-expands a collapsed sibling flap to reveal a focused sibling', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Anna').closest('.patch')!)
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Sanjay').closest('.patch')).toHaveClass('in-focus')
})

test('Exit focus clears the focused state', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  fireEvent.click(screen.getByText('Exit focus'))
  expect(screen.getByText('Meera').closest('.patch')).not.toHaveClass('in-focus')
})

test('double-clicking the focal person also glows their own children below them', () => {
  const withChild = [...people, { id: 'rohan', first_name: 'Rohan', last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' }]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  expect(screen.getByText('Rohan').closest('.patch')).toHaveClass('in-focus')
})
```

Run: `cd client && npm test`
Expected: FAIL — no focus behavior exists yet.

- [ ] **Step 2: Add focus state to TreeView**

Modify `client/src/components/tree/TreeView.tsx` — add imports and state:
```tsx
import { computeImmediateFamily } from '../../lib/familyGraph'
```

Replace the component body to track focus and auto-expand flaps, and thread `inFocus`/`dimmed` through every `PersonPatch` — including the descendant branches added in Task 13, which already accept a `focusedSet` prop for exactly this:
```tsx
export function TreeView({ people, relationships, focalId, onAddParent, onOpenProfile }: TreeViewProps) {
  const [openFlaps, setOpenFlaps] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const byId = new Map(people.map((p) => [p.id, p]))
  const rows = buildAncestorRows(focalId, relationships)
  const topDepth = Math.max(...rows.map((r) => r.depth))
  const focalChildren = getDescendantIds(focalId, relationships).filter((id) => byId.has(id))

  const focusedFamily = focusedId ? computeImmediateFamily(focusedId, relationships) : null
  const focusedSet = focusedId && focusedFamily
    ? new Set([focusedId, ...focusedFamily.parents, ...(focusedFamily.spouse ? [focusedFamily.spouse] : []), ...focusedFamily.children, ...focusedFamily.siblings])
    : null

  function toggleFlap(personId: string) {
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      next.has(personId) ? next.delete(personId) : next.add(personId)
      return next
    })
  }

  function focusOn(personId: string) {
    const family = computeImmediateFamily(personId, relationships)
    // Auto-expand any flap whose owner's siblings include a person now in focus.
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      for (const row of rows) {
        for (const unit of row.units) {
          const siblingIds = getSiblingIds(unit.personId, relationships)
          if (family.siblings.some((s) => siblingIds.includes(s)) || siblingIds.includes(personId)) {
            next.add(unit.personId)
          }
        }
      }
      return next
    })
    setFocusedId(personId)
  }

  function clearFocus() {
    setFocusedId(null)
  }

  function patchState(personId: string) {
    if (!focusedSet) return { inFocus: false, dimmed: false }
    return { inFocus: focusedSet.has(personId), dimmed: !focusedSet.has(personId) }
  }

  return (
    <div className="tree">
      {focusedId && (
        <button className="exit-focus" onClick={clearFocus}>Exit focus</button>
      )}
      {focalChildren.length > 0 && (
        <div className="descendants">
          <div className="gen">
            {focalChildren.map((childId) => (
              <DescendantBranch
                key={childId}
                personId={childId}
                byId={byId}
                relationships={relationships}
                onOpenProfile={onOpenProfile}
                onDoubleOpen={focusOn}
                focusedSet={focusedSet}
                defaultExpanded={false}
              />
            ))}
          </div>
        </div>
      )}
      {rows.map((row) => (
        <div className="gen" key={row.depth}>
          {row.units.map((unit) => {
            const person = byId.get(unit.personId)
            if (!person) return null
            const spouse = unit.spouseId ? byId.get(unit.spouseId) : null
            const siblingIds = getSiblingIds(unit.personId, relationships).filter((id) => byId.has(id))
            const hasParents = getParentIds(unit.personId, relationships).length > 0
            const isTopmost = row.depth === topDepth
            const state = patchState(unit.personId)

            return (
              <div className="gen-column" key={unit.personId}>
                {isTopmost && !hasParents && <AddParentSlot onClick={() => onAddParent(unit.personId)} />}
                <div className="couple">
                  <PersonPatch person={person} {...state} fresh={false} onOpen={onOpenProfile} onDoubleOpen={focusOn} />
                  {spouse && (
                    <>
                      <SeamLine kind="spouse" />
                      <PersonPatch person={spouse} {...patchState(spouse.id)} fresh={false} onOpen={onOpenProfile} onDoubleOpen={focusOn} />
                    </>
                  )}
                </div>
                {siblingIds.length > 0 && (
                  <>
                    <SiblingFlap
                      count={siblingIds.length}
                      open={openFlaps.has(unit.personId)}
                      onToggle={() => toggleFlap(unit.personId)}
                    />
                    {openFlaps.has(unit.personId) && (
                      <div className="gen" style={{ marginTop: 8 }}>
                        {siblingIds.map((sibId) => {
                          const sibling = byId.get(sibId)
                          if (!sibling) return null
                          const sibSpouseId = getSpouseIds(sibId, relationships)[0]
                          const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) : null
                          const sibState = patchState(sibId)
                          return (
                            <div className="couple" key={sibId}>
                              <PersonPatch person={sibling} {...sibState} fresh={false} onOpen={onOpenProfile} onDoubleOpen={focusOn} />
                              {sibSpouse && (
                                <>
                                  <SeamLine kind="spouse" />
                                  <PersonPatch person={sibSpouse} {...patchState(sibSpouse.id)} fresh={false} onOpen={onOpenProfile} onDoubleOpen={focusOn} />
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.exit-focus { display: inline-flex; align-items: center; gap: 6px; margin: 2px auto 6px; background: var(--thread); color: #fff; border: none; border-radius: 14px; height: 28px; padding: 0 14px; font-size: 11px; font-weight: 600; cursor: pointer; }
```

- [ ] **Step 3: Run the tests**

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx client/src/styles/global.css
git commit -m "Add focus mode to TreeView, wired through both ancestor and descendant branches"
```

---

### Task 15: PassphraseGate component and hook

**Files:**
- Create: `client/src/components/gate/PassphraseGate.tsx`
- Test: `client/src/components/gate/PassphraseGate.test.tsx`

**Interfaces:**
- Consumes: `setPassphrase` from Task 7; `supabase.rpc('verify_passphrase', ...)`.
- Produces: `<PassphraseGate onUnlocked={() => void} onCancel={() => void}>`.

- [ ] **Step 1: Write the failing test**

`client/src/components/gate/PassphraseGate.test.tsx`:
```tsx
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { supabase } from '../../lib/supabaseClient'
import { PassphraseGate } from './PassphraseGate'
import { getPassphrase } from '../../lib/passphrase'

beforeEach(() => localStorage.clear())

test('shows an error and does not store the passphrase when it is wrong', async () => {
  ;(supabase.rpc as any).mockResolvedValue({ data: false, error: null })
  const onUnlocked = vi.fn()
  render(<PassphraseGate onUnlocked={onUnlocked} onCancel={() => {}} />)

  fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'wrong' } })
  fireEvent.click(screen.getByText('Unlock editing'))

  await waitFor(() => expect(screen.getByText('Incorrect passphrase.')).toBeInTheDocument())
  expect(onUnlocked).not.toHaveBeenCalled()
  expect(getPassphrase()).toBeNull()
})

test('stores the passphrase and calls onUnlocked when correct', async () => {
  ;(supabase.rpc as any).mockResolvedValue({ data: true, error: null })
  const onUnlocked = vi.fn()
  render(<PassphraseGate onUnlocked={onUnlocked} onCancel={() => {}} />)

  fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'sesame' } })
  fireEvent.click(screen.getByText('Unlock editing'))

  await waitFor(() => expect(onUnlocked).toHaveBeenCalledOnce())
  expect(getPassphrase()).toBe('sesame')
})
```

Run: `cd client && npm test`
Expected: FAIL — `./PassphraseGate` does not exist.

- [ ] **Step 2: Implement it**

`client/src/components/gate/PassphraseGate.tsx`:
```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { setPassphrase } from '../../lib/passphrase'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

interface PassphraseGateProps {
  onUnlocked: () => void
  onCancel: () => void
}

export function PassphraseGate({ onUnlocked, onCancel }: PassphraseGateProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit() {
    setChecking(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('verify_passphrase', { p_passphrase: value })
    setChecking(false)
    if (rpcError || !data) {
      setError('Incorrect passphrase.')
      return
    }
    setPassphrase(value)
    onUnlocked()
  }

  return (
    <div className="gate-shell">
      <div className="gate-icon"><Icon name="lock" size={20} /></div>
      <div className="gate-title">Enter the family passphrase</div>
      <div className="gate-sub">Needed once to add or edit people on this device.</div>
      <input
        className="field gate-input"
        type="password"
        placeholder="Passphrase"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <div className="gate-error">{error}</div>}
      <Button variant="primary" onClick={submit} disabled={checking} style={{ width: '100%', justifyContent: 'center' }}>
        Unlock editing
      </Button>
      <button className="gate-cancel" onClick={onCancel}>Cancel</button>
    </div>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.gate-shell { max-width: 320px; margin: 44px auto; text-align: center; }
.gate-icon { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 18px; background: var(--thread-soft); border: 1.5px solid var(--thread); color: var(--thread); display: flex; align-items: center; justify-content: center; }
.gate-title { font-family: 'Bitter', Georgia, serif; font-weight: 700; font-size: 17px; }
.gate-sub { font-size: 12.5px; color: var(--muted); margin-top: 6px; }
.gate-input { height: 40px; margin: 18px 0; text-align: center; letter-spacing: .3em; }
.gate-error { color: var(--stitch-new); font-size: 12px; margin-bottom: 12px; }
.gate-cancel { display: block; margin: 10px auto 0; background: none; border: none; color: var(--muted); font-size: 12px; cursor: pointer; }
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/gate/ client/src/styles/global.css
git commit -m "Add PassphraseGate component"
```

---

### Task 16: PersonForm (add/edit)

**Files:**
- Create: `client/src/components/form/PersonForm.tsx`
- Test: `client/src/components/form/PersonForm.test.tsx`

**Interfaces:**
- Consumes: `Field`, `Button` from Task 11; `PersonFields` type from Task 7.
- Produces: `<PersonForm initial={PersonFields | null} onSave={(fields: PersonFields) => void} onCancel={() => void}>`.

- [ ] **Step 1: Write the failing test**

`client/src/components/form/PersonForm.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonForm } from './PersonForm'

test('Save is disabled until a first name is entered', () => {
  render(<PersonForm initial={null} onSave={() => {}} onCancel={() => {}} />)
  expect(screen.getByText('Save')).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anna' } })
  expect(screen.getByText('Save')).not.toBeDisabled()
})

test('calls onSave with the entered fields, defaulting optional fields to null', () => {
  const onSave = vi.fn()
  render(<PersonForm initial={null} onSave={onSave} onCancel={() => {}} />)
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anna' } })
  fireEvent.click(screen.getByText('Save'))
  expect(onSave).toHaveBeenCalledWith({
    first_name: 'Anna', last_name: null, gender: null, birth_date: null,
    death_date: null, birth_place: null, occupation: null, bio: null,
  })
})

test('pre-fills fields from the initial value when editing', () => {
  render(<PersonForm initial={{ first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null }} onSave={() => {}} onCancel={() => {}} />)
  expect(screen.getByDisplayValue('Meera')).toBeInTheDocument()
  expect(screen.getByDisplayValue('1955')).toBeInTheDocument()
})
```

Run: `cd client && npm test`
Expected: FAIL — `./PersonForm` does not exist.

- [ ] **Step 2: Implement it**

`client/src/components/form/PersonForm.tsx`:
```tsx
import { useState } from 'react'
import type { PersonFields } from '../../types'
import { Button } from '../shared/Button'

interface PersonFormProps {
  initial: PersonFields | null
  onSave: (fields: PersonFields) => void
  onCancel: () => void
}

const EMPTY: PersonFields = {
  first_name: '', last_name: null, gender: null, birth_date: null,
  death_date: null, birth_place: null, occupation: null, bio: null,
}

export function PersonForm({ initial, onSave, onCancel }: PersonFormProps) {
  const [fields, setFields] = useState<PersonFields>(initial ?? EMPTY)

  function set<K extends keyof PersonFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value === '' ? null : value }))
  }

  const canSave = fields.first_name.trim().length > 0

  return (
    <div className="modal-shell">
      <div className="profile-name" style={{ fontSize: 19, marginBottom: 18 }}>
        {initial ? 'Edit Person' : 'Add Person'}
      </div>

      <div className="form-row">
        <label htmlFor="first_name">First name <span className="req">*</span></label>
        <input id="first_name" className="field" value={fields.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="e.g. Meera" />
      </div>
      <div className="two-col">
        <div className="form-row">
          <label htmlFor="last_name">Last name</label>
          <input id="last_name" className="field" value={fields.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} placeholder="optional" />
        </div>
        <div className="form-row">
          <label htmlFor="gender">Gender</label>
          <input id="gender" className="field" value={fields.gender ?? ''} onChange={(e) => set('gender', e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div className="two-col">
        <div className="form-row">
          <label htmlFor="birth_date">Birth date</label>
          <input id="birth_date" className="field" value={fields.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value)} placeholder='"1955" or "circa 1950s"' />
        </div>
        <div className="form-row">
          <label htmlFor="death_date">Death date</label>
          <input id="death_date" className="field" value={fields.death_date ?? ''} onChange={(e) => set('death_date', e.target.value)} placeholder="leave blank if living" />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="birth_place">Birthplace</label>
        <input id="birth_place" className="field" value={fields.birth_place ?? ''} onChange={(e) => set('birth_place', e.target.value)} placeholder="optional" />
      </div>
      <div className="form-row">
        <label htmlFor="occupation">Occupation</label>
        <input id="occupation" className="field" value={fields.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} placeholder="optional" />
      </div>
      <div className="form-row">
        <label htmlFor="bio">Bio / life story</label>
        <textarea id="bio" className="field" value={fields.bio ?? ''} onChange={(e) => set('bio', e.target.value)} placeholder="Free text — anecdotes, notable events…" />
      </div>

      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!canSave} onClick={() => onSave(fields)}>Save</Button>
      </div>
    </div>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.modal-shell { max-width: 460px; margin: 0 auto; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/form/ client/src/styles/global.css
git commit -m "Add PersonForm for add/edit"
```

---

### Task 17: RelationshipPicker

**Files:**
- Create: `client/src/components/picker/RelationshipPicker.tsx`
- Test: `client/src/components/picker/RelationshipPicker.test.tsx`

**Interfaces:**
- Consumes: `Person`, `RelationshipType` types from Task 7.
- Produces: `<RelationshipPicker anchorPerson={Person} people={Person[]} onLinkExisting={(type: RelationshipType, personId: string) => void} onCreateNew={(type: RelationshipType, searchText: string) => void}>`.

- [ ] **Step 1: Write the failing test**

`client/src/components/picker/RelationshipPicker.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { RelationshipPicker } from './RelationshipPicker'
import type { Person } from '../../types'

function person(id: string, first: string): Person {
  return { id, first_name: first, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' }
}

const anchor = person('meera', 'Meera')
const people = [anchor, person('deepak', 'Deepak'), person('priya', 'Priya')]

test('filters the result list as the search text changes', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Dee' } })
  expect(screen.getByText('Deepak')).toBeInTheDocument()
  expect(screen.queryByText('Priya')).not.toBeInTheDocument()
})

test('never shows the anchor person as a result', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Meera' } })
  expect(screen.queryByText('Meera')).not.toBeInTheDocument()
})

test('clicking a result calls onLinkExisting with the selected relationship type', () => {
  const onLinkExisting = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={onLinkExisting} onCreateNew={() => {}} />)
  fireEvent.click(screen.getByText('Spouse'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByText('Priya'))
  expect(onLinkExisting).toHaveBeenCalledWith('spouse', 'priya')
})

test('shows a create-new row with the current search text', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Kiran' } })
  expect(screen.getByText('Create new person "Kiran"')).toBeInTheDocument()
})
```

Run: `cd client && npm test`
Expected: FAIL — `./RelationshipPicker` does not exist.

- [ ] **Step 2: Implement it**

`client/src/components/picker/RelationshipPicker.tsx`:
```tsx
import { useState } from 'react'
import type { Person, RelationshipType } from '../../types'
import { Icon } from '../shared/Icon'

interface RelationshipPickerProps {
  anchorPerson: Person
  people: Person[]
  onLinkExisting: (type: RelationshipType, personId: string) => void
  onCreateNew: (type: RelationshipType, searchText: string) => void
}

const TYPES: RelationshipType[] = ['parent-child', 'spouse']
const LABELS: Record<RelationshipType, string> = { 'parent-child': 'Parent', spouse: 'Spouse' }

export function RelationshipPicker({ anchorPerson, people, onLinkExisting, onCreateNew }: RelationshipPickerProps) {
  const [type, setType] = useState<RelationshipType>('parent-child')
  const [search, setSearch] = useState('')

  const results = people.filter(
    (p) => p.id !== anchorPerson.id && p.first_name.toLowerCase().includes(search.toLowerCase()) && search.length > 0,
  )

  return (
    <div className="picker-shell">
      <div className="profile-name" style={{ fontSize: 18, marginBottom: 2 }}>
        Add relationship to {anchorPerson.first_name}
      </div>
      <p className="callout" style={{ marginBottom: 16 }}>Choose the relationship type, then find or create the person.</p>

      <div className="rel-type-row">
        {TYPES.map((t) => (
          <div key={t} className={['rel-type', type === t ? 'selected' : ''].filter(Boolean).join(' ')} onClick={() => setType(t)}>
            {LABELS[t]}
          </div>
        ))}
      </div>

      <input className="field" placeholder="Search existing people…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

      {results.length > 0 && (
        <div className="result-list">
          {results.map((p) => (
            <div className="result-row" key={p.id} onClick={() => onLinkExisting(type, p.id)}>
              <div className="result-avatar"><Icon name="photo" size={14} /></div>
              <div>{p.first_name}</div>
            </div>
          ))}
        </div>
      )}

      {search.length > 0 && (
        <div className="create-new-row" onClick={() => onCreateNew(type, search)}>
          <Icon name="plus" size={14} />
          Create new person "{search}"
        </div>
      )}
    </div>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.picker-shell { max-width: 420px; margin: 0 auto; }
.rel-type-row { display: flex; gap: 8px; margin-bottom: 16px; }
.rel-type { flex: 1; height: 34px; border-radius: var(--radius-xs); border: 1.5px solid var(--border); background: var(--patch); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer; }
.rel-type.selected { background: var(--thread-soft); border-color: var(--thread); color: var(--thread-ink); }
.result-list { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--patch); overflow: hidden; }
.result-row { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-bottom: 1px solid var(--border); cursor: pointer; }
.result-row:last-child { border-bottom: none; }
.result-row:hover { background: var(--patch-alt); }
.result-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--patch-alt); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--muted); }
.create-new-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 11px 12px; border: 1.5px dashed var(--thread); border-radius: var(--radius-sm); color: var(--thread); font-weight: 600; font-size: 13px; cursor: pointer; }
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/picker/ client/src/styles/global.css
git commit -m "Add RelationshipPicker component"
```

---

### Task 18: PersonProfile

**Files:**
- Create: `client/src/components/profile/PersonProfile.tsx`
- Test: `client/src/components/profile/PersonProfile.test.tsx`

**Interfaces:**
- Consumes: `computeImmediateFamily` from Task 9; `Person`, `Relationship` types from Task 7.
- Produces: `<PersonProfile person={Person} people={Person[]} relationships={Relationship[]} onEdit={() => void} onAddRelationship={() => void} onOpenPerson={(id) => void}>`.

- [ ] **Step 1: Write the failing test**

`client/src/components/profile/PersonProfile.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonProfile } from './PersonProfile'
import type { Person, Relationship } from '../../types'

function person(id: string, first: string, extra: Partial<Person> = {}): Person {
  return { id, first_name: first, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '', ...extra }
}

const meera = person('meera', 'Meera', { last_name: 'Gade', birth_date: '1955', birth_place: 'Pune, India', occupation: 'Teacher' })
const people = [meera, person('anna', 'Anna'), person('rohan', 'Rohan')]
const relationships: Relationship[] = [
  { id: 'r1', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r2', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
]

test('renders name and available meta fields, omitting blank ones', () => {
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={() => {}} onAddRelationship={() => {}} onOpenPerson={() => {}} />)
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
  expect(screen.getByText(/Pune, India/)).toBeInTheDocument()
  expect(screen.getByText(/Teacher/)).toBeInTheDocument()
})

test('lists relationship chips by role', () => {
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={() => {}} onAddRelationship={() => {}} onOpenPerson={() => {}} />)
  expect(screen.getByText('Parent · Anna')).toBeInTheDocument()
  expect(screen.getByText('Child · Rohan')).toBeInTheDocument()
})

test('clicking a relationship chip opens that person', () => {
  const onOpenPerson = vi.fn()
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={() => {}} onAddRelationship={() => {}} onOpenPerson={onOpenPerson} />)
  fireEvent.click(screen.getByText('Parent · Anna'))
  expect(onOpenPerson).toHaveBeenCalledWith('anna')
})

test('Edit Profile and Add relationship fire their callbacks', () => {
  const onEdit = vi.fn()
  const onAddRelationship = vi.fn()
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={onEdit} onAddRelationship={onAddRelationship} onOpenPerson={() => {}} />)
  fireEvent.click(screen.getByText('Edit Profile'))
  fireEvent.click(screen.getByText('Add relationship'))
  expect(onEdit).toHaveBeenCalledOnce()
  expect(onAddRelationship).toHaveBeenCalledOnce()
})
```

Run: `cd client && npm test`
Expected: FAIL — `./PersonProfile` does not exist.

- [ ] **Step 2: Implement it**

`client/src/components/profile/PersonProfile.tsx`:
```tsx
import type { Person, Relationship } from '../../types'
import { computeImmediateFamily } from '../../lib/familyGraph'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

interface PersonProfileProps {
  person: Person
  people: Person[]
  relationships: Relationship[]
  onEdit: () => void
  onAddRelationship: () => void
  onOpenPerson: (id: string) => void
}

export function PersonProfile({ person, people, relationships, onEdit, onAddRelationship, onOpenPerson }: PersonProfileProps) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const family = computeImmediateFamily(person.id, relationships)
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ')
  const meta = [person.birth_date && `b. ${person.birth_date}`, person.birth_place, person.occupation].filter(Boolean).join(' · ')

  const chips: { role: string; personId: string }[] = [
    ...family.parents.map((id) => ({ role: 'Parent', personId: id })),
    ...(family.spouse ? [{ role: 'Spouse', personId: family.spouse }] : []),
    ...family.children.map((id) => ({ role: 'Child', personId: id })),
  ]

  return (
    <div className="profile-layout">
      <div>
        <div className="profile-photo"><Icon name="photo" size={28} /></div>
      </div>
      <div>
        <div className="profile-name">{name}</div>
        {meta && <div className="profile-meta">{meta}</div>}
        <Button variant="ghost" onClick={onEdit}><Icon name="edit" size={14} /> Edit Profile</Button>

        <div className="section-title">Relationships</div>
        <div>
          {chips.map(({ role, personId }) => {
            const related = byId.get(personId)
            if (!related) return null
            return (
              <span className="rel-chip" key={personId} onClick={() => onOpenPerson(personId)}>
                {role} · {related.first_name}
              </span>
            )
          })}
          <span className="rel-chip add" onClick={onAddRelationship}>
            <Icon name="plus" size={12} /> Add relationship
          </span>
        </div>

        {person.bio && (
          <>
            <div className="section-title">Life events &amp; bio</div>
            <p className="bio-text">{person.bio}</p>
          </>
        )}
      </div>
    </div>
  )
}
```

Add to `client/src/styles/global.css`:
```css
.profile-layout { display: grid; grid-template-columns: 200px 1fr; gap: 26px; }
@media (max-width: 680px) { .profile-layout { grid-template-columns: 1fr; } }
.profile-photo { width: 100%; aspect-ratio: 1; border-radius: var(--radius-md); background: var(--patch); border: 2px dashed var(--border-strong); display: flex; align-items: center; justify-content: center; color: var(--muted); margin-bottom: 10px; }
.profile-name { font-family: 'Bitter', Georgia, serif; font-weight: 700; font-size: 24px; margin: 2px 0 4px; }
.profile-meta { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 22px 0 10px; }
.rel-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; margin: 0 8px 8px 0; border-radius: var(--radius-pill); background: var(--patch); border: 1.5px dashed var(--border-strong); font-size: 12px; cursor: pointer; }
.rel-chip:hover { border-color: var(--thread); color: var(--thread); }
.rel-chip.add { border-style: solid; background: var(--thread-soft); border-color: var(--thread); color: var(--thread-ink); }
.bio-text { font-size: 13.5px; line-height: 1.7; color: var(--ink); max-width: 60ch; }
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/profile/ client/src/styles/global.css
git commit -m "Add PersonProfile component"
```

---

### Task 19: Photo upload Edge Function

**Files:**
- Create: `supabase/functions/upload-photo/index.ts`
- Create: `client/src/api/photos.ts`
- Test: `client/src/api/photos.test.ts`

**Interfaces:**
- Produces: Edge Function `upload-photo` (checks passphrase, writes to the `photos` storage bucket under `<person_id>/<filename>`); `uploadPhoto(personId: string, file: File): Promise<void>` client wrapper.

- [ ] **Step 1: Write the Edge Function**

`supabase/functions/upload-photo/index.ts`:
```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic']

Deno.serve(async (req) => {
  const formData = await req.formData()
  const passphrase = formData.get('passphrase')
  const personId = formData.get('personId')
  const file = formData.get('file')

  if (typeof passphrase !== 'string' || typeof personId !== 'string' || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'missing passphrase, personId, or file' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: passphraseOk } = await supabase.rpc('verify_passphrase', { p_passphrase: passphrase })
  if (!passphraseOk) {
    return new Response(JSON.stringify({ error: 'incorrect passphrase' }), { status: 403 })
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'file too large (max 10MB)' }), { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return new Response(JSON.stringify({ error: 'unsupported file type (jpg/png/heic only)' }), { status: 400 })
  }

  const path = `${personId}/${crypto.randomUUID()}-${file.name}`
  const { error } = await supabase.storage.from('photos').upload(path, file, { contentType: file.type })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ path }), { status: 200 })
})
```

- [ ] **Step 2: Write the failing client wrapper test**

`client/src/api/photos.test.ts`:
```ts
import { vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('../lib/passphrase', () => ({ getPassphrase: () => 'sesame' }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { functions: { url: 'https://project.functions.supabase.co' } },
}))

import { uploadPhoto } from './photos'

test('uploadPhoto posts a FormData payload with the passphrase and personId', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ path: 'meera/photo.jpg' }) })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  await uploadPhoto('meera', file)

  expect(mockFetch).toHaveBeenCalledOnce()
  const [url, options] = mockFetch.mock.calls[0]
  expect(url).toContain('upload-photo')
  const body = options.body as FormData
  expect(body.get('passphrase')).toBe('sesame')
  expect(body.get('personId')).toBe('meera')
  expect(body.get('file')).toBe(file)
})

test('uploadPhoto throws when the function returns an error', async () => {
  mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'incorrect passphrase' }) })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  await expect(uploadPhoto('meera', file)).rejects.toThrow('incorrect passphrase')
})
```

Run: `cd client && npm test`
Expected: FAIL — `./photos` does not exist.

- [ ] **Step 3: Implement the client wrapper**

`client/src/api/photos.ts`:
```ts
import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'

export async function uploadPhoto(personId: string, file: File): Promise<void> {
  const body = new FormData()
  body.set('passphrase', getPassphrase() ?? '')
  body.set('personId', personId)
  body.set('file', file)

  const response = await fetch(`${(supabase as any).functions.url}/upload-photo`, { method: 'POST', body })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error ?? 'upload failed')
  }
}
```

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ client/src/api/photos.ts client/src/api/photos.test.ts
git commit -m "Add gated photo upload Edge Function and client wrapper"
```

---

### Task 20: Wire the screens together in App.tsx

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `TreeView` (13), `PersonProfile` (18), `PersonForm` (16), `RelationshipPicker` (17), `PassphraseGate` (15), all `api/` wrappers (7, 19).

- [ ] **Step 1: Write the failing integration test**

`client/src/App.test.tsx`:
```tsx
vi.mock('./api/people', () => ({
  fetchPeople: vi.fn().mockResolvedValue([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ]),
  addPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
}))
vi.mock('./api/relationships', () => ({
  fetchRelationships: vi.fn().mockResolvedValue([]),
  addRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
}))

import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

test('loads people and relationships and renders the tree', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())
})
```

Run: `cd client && npm test`
Expected: FAIL — `App` does not yet fetch or render real data.

- [ ] **Step 2: Implement the wired App**

`client/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react'
import type { Person, PersonFields, Relationship, RelationshipType } from './types'
import { fetchPeople, addPerson, updatePerson, deletePerson } from './api/people'
import { fetchRelationships, addRelationship } from './api/relationships'
import { getPassphrase } from './lib/passphrase'
import { TreeView } from './components/tree/TreeView'
import { PersonProfile } from './components/profile/PersonProfile'
import { PersonForm } from './components/form/PersonForm'
import { RelationshipPicker } from './components/picker/RelationshipPicker'
import { PassphraseGate } from './components/gate/PassphraseGate'

type Panel =
  | { kind: 'none' }
  | { kind: 'profile'; personId: string }
  | { kind: 'form'; editingId: string | null }
  | { kind: 'picker'; anchorId: string }
  | { kind: 'gate'; onUnlocked: () => void }

export default function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [focalId, setFocalId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })

  useEffect(() => {
    fetchPeople().then((rows) => {
      setPeople(rows)
      if (rows.length > 0) setFocalId((prev) => prev ?? rows[0].id)
    })
    fetchRelationships().then(setRelationships)
  }, [])

  function requirePassphrase(action: () => void) {
    if (getPassphrase()) {
      action()
    } else {
      setPanel({ kind: 'gate', onUnlocked: () => { setPanel({ kind: 'none' }); action() } })
    }
  }

  async function refresh() {
    setPeople(await fetchPeople())
    setRelationships(await fetchRelationships())
  }

  async function handleSavePerson(fields: PersonFields) {
    const editingId = panel.kind === 'form' ? panel.editingId : null
    if (editingId) {
      await updatePerson(editingId, fields)
    } else {
      const newId = await addPerson(fields)
      if (!focalId) setFocalId(newId)
    }
    await refresh()
    setPanel({ kind: 'none' })
  }

  async function handleLinkExisting(anchorId: string, type: RelationshipType, otherId: string) {
    if (type === 'parent-child') {
      await addRelationship('parent-child', otherId, anchorId)
    } else {
      await addRelationship('spouse', anchorId, otherId)
    }
    await refresh()
    setPanel({ kind: 'profile', personId: anchorId })
  }

  if (people.length === 0) {
    return (
      <div className="app">
        <button className="btn btn-primary" onClick={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: null }))}>
          Add the first person
        </button>
        {panel.kind === 'gate' && <PassphraseGate onUnlocked={panel.onUnlocked} onCancel={() => setPanel({ kind: 'none' })} />}
        {panel.kind === 'form' && (
          <PersonForm initial={null} onSave={handleSavePerson} onCancel={() => setPanel({ kind: 'none' })} />
        )}
      </div>
    )
  }

  return (
    <div className="app">
      {focalId && (
        <TreeView
          people={people}
          relationships={relationships}
          focalId={focalId}
          onAddParent={(personId) => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: personId }))}
          onOpenProfile={(id) => setPanel({ kind: 'profile', personId: id })}
        />
      )}

      {panel.kind === 'profile' && (
        <PersonProfile
          person={people.find((p) => p.id === panel.personId)!}
          people={people}
          relationships={relationships}
          onEdit={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: panel.personId }))}
          onAddRelationship={() => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: panel.personId }))}
          onOpenPerson={(id) => setPanel({ kind: 'profile', personId: id })}
        />
      )}

      {panel.kind === 'form' && (
        <PersonForm
          initial={panel.editingId ? people.find((p) => p.id === panel.editingId) ?? null : null}
          onSave={handleSavePerson}
          onCancel={() => setPanel({ kind: 'none' })}
        />
      )}

      {panel.kind === 'picker' && (
        <RelationshipPicker
          anchorPerson={people.find((p) => p.id === panel.anchorId)!}
          people={people}
          onLinkExisting={(type, personId) => handleLinkExisting(panel.anchorId, type, personId)}
          onCreateNew={(type, searchText) => {
            const anchorId = panel.anchorId
            setPanel({ kind: 'form', editingId: null })
            void (async () => {
              const newId = await addPerson({ first_name: searchText, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null })
              await handleLinkExisting(anchorId, type, newId)
            })()
          }}
        />
      )}

      {panel.kind === 'gate' && (
        <PassphraseGate onUnlocked={panel.onUnlocked} onCancel={() => setPanel({ kind: 'none' })} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run: `cd client && npm test`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "Wire TreeView, PersonProfile, PersonForm, RelationshipPicker, and PassphraseGate into App"
```

---

### Task 21: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: a GitHub Action that builds `client/` and deploys `client/dist` to GitHub Pages on every push to `main`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: npm ci
        working-directory: client
      - run: npm test
        working-directory: client
      - run: npm run build
        working-directory: client
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: client/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify locally that the build the workflow runs succeeds**

Run: `cd client && VITE_SUPABASE_URL=http://localhost VITE_SUPABASE_ANON_KEY=test npm run build`
Expected: a `client/dist` directory is produced with no build errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deploy workflow"
```

---

### Task 22: Manual end-to-end verification

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Start the real stack**

This manual pass needs the app's real code path (browser → `@supabase/supabase-js` → Supabase's REST/RPC layer), which the local Postgres-only test harness from Tasks 2–6 does not provide (that harness talks to Postgres directly, bypassing Supabase's API layer entirely). Since this machine's Docker policy blocks the Supabase CLI's local stack, use a real (free-tier) Supabase cloud project instead — the same one that will eventually back production, so this step doubles as deploy prep:

- Create a free Supabase project at supabase.com (or have the user do this, since it requires an account).
- Run `npx supabase link --project-ref <project-ref>` (no Docker involved — this only talks to the remote project).
- Run `npx supabase db push` to apply every migration from `supabase/migrations/` to the real project.
- Set the real project's passphrase: in the Supabase SQL editor, run `update app_config set value = crypt('<a real passphrase>', gen_salt('bf')) where key = 'passphrase_hash';`.
- Run `cd client && VITE_SUPABASE_URL=<project URL> VITE_SUPABASE_ANON_KEY=<project anon key> npm run dev` (both values are in the Supabase project's API settings).

- [ ] **Step 2: Walk the full add → link → view → edit → collapse/expand flow**

- Open the app with an empty database; confirm "Add the first person" appears (not a blank screen).
- Add a first person with only a first name; confirm it renders in the tree with no errors from blank optional fields.
- Try to add a second person's relationship without ever having entered the passphrase; confirm the PassphraseGate appears, and that the wrong passphrase (anything other than `changeme`, or whatever was set via `update app_config`) shows "Incorrect passphrase." and changes nothing.
- Enter the correct passphrase; confirm it's remembered (refreshing the page does not re-prompt for a second edit in the same browser).
- Add a parent via the tree's "Add Parent" slot; confirm the new person appears above, connected by a dashed seam.
- Add a sibling to that parent via the picker; confirm the sibling starts hidden behind a "N siblings" flap and appears once clicked.
- Double-click a person with recorded parents, a spouse, and a sibling; confirm all four glow and everyone else dims, and that a collapsed sibling flap auto-opens if a focused sibling is inside it.
- Click "Exit focus"; confirm the tree returns to normal.
- Edit a person's bio and occupation; confirm the profile reflects the change immediately.
- Attempt to add a parent-child relationship that would make an ancestor also a descendant of their own descendant; confirm it's rejected with an explanation, not a silent failure.
- Delete a person with at least one relationship; confirm the relationship count warning appears before the delete, and that the relationship rows are gone afterward.

- [ ] **Step 2: Record the result**

If every step above passes, the implementation is complete per the design spec's manual verification requirement. If any step fails, file it as a bug against the specific task above rather than patching ad hoc — the failing behavior traces back to one of Tasks 1–21.
