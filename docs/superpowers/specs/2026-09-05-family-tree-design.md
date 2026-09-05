# Digital Family Tree — Design

## Purpose

Build a visual, digital family tree starting from the highest known ancestor, so the extended family can see the whole tree's shape and add to it over time. The tree must hold a full profile for each person (whatever information is known — much of it will be incomplete at first) and must be editable by non-technical relatives through a simple form, not by touching data files directly.

## Context / Constraints

- Starting from scratch — no existing spreadsheet, GEDCOM, or notes to import.
- Expected scale: 200+ people, unknown number of generations back.
- Editors: the whole extended family, assumed non-technical. They must use a point-and-click form — never a raw file or code.
- Sharing/viewing: hosted for real, at no cost — GitHub Pages (frontend) + Supabase (data/photos), so the whole family can reach it over the internet from day one, not just on a local network.
- Because the site is publicly hosted, viewing is open to anyone with the link, but **editing is gated by a shared family passphrase** (see Editing Flow) — no individual accounts.

## Approach

A statically-hosted React app (GitHub Pages) that talks directly to Supabase (Postgres database + file storage) instead of a custom server. Rejected alternatives:
- **Local Express server + JSON files** (original draft) — works, but requires a machine to be left running and reachable, and doesn't satisfy "accessible by everyone" as directly as free, always-on hosting does.
- **Static file, no backend at all** — fails the "non-technical relatives fill out a form" requirement, since nothing would persist form submissions.
- **Gramps / Gramps Web** — mature and fast to stand up, but hands over visual/UX control to an existing tool's design, when tailored "smooth clean visuals" was a stated goal.

## Architecture

```
FamilyTree/
├── client/                  # React + Vite SPA, deployed to GitHub Pages
│   ├── src/
│   │   ├── components/      # TreeView, PersonForm, PersonCard, PersonProfile, PassphraseGate
│   │   └── api/             # supabase-js client wrappers
│   └── .github/workflows/   # GitHub Action: build + deploy to Pages on push
├── supabase/
│   ├── migrations/          # SQL: table schema, RLS policies, RPC functions
│   └── functions/           # Edge Function: gated photo upload
└── docs/superpowers/specs/...
```

- **Hosting**: GitHub Pages serves the built static frontend (free, a GitHub Action redeploys it on every push to `main`). Supabase's free tier provides the Postgres database, file storage, and the serverless functions used for gated writes.
- **No server to run or keep alive** — the frontend talks straight to Supabase's API from the browser, so there's no local process to leave running and no separate "local vs. hosted" mode; it's the same live app for everyone from the start.
- Backup = a scheduled Supabase database export (or manual export from its dashboard) — replaces copying local JSON/photo folders.

## Data Model

Two Postgres tables in Supabase. Relationships are stored separately from people so a person can have multiple parents/spouses/children without duplicating their profile data.

```sql
create table people (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text,
  gender        text,
  birth_date    text,   -- loose text: "1932-04-12", "1932", "circa 1900s", "unknown"
  death_date    text,
  birth_place   text,
  occupation    text,
  bio           text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table relationships (
  id        uuid primary key default gen_random_uuid(),
  type      text check (type in ('parent-child', 'spouse')),
  from_id   uuid references people(id) on delete cascade,
  to_id     uuid references people(id) on delete cascade
);
```

Photos are stored in a Supabase Storage bucket (`photos/`), one folder per person id; a person's `photos` are looked up by listing that folder rather than a column on `people` (keeps uploads independent of profile edits).

- Every column except `id` and `first_name` is nullable. A person with just a name and a single parent-child link is a valid, useful node — most profiles will start incomplete and fill in gradually.
- Only two relationship types are stored (enforced by the `check` constraint); siblings, grandparents, etc. are derived from these at render/query time, not stored redundantly.
- Dates stay as loosely-validated text rather than a SQL `date` type, to accommodate fuzzy genealogical knowledge (a full date, when given, is still checked as a real calendar date before saving).
- `on delete cascade` on relationships means deleting a person automatically removes their relationship rows — paired with a client-side confirmation step (see Editing Flow) so this is never a silent surprise.

## Editing Flow

- **Viewing** is fully open — anyone with the link can browse the tree, no gate.
- **Passphrase gate**: the first time someone tries to add/edit/delete anything, a small prompt asks for the shared family passphrase. On success it's remembered in the browser (`localStorage`) so they aren't asked again on that device. There are no individual accounts — everyone who knows the passphrase edits as themselves, unattributed.
- Under the hood, all writes go through Postgres RPC functions (`add_person`, `update_person`, `delete_person`, `add_relationship`, `delete_relationship`) that take the passphrase as a parameter and verify it (against a hashed value stored server-side) before touching any data. Row-Level Security on the tables denies direct inserts/updates/deletes from the browser entirely — every write must go through one of these checked functions. Reads (`select`) stay open via RLS, matching "viewing is public."
- **Add Person**: a floating "+ Add Person" button opens a modal form (name, dates, place, occupation, bio, photo upload). Only first name is required. Calls `add_person(passphrase, ...fields)`.
- **Link a relationship**: "Add Parent" / "Add Spouse" / "Add Child" buttons — available both from a person's profile panel and, for "Add Parent," directly on their tree card when a parent slot is empty — open a picker that can search existing people or create a new person inline — so relatives never leave the flow to add someone who doesn't exist yet. Calls `add_relationship(passphrase, type, from_id, to_id)`.
- **Edit Person**: clicking a node opens their full profile (photo gallery, bio, dates); "Edit" reuses the same form, pre-filled. Calls `update_person(passphrase, id, ...fields)`.
- **Photo upload**: routed through a Supabase Edge Function that checks the passphrase, then writes to the Storage bucket using elevated privileges — keeping the same gate consistent for photos and data.
- **Delete**: requires confirmation and warns how many relationships will be removed with the person (queried beforehand) — no silent orphaning of the tree.
- **Concurrency**: Postgres handles concurrent writes natively; this is well within what the free tier handles at family scale/edit frequency.

## Tree Visualization

- Classic top-down layout: oldest known generation at the top, descendants branching downward. Computed client-side from the `people` + `relationships` tables on load (fetched via `supabase-js`), so the rendered tree is always in sync with current data (never stored as a separate structure).
- Each node is a compact card: photo thumbnail, name, birth–death years. Clicking opens the full profile in a side panel/modal without losing tree position. Connector lines are directional and unambiguous: a line from the bottom edge of a parent to the top edge of a child always means parent→child; a short line at mid-card-height between two adjacent cards always means spouse↔spouse. These never share a line style.
- **Growing upward**: any person missing a recorded parent (or missing one of two) shows a "+ Add Parent" slot directly above their card in the tree itself, not just from their profile panel — since most people will build the tree by adding ancestors above a known starting point, not only descendants below one.
- **Collapsing downward**: nodes with children show an expand/collapse toggle; a branch's descendants stay collapsed until that toggle is clicked — keeps a 200+-person tree from rendering as a wall of boxes vertically.
- **Collapsing sideways (sibling congestion)**: siblings of a direct-line ancestor are the real scaling risk — a person's 4 siblings, each married with children, multiplies every generation combinatorially, and downward-collapse alone doesn't touch it, since the explosion is lateral, not vertical. So by default, only a person's direct spouse renders next to them; any recorded siblings collapse behind a **"+N siblings" chip** beside their card. Expanding a chip reveals just those siblings (and their spouses) in the same generation row — each newly-revealed sibling's own descendants, and their own sibling chips, start collapsed too. Visual width is bounded by how many chips a viewer personally opens, never by the tree's full combinatorial size.
- **Default view on load**: the direct single lineage only (chosen focal person → their parents → grandparents, one line up; their own descendants down) — every sibling chip at every generation starts collapsed. Nothing collateral is visible until a viewer deliberately expands it.
- Library: `family-chart` (npm) — purpose-built for collapsible, spouse-pairing genealogy trees, avoiding hand-rolled tree-layout math on a generic charting library; sibling-chip collapse is app-level logic on top of it, since that's specific to this project's scaling need.

## Error Handling & Data Integrity

- `people.first_name` is `not null`; `relationships.from_id`/`to_id` are foreign keys, so both constraints are enforced by Postgres itself, not just application code.
- Cycle guard on `parent-child` edges (preventing a relationship that would make someone their own ancestor) is implemented inside the `add_relationship` RPC function, run before the insert.
- Photo uploads are size-limited (10MB/file) and type-checked (jpg/png/heic) inside the Edge Function before being written to Storage.
- Wrong passphrase → the RPC function raises an error the frontend surfaces as "incorrect passphrase," and no data is touched.
- Backup: a scheduled Supabase database export (built into their dashboard/CLI) plus the Storage bucket, on a periodic cadence — replaces the local zip-script approach from the original draft.

## Testing

- **Database**: tests for the RPC functions (correct passphrase required, cycle guard rejects an ancestor-loop, orphan-relationship rejected by the foreign key, wrong passphrase makes no change) run against a local/test Supabase project so tests never touch real family data.
- **Frontend**: component tests for the person form (required/optional field validation) and a smoke test that the tree renders correctly from a small fixture dataset (parent/child/spouse nesting as expected).
- **Manual verification**: after implementation, use the deployed (or locally-run) app to add a handful of test people/relationships through the actual UI — including entering the passphrase and confirming a wrong passphrase is rejected — to confirm the end-to-end flow (add → link → view in tree → edit → collapse/expand) works, before considering the feature done.

## Out of Scope (this draft)

- Individual accounts/attribution (who edited what) — the passphrase gate is shared, not per-person.
- GEDCOM import/export.
- Source citations/document attachments beyond photos (flagged as a possible future addition, not built now).
- Rotating/changing the shared passphrase after launch (would need a documented manual process, not built now).
