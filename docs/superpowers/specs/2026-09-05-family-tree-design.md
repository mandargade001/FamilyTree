# Digital Family Tree — Design

## Purpose

Build a visual, digital family tree starting from the highest known ancestor, so the extended family can see the whole tree's shape and add to it over time. The tree must hold a full profile for each person (whatever information is known — much of it will be incomplete at first) and must be editable by non-technical relatives through a simple form, not by touching data files directly.

## Context / Constraints

- Starting from scratch — no existing spreadsheet, GEDCOM, or notes to import.
- Expected scale: 200+ people, unknown number of generations back.
- Editors: the whole extended family, assumed non-technical. They must use a point-and-click form — never a raw file or code.
- Sharing/viewing: local only for now (same-network access is enough); the design should not preclude hosting it for full remote/internet access later.
- No accounts/auth in this draft — anyone with the link can view and edit.

## Approach

A custom local full-stack web app: a React tree-view frontend, a small Express API, and JSON-file + local-photo-folder storage. Rejected alternatives:
- **Static file, no backend** — fails the "non-technical relatives fill out a form" requirement, since there'd be no server to persist form submissions to.
- **Gramps / Gramps Web** — mature and fast to stand up, but hands over visual/UX control to an existing tool's design, when tailored "smooth clean visuals" was a stated goal.

## Architecture

```
FamilyTree/
├── server/              # Node + Express API
│   ├── index.js         # starts server, serves API + built frontend
│   ├── routes/
│   │   ├── people.js     # CRUD for person profiles
│   │   └── relationships.js
│   ├── data/
│   │   ├── people.json
│   │   └── relationships.json
│   └── photos/          # uploaded image files, saved by person id
├── client/              # React + Vite SPA
│   ├── src/
│   │   ├── components/  # TreeView, PersonForm, PersonCard, PersonProfile
│   │   └── api/         # fetch wrappers to the Express API
└── docs/superpowers/specs/...
```

Express serves both the API and the built React app as one process. Running it binds to the machine's LAN IP, so any relative on the same Wi-Fi opens `http://<host-ip>:PORT` in their browser and gets the same live app. No database server to install — backup is just copying `server/data/` and `server/photos/`. This structure carries over unchanged to a future real deployment (e.g. Render/Railway) for internet-wide sharing — that would add persistent disk config and auth, not a rewrite.

## Data Model

Each person is a standalone profile record. Relationships are stored separately so a person can have multiple parents/spouses/children without duplicating their profile data.

```json
// server/data/people.json
{
  "id": "p_001",
  "firstName": "Anna",
  "lastName": "Gade",
  "gender": "F",
  "birthDate": "1932-04-12",
  "deathDate": null,
  "birthPlace": "Pune, India",
  "occupation": "Teacher",
  "bio": "Free-text life story / anecdotes...",
  "photos": ["photo_p001_1.jpg", "photo_p001_2.jpg"],
  "createdAt": "...",
  "updatedAt": "..."
}
```

```json
// server/data/relationships.json
{ "id": "r_001", "type": "parent-child", "from": "p_001", "to": "p_002" }
{ "id": "r_002", "type": "spouse", "from": "p_001", "to": "p_003" }
```

- Every field except `id` and `firstName` is optional. A person with just a name and a single parent-child link is a valid, useful node — most profiles will start incomplete and fill in gradually.
- Only two relationship types (`parent-child`, `spouse`) are stored; siblings, grandparents, etc. are derived from these at render time, not stored redundantly.
- Dates are stored as loosely-validated text (`"1932"`, `"circa 1900s"`, `"unknown"`, or a full ISO date) to accommodate fuzzy genealogical knowledge — a full date, when given, is validated as a real calendar date.
- Photos are named by person id on disk, so orphan-file cleanup is straightforward.

## Editing Flow

- **Add Person**: a floating "+ Add Person" button opens a modal form (name, dates, place, occupation, bio, photo upload). Only first name is required. Saves via `POST /api/people`.
- **Link a relationship**: from a person's profile, "Add Parent" / "Add Spouse" / "Add Child" buttons open a picker that can search existing people or create a new person inline — so relatives never leave the flow to add someone who doesn't exist yet. Saves via `POST /api/relationships`.
- **Edit Person**: clicking a node opens their full profile (photo gallery, bio, dates); "Edit" reuses the same form, pre-filled. Saves via `PATCH /api/people/:id`.
- **Delete**: requires confirmation and warns how many relationships will be removed with the person — no silent orphaning of the tree.
- **Concurrency**: simple read-modify-write per request on the JSON files. This is adequate at family scale/edit frequency; it is not designed for high-concurrency multi-writer use.
- No login/accounts in this draft, consistent with "local only for now."

## Tree Visualization

- Classic top-down layout: oldest known generation at the top, descendants branching downward. Computed client-side from `people.json` + `relationships.json` on load, so the rendered tree is always in sync with current data (never stored as a separate structure).
- **Collapsible branches**: nodes with children show an expand/collapse toggle. The tree opens showing the top 1–2 generations by default; branches are drilled into on click — keeps a 200+-person tree from rendering as a wall of boxes.
- Each node is a compact card: photo thumbnail, name, birth–death years. Clicking opens the full profile in a side panel/modal without losing tree position.
- Spouses render side-by-side at the same generation level, connected down to their shared children.
- Library: `family-chart` (npm) — purpose-built for collapsible, spouse-pairing genealogy trees, avoiding hand-rolled tree-layout math on a generic charting library.

## Error Handling & Data Integrity

- Server rejects a person record with no first name, and rejects any relationship referencing a non-existent person id.
- Cycle guard on `parent-child` edges prevents a relationship that would make someone their own ancestor.
- Photo uploads are size-limited (10MB/file) and type-checked (jpg/png/heic) before being written to disk.
- A `npm run backup` script zips `server/data/` and `server/photos/` with a timestamp, for cheap insurance before bulk edits.

## Testing

- **Backend**: unit tests for the API routes — create/edit/delete person, add relationship, cycle guard, orphan-relationship rejection — run against an in-memory/temp JSON file so tests never touch real data.
- **Frontend**: component tests for the person form (required/optional field validation) and a smoke test that the tree renders correctly from a small fixture dataset (parent/child/spouse nesting as expected).
- **Manual verification**: after implementation, run the dev server and add a handful of test people/relationships through the actual UI to confirm the end-to-end flow (add → link → view in tree → edit → collapse/expand) works, before considering the feature done.

## Out of Scope (this draft)

- Authentication/accounts, and remote/internet hosting (structure supports it later, but not built now).
- GEDCOM import/export.
- Source citations/document attachments beyond photos (flagged as a possible future addition, not built now).
- SQLite/database migration (JSON files are sufficient at current scale; noted as an upgrade path if needed).
