# Eco-Thrift Dashboard - Coder Instructions for Mockup Implementation

## Context

Mockups in this directory are produced by a designer AI working in a constrained environment. The mockups use **plain React JSX with inline styles** because the design environment does not have access to MUI, TypeScript, the project's type system, React Query, or any production dependencies.

**This is a known constraint, not a mistake.** The mockups are the visual source of truth. Your job is to translate them into the production stack (MUI v7, TypeScript, React Query, Django REST APIs) while matching the mockup's appearance pixel-for-pixel.

Every mockup comes with two files:
- **`{page}-mockup.jsx`** - The visual target. Render it locally to see exactly what the page should look like.
- **`{page}_v{version}_design.md`** - The behavioral spec. Covers state machines, API calls, data flow, edge cases, and an MUI Translation Guide.

**Read both before writing code.** The mockup tells you what. The spec tells you how.

---

## Rendering the Mockup Locally

The mockup is a standalone React component. To see what you're targeting:

1. Drop the `.jsx` file into a scratch Vite/React project or use the Claude artifact renderer
2. Import and render the default export
3. This is your visual reference. Put it side-by-side with your implementation and match it

---

## The Styles Object Is Your Spec

Every mockup has a `st` (or `styles`) object at the bottom containing exact values for every UI element. These are not suggestions. They are the contract.

```jsx
// From the mockup
const st = {
  th: { 
    textAlign: "left", padding: "10px 12px", fontWeight: 700, fontSize: 11,
    textTransform: "uppercase", letterSpacing: "0.5px", color: "#1B4332",
    borderBottom: "2px solid #DDD5C9", backgroundColor: "#FAFAF6" 
  },
  formulaInput: {
    width: "100%", padding: "7px 10px", border: "1px solid #DDD5C9",
    borderRadius: 4, fontSize: 13, 
    fontFamily: "'Fira Code','SF Mono','Consolas',monospace",
    color: "#1B4332"
  },
  // ...
};
```

Your implementation must produce the same visual output as these values. How you get there (MUI `sx`, plain HTML `style`, CSS-in-JS) is your call, but the end result must match.

---

## MUI Translation Rules

The design spec for each mockup includes an **MUI Translation Guide** table. Follow it. When there's no guide, use these defaults:

### Use MUI for these (it adds real value):

| Element | MUI Component | Why |
|---|---|---|
| Modals/dialogs | `Dialog` | Focus trapping, escape key, overlay, aria. Override `PaperProps.sx` for border-radius, padding, max-width to match mockup's `st.modal`. |
| Dropdowns with search | `Autocomplete` | Keyboard nav, filtering, positioning. Override `renderInput`, `renderOption` for sizing. |
| Simple selects | `Select` | Keyboard nav, native behavior. Override `sx` and `MenuProps` for sizing. |
| Layout containers | `Box` / `Stack` | Thin wrappers, no sizing opinions. Use freely. |
| Loading indicators | `CircularProgress` / `LinearProgress` | Consistent, accessible. |
| Toast notifications | `Snackbar` via notistack | Already wired in the app. |

### Use plain HTML for these (MUI fights the design):

| Element | Use Instead | Why |
|---|---|---|
| Dense data tables | `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` | MUI `Table`/`TableCell` adds wrapper divs and default padding (16px) that bloat row height. The mockup targets 10-12px cell padding. |
| Compact text inputs (in tables, toolbars) | `<input>` with mockup styles | MUI `TextField` has label, fieldset, outlined variant padding (~16.5px per side) that doubles input height. The mockup targets 7-10px padding. |
| Micro buttons (in-row +/-, Apply, tag actions) | `<button>` with mockup styles | MUI `Button` has min-width (64px), ripple, text-transform. Mockup micro buttons are 22x22px. |
| Custom tags/badges (category, condition, vs%) | `<span>` with mockup styles | MUI `Chip` has fixed min-height (32px). Mockup chips are 16-20px tall. |
| Status chips (step indicators) | `<div>` / `<span>` with mockup styles | Custom styling with animations (pulse) that MUI Chip doesn't support cleanly. |
| Search inputs in toolbars | `<input>` with mockup styles | Same TextField inflation problem. A 200px search bar should be compact. |

### When you MUST use MUI for a dense element

Sometimes the design spec says to use MUI for something that has sizing opinions (e.g., `Select` for condition dropdowns in table cells). In those cases, strip MUI's defaults with `sx`:

```tsx
// Condition dropdown inside a table cell
<Select
  value={condition}
  onChange={handleChange}
  variant="standard"
  disableUnderline
  sx={{
    fontSize: 11,
    padding: '3px 6px',
    '& .MuiSelect-select': {
      padding: '3px 6px',
      minHeight: 'unset',
    },
  }}
>
```

The pattern: set `variant="standard"`, disable decorations, then override every sizing property via `sx` to match the mockup's `st` token.

---

## Common Sizing Mistakes

These are the most frequent ways implementations diverge from mockups:

**1. Content area width.** The mockup's main content fills all available space. If your implementation has a narrow centered column, you have a `maxWidth` constraint somewhere (likely in `MainLayout` or a parent `Container`). The preprocessing content area should be `flex: 1` with `padding: 24px`, no max-width.

**2. Card padding.** Mockup says `padding: 20px`. MUI `Paper` defaults may add more. Check and override.

**3. Table cell padding.** Mockup says `padding: "10px 12px"`. MUI `TableCell` defaults to `padding: 16px`. That's 60% more vertical space per row. Over 11 rows, you've added 132px of unwanted height.

**4. Input height.** Mockup says `padding: "7px 10px"` on a 13px font. That's ~33px total height. MUI `TextField` (outlined) renders at ~56px. Nearly double.

**5. Font sizes.** MUI body default is 14px or 16px depending on the variant. Mockup body text is 13px. Table headers are 11px. If text looks "too big," it is.

**6. Page background color.** Mockup uses `#F4F1EB` (warm linen). If your page is white, the cards have no visual separation. Set the background on the content area wrapper.

---

## Design Tokens

The mockup's `st` object should be ported to a `preprocessingTokens.ts` (or equivalent scoped token file) and imported by all preprocessing components. Do not scatter hex values and pixel sizes across components. Centralize them.

```tsx
// preprocessingTokens.ts
export const tokens = {
  colors: {
    greenDark: '#1B4332',
    greenPrimary: '#2D6A4F',
    greenMid: '#52B788',
    greenTint: '#F0F7F4',
    bgPage: '#F4F1EB',
    bgCard: '#FFFFFF',
    bgStripe: '#FAFAF6',
    borderDefault: '#DDD5C9',
    borderSubtle: '#EDE8E0',
    amber: '#B8860B',
    red: '#c0392b',
    blueChipBg: '#E3F2FD',
    blueChipText: '#1565C0',
  },
  typography: {
    pageTitle: { fontSize: 18, fontWeight: 700 },
    cardTitle: { fontSize: 16, fontWeight: 700 },
    body: { fontSize: 13 },
    tableHeader: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    caption: { fontSize: 10 },
    mono: { fontFamily: "'Fira Code','SF Mono','Consolas',monospace" },
  },
  spacing: {
    cardPadding: 20,
    cellPadding: '10px 12px',
    cellPaddingSm: '5px 10px',
    contentPadding: 24,
    cardGap: 16,
  },
} as const;
```

---

## Workflow

1. **Read the mockup file.** Render it. This is your target.
2. **Read the design spec.** Understand the state machine, API calls, data flow.
3. **Check the MUI Translation Guide** in the spec. It tells you what to use MUI for and what to keep plain.
4. **Port the `st` object** to a tokens file.
5. **Build the page.** Side-by-side with the rendered mockup.
6. **Compare.** Open the mockup in one window, your implementation in another. If padding, font size, colors, or layout don't match, fix them before moving on.

If you find yourself writing `sx` overrides longer than the component itself, that's a signal to use plain HTML instead of MUI for that element. The design spec will usually already tell you this, but use your judgment.

---

## When In Doubt

- **Mockup wins over MUI defaults.** Always.
- **Design spec wins over mockup** for behavioral questions (state, API, data flow).
- **Plain HTML wins over MUI** when MUI requires more than 3 `sx` overrides to match the mockup.
- **Ask** if something in the mockup seems wrong or contradicts production constraints. Don't silently "fix" it.
