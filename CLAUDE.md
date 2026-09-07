# Vansh — Project Instructions

See `PRODUCT.md` and `DESIGN.md` for product/design background, `README.md` for local dev + deploy setup, and `docs/superpowers/` for the original design spec and implementation plan.

## Session logging (required practice)

Every working session in this repository must keep a running written record, for posterity — so that later sessions (and the human maintainer) can understand what happened, why, and when, without having to reconstruct it from git log alone.

**At the start of a session:** create a new markdown file in `docs/sessions/`, named `YYYY-MM-DD-<short-topic-slug>.md` (the date the session started; the slug is a few words describing the session's main focus — e.g. `2026-09-06-deploy-debugging.md`). If a session continues same-day work already logged in an existing file for that date/topic, append to that file instead of creating a new one.

**After completing each distinct request within the session:** append an entry to that file recording:
- What was asked (a faithful one- or two-line summary of the actual request, not a paraphrase that loses intent)
- What was done in response (key actions, decisions, and reasoning — especially *why*, when a non-obvious choice was made)
- Outcome (commit SHAs if code changed, files touched, whether it worked, anything left open or deferred)

Keep entries factual and concise — this is a changelog/decision log, not a transcript. Skip entries for pure clarifying questions with no action taken; log the request that followed once it's resolved.

Do this proactively, without being asked each time — it's a standing practice, not a one-off task.

## Implementation plan execution

When an implementation plan (`docs/superpowers/plans/*.md`) is ready to execute, always use Subagent-Driven Development (`superpowers:subagent-driven-development`) — never ask which execution approach to use; just proceed with it.

## Other conventions

- This project's local database tests run against a native local PostgreSQL install (not Docker/Supabase CLI) — see `README.md` for why and how.
- Local dev requires `supabase/.env` (copy from `.env.example`) and `client` env vars pointed at a real Supabase project to run the actual app — there is no local-only dev-server mode.
- The default git branch is `master`, not `main` — anything that references a branch name (CI triggers, docs, etc.) must say `master`.
