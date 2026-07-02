# Floorplan element SVG — AI generation prompts

**Purpose:** Prompt templates for generating SVG assets that upload cleanly into the Eco-Thrift floorplan builder (`FloorPlanAsset` → element kind default image or per-instance `element.image`).

**Store finished files in:** [`element-svg/`](element-svg/) (by category; filename = `{kind}.svg`).

**Last updated:** 2026-07-02

---

## How assets are used (constraints the model must respect)

| Rule | Detail |
|------|--------|
| **View** | Top-down / bird's-eye **floor plan** only (not elevation, not 3D, not perspective) |
| **Scaling** | SVG is drawn inside the element footprint with `preserveAspectRatio="xMidYMid meet"` — artwork is **letterboxed** if aspect ratio differs |
| **Footprint units** | Plan uses **inches**; default element size is W×H in inches (e.g. gondola **48×144**) |
| **viewBox** | Set `viewBox="0 0 {width} {height}"` using the **same numeric ratio** as the element footprint (recommended: use footprint inches directly) |
| **Coordinate system** | SVG origin top-left, **y increases downward** (matches canvas) |
| **Output** | Single root `<svg>` only — raw markup, no markdown fences, no explanation |
| **Size limit** | ≤ **512 KB** — prefer simple paths, no dense hatching |
| **Security (upload sanitizer strips)** | No `<script>`, `<foreignObject>`, `<iframe>`, `<embed>`, `<object>`, `<animate>`, `<set>`; no `on*` attributes; no external `href` / `xlink:href` (http, file, javascript); no `<!DOCTYPE>` / `<!ENTITY>` |
| **Fonts & images** | No external fonts or linked images — **inline paths and fills only** (data URIs for nested images are stripped if external) |
| **Labels** | Editor draws captions separately — **do not embed text** unless the label is part of the fixture graphic itself (prefer no `<text>`) |
| **Rotation** | User rotates in 90° steps on canvas — design for **rotation 0°** with long axis vertical (height) unless the brief says otherwise |
| **Style** | Flat, diagrammatic retail floorplan — readable when scaled to ~½–2 inches on screen |

---

## General system prompt (all element types)

Copy everything between the lines into the **system** role.

```
You generate SVG markup for a retail store floorplan editor (top-down view).

OUTPUT FORMAT
- Return ONLY a valid SVG document starting with <svg and ending with </svg>.
- No markdown, no code fences, no commentary before or after.

COORDINATE SYSTEM
- Top-down orthographic floor plan (bird's-eye), not elevation or 3D.
- SVG viewBox origin at top-left; y-axis points down.
- Set viewBox="0 0 W H" where W and H match the requested footprint width and height (in the same abstract units, typically inches).
- Draw all geometry inside [0, W] × [0, H]. Leave a small inset margin (~2–4% of min(W,H)) if needed so strokes are not clipped.

VISUAL STYLE
- Flat diagram / plan symbol suitable for architects and store planners.
- Solid fills and simple strokes; avoid photorealism, gradients, shadows, and fine texture.
- Use a limited palette (2–5 colors). Prefer saturated but not neon fills; dark gray or near-black strokes (#263238, #37474f).
- Stroke widths should be proportional to viewBox (e.g. 0.5–2% of min(W,H)).
- The symbol must remain recognizable when scaled down to a small rectangle on a grid.

TECHNICAL RULES (required for upload)
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"> with optional width/height attributes matching viewBox.
- Use only: svg, g, path, rect, line, polyline, polygon, circle, ellipse.
- Do NOT use: script, foreignObject, iframe, embed, object, animate, set, defs with external references, style blocks that @import, or filter-heavy effects.
- Do NOT use event attributes (onclick, onload, etc.).
- Do NOT reference external URLs in href or xlink:href.
- Do NOT include DOCTYPE or entity declarations.
- Prefer explicit fill and stroke attributes on shapes (fill="#..." stroke="#..." stroke-width="...").
- No embedded raster images.

SEMANTICS
- The drawing represents a single fixture or architectural element as seen from above.
- Align the symbol so the “front” or customer-facing edge reads naturally at rotation 0 (usually the shorter edge at the bottom of the viewBox unless specified).
- Do not draw room context, floor texture, dimensions, or scale bars unless explicitly requested.

When given an element brief (name, footprint W×H, category, optional colors), produce one SVG that satisfies the brief and all rules above.
```

---

## Element-specific prompt template (user message)

Use this **user** message pattern; fill in `{…}` per element.

```
Element: {display name}
Kind slug: {kind, e.g. gondola}
Category: {Structural | Fixtures | Service | Misc}
Footprint: {width} × {height} inches (W × H, top-down)
Shape: {rect | circle — if circle, draw in square viewBox min(W,H)}

Visual description:
{2–5 sentences: what the fixture looks like from above, distinctive features, symmetry, open vs solid areas}

Colors (optional):
- Primary fill: {hex}
- Accent / stroke: {hex}
- Secondary: {hex}

Must include (from above):
- {feature 1}
- {feature 2}

Avoid:
- {anything misleading at small scale, text labels, 3D shading, …}

Output the SVG only.
```

---

## Example: Gondola shelving

### Footprint reference (seeded catalog)

| Field | Value |
|-------|--------|
| kind | `gondola` |
| label | Gondola shelf |
| category | Fixtures |
| default size | **48 × 144 in** (4 ft wide × 12 ft deep) |
| aspect ratio | 1 : 3 (narrow width, long depth) |

### Gondola-specific system addendum (optional second system block or append to user message)

```
GONDOLA-SPECIFIC GUIDANCE (top-down):
- A gondola is a double-sided retail shelving run seen from above as a long rectangle.
- Show the outer footprint (48×144 in viewBox) as a subtle fill or outline.
- Indicate the long central spine / base deck and parallel shelf edges on both sides of the spine (typical “ladder” or parallel-line pattern).
- Optionally show end-cap hints at top/bottom short edges (slightly wider bump or end rail) — keep minimal.
- Leave the center aisle-facing long edges visually distinct from the ends.
- Do not show products, price tags, or people.
- At rotation 0, the 144" dimension is vertical (depth along the aisle); 48" is horizontal (width).
```

### Full user prompt — gondola (copy-paste ready)

```
Element: Gondola shelf
Kind slug: gondola
Category: Fixtures
Footprint: 48 × 144 inches (W × H, top-down)
Shape: rect

Visual description:
Standard supermarket/thrift gondola shelving unit seen from directly above. A long narrow rectangle representing the deck and shelf stack. Parallel horizontal shelf lines on both sides of a central spine (double-sided fixture). Slightly heavier outline on the two long sides facing cross-aisles. End caps at the short ends shown as slightly thicker bars or rounded caps. Diagrammatic and symmetric.

Colors (optional):
- Primary fill: #7986cb
- Accent / stroke: #37474f
- Shelf lines / spine: #5c6bc0

Must include:
- viewBox="0 0 48 144"
- Central spine or base line running the full 144" depth
- 4–8 evenly spaced shelf edge lines per side (or simplified pairs of lines)
- Clear outer boundary of the 48×144 footprint

Avoid:
- Text, dimensions, 3D perspective, products on shelves, gradients, drop shadows
- viewBox aspect ratio other than 48:144

Output the SVG only.
```

---

## Quality checklist (human or AI reviewer)

Before upload to `/api/floorplan/assets/`:

- [ ] Valid XML; opens as SVG
- [ ] viewBox aspect ratio matches element default W×H
- [ ] No forbidden tags/attributes (see sanitizer list)
- [ ] File size < 512 KB
- [ ] Readable at thumbnail size (~24×24 px screen pixels)
- [ ] Looks correct at 0°, 90°, 180°, 270° rotation on canvas
- [ ] No embedded text that duplicates editor labels (unless intentional)

---

## Open options (for future automation)

- **Negative prompts library** per category (Fixtures vs Structural)
- **Auto viewBox** from kind `default_w` / `default_h` injected by tooling
- **Post-processor** to normalize stroke widths or snap paths to viewBox inset
- **PNG fallback** prompt variant for photo-real fixtures (same footprint rules, no SVG sanitizer concerns)
