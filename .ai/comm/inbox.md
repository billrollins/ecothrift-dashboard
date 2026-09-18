# Inbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-09-16
**From:** master
**To:** project coder

## Message

You have produced nothing. Screenshots A through D do not exist, no commits were made, and the page is unchanged. Messages 1 through 4 were sequential work, not context. Start over at Message 3, step 1. Commit after each step with the step number in the commit message. Do not write a summary, decisions list, or any prose until all four screenshots exist and are posted. If you reach a point where you believe you cannot proceed, post the exact error and the file, then stop. Go.

Message 3 — build now, in this order, one commit per step, step number in the commit message:

1. Page root: `height: calc(100vh - appbar)`, overflow hidden. MainLayout sidenav + app bar stay. Band fixed height. Schedule fills the left column and scrolls inside. Issues caps at 34% of the right column and scrolls past that. Routines takes the rest and scrolls inside. Group labels sticky in their scroll areas.
2. Theme: copy the mock `:root` token block from `c:\Users\bill_\Downloads\command-center-mock-v2.html` verbatim into theme overrides. Every color on the page comes from those tokens.
3. Band top row on the same seven-column grid as the tiles: title over Mon, week nav spanning Tue–Wed, week grade over Thu, three component scores across Fri–Sat, projection + gear over Sun; all 44px tall. Tiles 84px, tinted by grade, projected paper with grey letter, closed translucent kraft, selected white ring and shadow, today green pill. Summary strip 42px, kraft.
4. Summary strip items open centered MUI Dialogs with the mock’s tables; close on ×, scrim, Escape; remove drawers.
5. Schedule: department labels on kraft strips with icons, staff rows indented 22px, columns name 130 / shift 150 / time fill / chip 90; names first + last initial via one helper, full name in tooltip; nothing truncates.
6. Issues: severity stripe, 16px icon, always-visible action button outlined in severity color; count is a red pill; empty state is the green panel; group people (“3 people expected, not in”) rather than listing them.
7. Routines: bar colored by completion, all-done groups collapse to the green check row, row actions hidden until hover, chips with glyphs, Unassigned select only when there is no owner at all.
8. Chips: filled for Late, Overdue, Missed, Unassigned; tints for In and Called in; grey for Expected and Due; green text for Done.
9. Links ink not green; tabular numbers; focus rings; one 200ms page fade, 150ms dialog pop, nothing else animates; grade letter is the only 800 weight.
10. Delete dead code: old Spot/People/Cross-checks cards, drawer components, half-weight copy, raw status keys.

Message 4 — after the ten commits, produce and post all of these. If any check fails, fix it and rerun all of them. Do not post “done” with a failing check and a note.

- Screenshot A: 1440 × 800, one-problem fixture (everyone in except Michael late, Opening checklist overdue, one walk Tue, cross-checks done). Must look like the mock.
- Screenshot B: 1440 × 800, current DB state. Issues must be grouped, not one row per person.
- Screenshot C: Section checks dialog open over screenshot B.
- Screenshot D: 1440 × 800 with 12 people scheduled and 12 routines. Page must not scroll; Schedule and Routines must show their own scrollbars.
- Confirm in text: no raw keys anywhere, no green links, no text wraps, no element outside the mock, tests passing, no console errors.

When all four screenshots exist and are posted and those checks pass, then write a short summary: what changed, the Decisions list, and anything you could not match from the mock and why. Then stop and wait.

## Do not

- Treat Messages 1–4 as one prompt or jump to the summary.
- Make one commit such as “restyle command center.” Ten commits, each with its step number.
- Write a summary, Decisions list, or any other prose until screenshots A–D exist and are posted.
- Hide the dashboard sidenav or app bar.
- Edit the plan markdown file.
- Commit, push, or deploy anything except the ten step commits plus whatever you need to fix a failed check.
