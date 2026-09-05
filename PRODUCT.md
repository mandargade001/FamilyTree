# Vansh

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite (client), Supabase (Postgres + Storage + Edge Functions) as the backend, GitHub Pages for static hosting. Decided in the project's design spec, not delegated.

## Users

The whole extended family, assumed non-technical, across a wide age range including older relatives unfamiliar with tech. Everyone can view the tree; anyone who knows a shared family passphrase can add or edit people and relationships through point-and-click forms — no file editing, no code, no individual accounts.

## Product Purpose

A living, visual digital family tree starting from the highest known ancestor, so the family can see the tree's shape and keep extending it together over time. Every person is a profile holding whatever is known about them (name, dates, place, occupation, bio/life stories, photos), and incomplete profiles are expected and fine — the tree grows in as facts trickle in.

## Positioning

Unlike a shared spreadsheet or a heavyweight genealogy suite (e.g. Gramps/Ancestry), this is a small, purpose-built, free, always-on, link-shareable tree with a deliberately minimal edit gate (one shared passphrase, no signup) — built for a family that wants to collaborate casually, not for professional genealogists doing sourced research.

## Operating Context

- Viewing happens via a public GitHub Pages link, open to anyone who has it.
- Editing (add/edit/delete person, add/remove relationship, upload photo) happens through in-app forms, gated by a one-time passphrase prompt remembered per browser.
- All reads/writes flow through Supabase (Postgres tables + RLS-restricted RPC functions + one Edge Function for gated photo upload) — there is no custom server process to run or keep alive.

## Capabilities and Constraints

- Two data types: `people` (profile fields, all optional except first name) and `relationships` (`parent-child` or `spouse` edges between people); siblings/grandparents/etc. are derived, not stored.
- Tree view: classic top-down layout, collapsible branches, must stay legible at 200+ people.
- Cycle-guard prevents a person from being recorded as their own ancestor.
- Deleting a person cascades its relationships, with a confirmation step warning how many links will be removed.
- No individual accounts/attribution, no GEDCOM import/export, no source citations beyond photos, and no passphrase-rotation flow — explicitly out of scope for this build.
- Name: Vansh (Hindi/Sanskrit for lineage/descendants) — confirmed.

## Evidence on Hand

None yet — starting from scratch, no existing spreadsheet, GEDCOM export, or notes to import. No real people/photo data exists to reference during design; wireframes and later builds must use clearly placeholder content, not fabricated real names or photos.

## Product Principles

- Optional-by-default data: never force a field the family may not know yet.
- Non-technical first: every edit path is a form, never a file or code.
- Free and always-on beats local and occasional: hosting choices favor zero-cost, zero-maintenance persistence over local convenience.
- Legibility scales with the tree: collapsing/drilling-in, not infinite scroll or dense clutter, is how 200+ people stay readable.
- Minimal gate, not a wall: the passphrase stops randoms, not family — never add friction beyond that single shared secret.

## Accessibility & Inclusion

Standard modern web accessibility practices (WCAG-level contrast, readable font sizes, adequate tap/click targets, keyboard operability) — no special extra-large/high-contrast mode required, per explicit decision.
