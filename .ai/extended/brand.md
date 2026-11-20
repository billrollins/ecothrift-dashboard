<!-- Last updated: 2026-09-01 -->
# Brand colour

Eco-Thrift is a **green** brand. Navy, beige-sand, and mint gradients are leftover mockup chrome — they do not ship on new surfaces.

## Canonical hex

| Token | Hex | Where it is declared | Use |
|-------|-----|----------------------|-----|
| **Brand** | `#2e7d32` | `frontend/src/theme/index.ts` `palette.primary.main` | Primary buttons, selected chrome, pass, “good” |
| **Brand light** | `#60ad5e` | `palette.primary.light` | Progress, soft accents |
| **Brand dark** | `#1b5e20` | Prefer this over `#005005` | Hover, pressed, header gradient end |
| **Brand soft** | `#e8f5e9` | Derived | Selected row, preview bar, chip well |
| **Brand tint** | `#f0f7f0` | Derived | Page / desk behind a phone or form |
| **Secondary** | `#558b2f` | `palette.secondary.main` | Rare; do not invent a third green |
| **Ink** | `#1a1f1c` | Warm near-black (public site `--ink`) | Body text. Not navy. |
| **Page** | `#f4f7f5` | Sage, same as receiving | Desk / list backdrop. Never `#f5f5f5` grey, never `#EAE9E1` sand. |
| **Fail / overdue** | `#C0301C` | Semantic | Risk only |
| **Late / warning** | `#F0C766` / `#4A3200` | Semantic | Late, grace |
| **Blocking** | `#6A3FA0` | Semantic | Blocking pin only |

Public storefront (`frontend-public/src/styles.css`) uses a deeper forest `--brand: #18452d`. **Do not mix that into the dashboard.**

## The phone site and Thrift+ app (`frontend-public/src/phone/kit.css`)

The phone site has its own tokens, set in `kit.css` `:root` and nowhere else; a card or page never picks its own colours
(owner 2026-11-20: "how you are creating theme/branding consistent on mobile"). Boards: phone brand board
https://claude.ai/artifact/7pCUJWUqe4hF855DWMb31r, price tag colours https://claude.ai/artifact/BGfSd7NotSCa4QBR56QZjZ.

| Token | Hex | Use |
|-------|-----|-----|
| `--green` | `#1d5424` | Header, bands, main buttons (from the logo) |
| `--green-d` | `#143c19` | The store line under the search |
| `--leaf` | `#3f9f35` | Checks, "open now" |
| `--cream` / `--ground` | `#f4f2ea` / `#eef0ea` | Cards / the page behind them |
| `--ink` / `--ink-2` | `#10140f` / `#4d564b` | Words / quieter words |
| `--cran` | `#b4232c` | Loss words ("way too much"), Black Friday |
| `--tag-bg` / `--tag-num` | `#10140f` / `#e3efbe` | **The price tag: ink block, soft lime numbers** (owner 2026-11-20 picked "1 soft lime" over the black-and-lime tag). Every tag-like chip uses these two. |
| `--lime` | `#e3efbe` | **The one lime** (owner 2026-11-20: "just use the subtle lime and replace the ugly lime you had before everywhere"; was `#c8e382`): highlights on green, the BO-HO-GO card. Same colour as the tag numbers. |
| `--deal-bg` / `--deal-num` | `#f2c35b` / `#10140f` | **The deal tag** (owner 2026-11-20, "G2"): gold block, ink numbers, only for special deals (door busters, Black Friday, BO-HO-GO). Gold means a deal and nothing else, and is never on black ("just not on black"): the Black Friday teaser is cranberry and the door busters card cream. `<Tag deal />`. |
One font: Archivo (condensed heavy uppercase for headlines). Staff UI stays on `#2e7d32` so it matches MUI, receiving, processing, TARS, and login.

## Same colour, same meaning

From [`.ai/extended/ux-spec.md`](ux-spec.md): never colour alone; green = good; red = risk. On Routines that means:

- Brand green rail / `Passed` / Pass button / Fill in / Save / New / selected toggle = the same “this is the action or the good outcome.”
- Red rail / `Critical fail` / Fail / Overdue = needs attention.
- Violet rail = blocking, only.

## Where tokens live in code

| Surface | File | Notes |
|---------|------|-------|
| MUI theme | `frontend/src/theme/index.ts` | Source of `#2e7d32` |
| Routines + Documents list chrome | `frontend/src/components/duty/tokens.ts` (`dutyColors`) | Brand + ink + semantic. Import this; do not hardcode navy. |
| Receiving | `frontend/src/components/inventory/receiving/receivingTheme.ts` | `RCV_BRAND = #2e7d32` |
| Processing | `frontend/src/pages/inventory/processing/processingTokens.ts` | `primary = #2e7d32` |
| TARS | `frontend/src/pages/restoration/tars/tarsTokens.ts` | Same green |

New staff UI copies from `dutyColors` or `theme.palette.primary`, not from a mockup hex.

## Routines specifically

Phone header is a brand-green gradient, not navy. Primary actions (Fill in, Save, New, selected My Routines / Catalog chip) are brand. The 64px phone bar is **tinted by mode** and the status label is a small pill (title case, colour), never grey shouty caps on a white slab.
