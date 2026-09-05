---
version: 1
slug: "tree-view"
primary_target: "tree-view"
related_targets: []
---

# Surface Brief: Family Tree App (primary surface: tree view + person profile + forms)

Scope: Operate mode — the whole app (tree view, person profile, add/edit person, add relationship, passphrase gate). Task-focused: browse, add, and edit family profiles and relationships. Frequent, casual use by a wide-age, non-technical audience.

Audience/job: Extended family members of all ages, including elderly non-technical relatives. Job: check in on the tree, add a newly-recalled relative or fact, browse a branch. Proof/content: real names, dates, photos, life stories — no invented commercial claims, all example content in design work is clearly placeholder.

Constraints: standard web accessibility (no special extra-large mode). No visual authority existed before this brief — new world created below.

## Direction contract

THESIS: The family tree is a continuously-pieced quilt, not a corporate org-chart or a cartoon family app — every person is a stitched fabric patch, every relationship a visible seam.

OWN-WORLD: Warm muted linen canvas (#EAE5D9) with lighter patch fabric (#F5F1E7); warm charcoal ink (#2B2A26), muted taupe-grey secondary (#8C8477); one committed indigo-thread accent (#33436E) for seams/interactive elements; a small rust-thread marker (#A85630) reserved only for "new/unseen" highlights. Bitter (slab serif) for names/headings; Source Sans 3 for body/data — legible workhorse pairing, not a precious display face. Patches are rounded cards with a dashed stitch-line border and corner cross-stitch marks; relationships render as thicker stitched seam-lines (parent→child vertical, spouse↔spouse horizontal cross-stitch); collapsed siblings show as a folded flap tab at the patch corner.

STORY: A visitor opens onto their own patch, follows seams up to parents and down to children, and adding someone visibly stitches a new patch into the canvas.

FIRST VIEWPORT: Tree view — muslin canvas ground, direct-lineage patches seamed vertically, sibling flaps closed, a quiet tool-tray strip (search, focus toggle, add-patch) above the canvas, no floating pill nav.

FORM: Family Quilt / textile patchwork, assigned index 7 of 7 grounded directions, seed key badc1d46. Raised by: full-region color commitment (declined SaaS-pill challenger) and a persistent "fresh stitch" highlight on newly-added/edited patches (declined travel-board challenger).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions
- Exact stitch/seam rendering technique (CSS border-image vs. SVG dash pattern) — left to implementation.
- Whether the "fresh stitch" highlight auto-clears on view or requires dismissal — left to implementation, default to auto-clear on view.
