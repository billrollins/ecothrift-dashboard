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

Public storefront (`frontend-public/src/styles.css`) uses a deeper forest `--brand: #18452d`. **Do not mix that into the dashboard.** Staff UI stays on `#2e7d32` so it matches MUI, receiving, processing, TARS, and login.

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
