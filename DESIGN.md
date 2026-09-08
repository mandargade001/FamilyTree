---
name: Family Quilt
description: A stitched-patchwork family tree — every person a fabric patch, every relationship a visible seam.
colors:
  canvas: "#EAE5D9"
  patch: "#F5F1E7"
  patch-alt: "#EFE8DA"
  ink: "#2B2A26"
  muted: "#7A705F"
  border: "#C9C0AE"
  border-strong: "#A89A80"
  thread: "#33436E"
  thread-soft: "#DCE1EE"
  thread-ink: "#1F2A47"
  stitch-new: "#A85630"
  stitch-new-soft: "#F1DED2"
typography:
  display:
    fontFamily: "Bitter, Georgia, serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Bitter, Georgia, serif"
    fontSize: "17px-22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  name-label:
    fontFamily: "Bitter, Georgia, serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.06em"
  ui-text:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  pill: "16px"
  circle: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  xxl: "26px"
components:
  button-primary:
    backgroundColor: "{colors.thread}"
    textColor: "#ffffff"
    typography: "{typography.ui-text}"
    rounded: "{rounded.sm}"
    padding: "0 15px"
    height: "38px"
  button-ghost:
    backgroundColor: "{colors.patch}"
    textColor: "{colors.ink}"
    typography: "{typography.ui-text}"
    rounded: "{rounded.sm}"
    padding: "0 15px"
    height: "38px"
  input-field:
    backgroundColor: "{colors.patch}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 12px"
    height: "38px"
  chip:
    backgroundColor: "{colors.patch}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  patch-card:
    backgroundColor: "{colors.patch}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 8px 11px"
    width: "126px"
---

# Design System: Family Quilt

## Overview

**Creative North Star: "The Continuously-Pieced Quilt"**

Family Quilt renders the tree as literal textile: a warm linen canvas holds fabric patches (people), joined by stitched seams (relationships). It is a domestic, hand-assembled world, not a corporate org-chart or a cartoon family app — the build commits fully to this material metaphor rather than treating it as decoration on a generic card grid. Density stays low and calm: patches are compact (126px wide) but never cramped, generous canvas space surrounds the tree, and the palette stays muted and warm throughout so the single accent thread reads clearly against it.

The aesthetic philosophy is workaday craft, not preciousness: a slab serif (Bitter) carries names and headings while a plain sans (Source Sans 3) carries every data field, label, and body sentence — a legible pairing built for a wide-age, non-technical audience, not a display-face flourish. The build explicitly rejected a SaaS-pill-nav treatment and a travel-board-style highlight in favor of a full-region color commitment and a persistent "fresh stitch" marker, so the quilt metaphor governs color, shape, and motion together rather than sitting only in copy.

**Key Characteristics:**
- Linen canvas + fabric-patch cards, joined by dashed/stitched seam lines, never solid connector lines or arrows.
- One committed indigo-thread accent for all interactive/selected states; rust is reserved exclusively for "new/unseen" marking.
- Slab-serif names/headings over workhorse sans body — a legibility-first pairing, not a precious display face.
- Soft ambient shadows only; no hard-offset/neobrutalist shadow language.
- A native light/dark palette pair (`prefers-color-scheme` + `data-theme` override), both keeping the same warm-linen/indigo-thread relationship.

## Colors

The palette is a single warm, low-saturation linen family carrying one committed cool accent and one reserved warm-accent marker; there is no secondary or tertiary hue family.

### Primary
- **Thread Indigo** (`#33436E`): the one interactive/accent color — active tab underline, primary button fill, focus rings, seam lines, selected chip/toggle backgrounds, hover-state borders. Used sparingly and consistently as *the* signal for "interactive or currently active."
- **Thread Soft** (`#DCE1EE`): the pale wash of Thread Indigo — background for selected toggles/chips (`.btn-ghost.on`, `.rel-type.selected`, `.rel-chip.add`) and the text-selection color.
- **Thread Ink** (`#1F2A47`): darker indigo used only as text color on Thread Soft backgrounds, for contrast.

### Neutral
- **Muslin Canvas** (`#EAE5D9`): page background — the "table" the quilt sits on.
- **Patch Fabric** (`#F5F1E7`): the lighter fabric — background for cards, patches, inputs, chips, tab panels.
- **Patch Fabric Alt** (`#EFE8DA`): a slightly deeper fabric tone — frame background, thumbnail placeholders, hover rows.
- **Ink** (`#2B2A26`): primary text and default icon stroke.
- **Muted Taupe** (`#7A705F`): secondary text — subtitles, meta lines, placeholders, inactive tab labels, section-title labels.
- **Border** (`#C9C0AE`): default hairline borders (frame, inputs, result rows, tab underline track).
- **Border Strong** (`#A89A80`): the dashed "stitch" border weight used on patches, flaps, upload boxes, dashed seam lines.

### Reserved marker
- **Stitch Rust** (`#A85630`): reserved exclusively for "new/unseen" signaling — the fresh-patch badge and the required-field asterisk. Never used for general emphasis, links, or a second brand accent.
- **Stitch Rust Soft** (`#F1DED2`): the pale wash of Stitch Rust, used only behind the fresh-badge's stated context (not currently a filled surface in this build; reserved for future fresh-stitch treatments).

### Named Rules
**The One Thread Rule.** Thread Indigo is the only color that means "interactive, active, or selected." No other hue is introduced for links, toggles, or emphasis.

**The Reserved Rust Rule.** Stitch Rust appears only where something is new/unseen or required — never as a second decorative accent. If a screen needs another color to "pop," that is a defect, not a reason to expand the palette.

## Typography

**Display/Heading Font:** Bitter (weights 600/700), with Georgia, serif fallback
**Body Font:** Source Sans 3 (weights 400/500/600/700), with system-ui, sans-serif fallback

**Character:** A slab serif for names carries warmth and a hand-labeled, ledger-like formality; the plain grotesque-sans body keeps every data field and instruction unmistakably legible for a non-technical, wide-age audience. Neither face is used as a precious display flourish — Bitter appears only on names/titles, never on paragraph text or UI chrome.

### Hierarchy
- **Display** (700, 24px, line-height 1.2): profile name (`.profile-name`) — the single largest text in the system.
- **Title** (700, 17–22px, line-height 1.2): page title (`h1.title`, 22px), modal/picker headers (17–19px), gate title (17px).
- **Name Label** (600, 12px, line-height 1.25, Bitter): the person's name on a tree patch — the smallest place the display face still appears, always centered.
- **Body** (400, 13.5px, line-height 1.6–1.7, Source Sans 3): life-event text, bio text, field values; bio text caps at ~60ch.
- **UI Text** (600, 13px, Source Sans 3): tab labels, button labels, tool-tray text.
- **Label** (700, 11px, uppercase, letter-spacing 0.06em, Source Sans 3, Muted Taupe): section headers inside a profile (`.section-title`) — the only uppercase, letter-spaced text in the system, and only used as an in-page content divider, never as a marketing eyebrow above a headline.
- **Micro** (600, 9.5–10.5px, Muted Taupe): patch year range, add-parent-slot caption — smallest text, tabular-numeric for dates.

### Named Rules
**The Two-Face Rule.** Bitter is reserved for names and titles only; every label, button, field, and paragraph uses Source Sans 3. No component mixes the two faces for the same text role.

## Layout

The tree is a centered, top-down flex column of "generations," each generation a horizontally centered row of patches and couples, connected by dashed vertical/horizontal seam segments. Direct lineage renders as vertically stacked couples; siblings collapse by default behind a "flap" that unfolds inline rather than navigating away. A single `.wrap` container caps content at 1180px, and a `.frame` (10px radius, 1px solid border, 22px padding, soft shadow) contains each screen's content on a plain canvas background.

The person-profile screen uses a two-column grid (200px photo rail + flexible detail column) that collapses to a single column at 680px. Forms and pickers are narrow, single-column modal shells (420–460px max-width) centered on the frame — deliberately narrower than the tree screen, reflecting their single-task nature. Spacing follows a loose rhythm of 6/8/12/14/16/22/26px steps rather than a strict 4px/8px grid; larger gaps (22–26px) separate structural regions (toolbar to tree, generation to generation, profile columns), smaller gaps (6–8px) separate tightly related elements (patch internals, gallery thumbnails).

## Elevation & Depth

The system is flat at rest and uses shadow only as a structural response to interaction, never as ambient decoration on static surfaces. Two shadow steps exist: a barely-there resting shadow on frames/patches, and a deeper "lifted" shadow that appears only on hover (patches, primary button) or on the in-focus patch during Focus Mode. There are no hard-offset/neobrutalist shadows anywhere in the build.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(43,42,38,.10)`): default state for frames and patches — barely perceptible, just enough to separate fabric from canvas.
- **Lifted** (`box-shadow: 0 6px 16px -4px rgba(43,42,38,.22), 0 2px 5px rgba(43,42,38,.10)`): hover state on patches and the primary button; also paired with a 3px Thread-Soft ring (`0 0 0 3px var(--thread-soft)`) on the in-focus patch during Focus Mode.

### Named Rules
**The Hover-Only Lift Rule.** Nothing casts a deeper shadow at rest. Depth only appears in direct response to hover or focus state, reinforcing that the canvas itself is flat cloth, not a stack of physical layers.

## Shapes

Two form languages coexist deliberately: solid-bordered, moderately rounded containers (6–10px radius) for UI chrome — frames, buttons, inputs, result lists, tabs — and dashed-bordered "fabric" elements for anything representing a person or a foldable/removable unit — patches, the sibling flap, gallery thumbnails, the upload box, profile photo. Circles are reserved for avatars/thumbnails and small icon badges (gate icon, fresh-badge, result-avatar, the sibling-count bubble that toggles the sibling flap open). Pills (14–16px radius, approaching full stadium shape) are reserved for toggle-like interactive elements: relationship chips and the exit-focus button.

### Named Rules
**The Dashed Seam Rule.** Any element representing fabric — a patch, a photo slot, an upload target, the sibling flap — takes a dashed border (`1.5–2px dashed var(--border-strong)`). Structural chrome (frame, tabs, result rows, form dividers) always takes a solid 1px border instead. A dashed border is reserved for "this is cloth," never used decoratively on plain UI containers.

## Components

### Buttons
- **Shape:** 8px radius, 38px height, horizontal padding 15px.
- **Primary:** Thread Indigo background (`#33436E`), white text, resting shadow; on hover the shadow deepens to Lifted, no color change. Used once per screen for the single most important action (Add Person, Save, Unlock editing).
- **Ghost:** Patch Fabric background, Border Strong outline, Ink text; on hover border and text shift to Thread Indigo. A `.on` state (Focus Mode toggled) switches to Thread Soft background / Thread Indigo border / Thread Ink text — the same "selected" treatment used elsewhere in the system.

### Chips
- **Style:** Patch Fabric background, dashed Border Strong outline (`1.5px dashed`), 16px pill radius, 12px text.
- **State:** default chips (relationship chips) invert border-to-solid-Thread on hover; the "add" variant (`.rel-chip.add`, `.rel-type.selected`) is always solid-bordered Thread with Thread-Soft fill and Thread-Ink text — solid border signals "this chip is an action/selected state," not fabric.

### Cards / Containers (Patch)
- **Corner Style:** 8px radius, always paired with the 2px dashed Border Strong "stitch" outline — the signature card shape of the system.
- **Background:** Patch Fabric.
- **Shadow Strategy:** Resting shadow at rest, Lifted shadow + Thread border on hover; in Focus Mode, non-family patches drop to 30% opacity and desaturate while the in-focus patch gets a Thread-Soft ring plus Lifted shadow.
- **Internal Padding:** 9px 8px 11px, circular 46px photo thumbnail, Bitter 12px name, 10.5px muted year range.

### Inputs / Fields
- **Style:** Patch Fabric background, 1.5px solid Border, 6px radius, 38px height (74px for textarea).
- **Focus:** border shifts to Thread Indigo; no glow, no shadow — a plain color-shift focus treatment consistent across all fields including the passphrase gate input.
- **Required marker:** a Stitch Rust asterisk after the label text — the only non-thread color inside a form.

### Navigation (Tabs)
- Flat text tabs on a 2px solid Border underline track; inactive tabs are Muted Taupe, hover shifts to Ink, active tab turns Thread Indigo text with a 3px Thread Indigo underline. No pill/segmented-control treatment — underline-tab is the system's only top-level navigation pattern observed.

### Seam Lines (signature component)
Relationships render as literal stitching rather than as connector lines: a repeating dashed linear-gradient (2px, Border Strong for generation-to-generation lineage; Thread Indigo for spouse-to-spouse) replaces a solid SVG line. Vertical seams join parent generation to child generation; horizontal seams (`.seam-h`) join spouses within a couple. In Focus Mode, seams outside the focused family fade to 20% opacity while the focused couple's seam stays fully visible — the seam itself is treated as a first-class, dimmable element, not a static background decoration.

## Do's and Don'ts

### Do:
- **Do** use dashed borders only for fabric-representing elements (patches, photo slots, the sibling flap) — solid borders everywhere else.
- **Do** keep Thread Indigo as the sole color for interactive/active/selected state across every screen.
- **Do** reserve Stitch Rust strictly for "new/unseen" and "required field" signaling.
- **Do** render relationships as dashed/dotted stitched seam lines (repeating linear-gradient), never as solid connector lines or arrowheads.
- **Do** apply shadow only as a hover/focus response (Resting → Lifted), never as ambient depth on a static surface.
- **Do** pair Bitter exclusively with names/titles and Source Sans 3 with everything else.

### Don't:
- **Don't** introduce a second decorative accent color; if a screen needs a color to "pop," reserve it for a real new/unseen or required-field case, or don't add it.
- **Don't** use hard-offset/neobrutalist shadows — this world's depth language is soft and ambient-on-hover only.
- **Don't** replace the dashed seam-line technique with solid lines, arrows, or a generic tree-connector graphic; the stitched-seam rendering is the core signature of the metaphor.
- **Don't** promote the uppercase `.section-title` label style to a marketing eyebrow/kicker above page headlines — it is an in-page content divider only, observed at small scale (11px) inside a profile, not a hero device.
