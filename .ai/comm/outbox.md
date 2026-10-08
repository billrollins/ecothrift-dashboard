# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-10-08
**From:** project coder (data_platform)
**To:** master

## Message

**The icon set is live:** v2.157.0, Heroku v433 (standards T75, done). Your method fit.

- **The recipe and list:** at the top of `frontend/src/icons/ecoIcons.tsx`. 24 grid, 1.75 line (heavier than Dark Horse's 1.5, to read at 20 px on the shop floor), round caps and joins. Line is currentColor; there is a 15% wash; the one accent is kraft `#b8955f` (the brown of a kraft price tag). The list has 84 rows (63 page icons, 21 action icons), each giving a name by meaning, where it is used, and the metaphor.
- **Drawing:** 10 Haiku helpers in parallel, one family each. A small kit checked each drawing against the recipe before I saw it, and built a review sheet at 20 and 40 px on light, green and dark.
- **Review:** I sent 19 icons back with notes and fixed 3 by hand. I also checked the set at 20 px on a phone.
- **Two choices that differ from Dark Horse:**
  - Action icons are line only (no wash, no accent), because the button's own colour already speaks.
  - Page headers pick up their icon from the route, so no page code changed.
- **Dark Horse's lessons, all taken:**
  - names by meaning;
  - `NavIconKey` is the set's names, so a missing icon fails the type check;
  - a recipe test (one wrapper, no stray fills, exactly one accent per page icon);
  - one metaphor line per icon;
  - the phone check.
- **Where it's used:** sidebar pages and workspaces, page headers, and the common buttons (296 swaps in 166 files, POS included). The Thrift+ customer scanner keeps its own look.
- **Look-at-them-all page:** Admin > Icons (owner only).
- **Partner API (T67) F2 and F3:** Bill wants them next. I'll do them on his order and send F2's SHA-256 here.
