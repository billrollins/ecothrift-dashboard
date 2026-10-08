# Inbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-10-08
**From:** master
**To:** project coder

## Message

### 1. New icons for every page (Bill, master chat, 2026-10-08)

Bill wants Eco-Thrift to have **its own icon set for all its pages**: every navigation item and workspace, page headers, and the common action buttons. Dark Horse built one this way, and its coder's how-to is on your shelf: `.ai/reference/from-master/2026-10-08-icon-method/` (start with `MANIFEST.md`). Take the **method**, not Dark Horse's icons or look.

**How Bill wants it made:**

1. **Opus (you) writes the recipe and the list.**
   - The recipe goes at the top of the icon file: grid, line weight, caps and joins, the colour roles, and the one accent that suits Eco-Thrift's look.
   - Then one row per icon: name (by meaning), where it is used, and a one-line metaphor.
2. **Haiku draws them in parallel.** Use one helper agent per icon (or per small batch), with the model set to `haiku`, which today is Haiku 4.5. Each one turns a row into SVG path data that follows the recipe and returns only that entry.
3. **Opus reviews them as a set.**
   - Render every icon onto one sheet at 20 px and 40 px, on light and dark, and look at it.
   - Send any icon that doesn't belong back with a note, then repeat.
   - Wire them in only when the set reads as one family.

**From Dark Horse's lessons:**
- names by meaning, not Material's;
- derive the registry's icon names from the set (a missing icon fails the type check);
- a test of the recipe (one wrapper, no stray fills);
- check at 20 px on a phone from the first icon.

This is ordinary S work, approved by Bill. Confirm the scope with him in your chat if anything in it is unclear. It ships when he says ship.

### 2. Apps reading each other (D19): the finance app's side is live

Rollins built its partner API (v0.16.0, Heroku v29). Contract: its `.ai/extended/partner-api.md`. This gives you two pieces for when Bill orders your builds (row T67):

- **F2 (you call the finance app):** scopes `transactions:read` and `categories:read`, entity `ecothrift`. When Bill orders it:
  1. `env pull`, then `manage.py partner_api new-token FINANCE`;
  2. add `FINANCE_API_BASE=https://dash.rollins-family.com`;
  3. `env push --confirm ecothrift-dashboard`;
  4. send the SHA-256 in your outbox, and master passes it on.
- **F3 (you serve daily sales):** the finance app made its token. When Bill orders your F3 build, register it against production:
  `manage.py partner_api add rollins-dashboard --sha256 494575508c4090f8718964b8c151ca1b86c6817c54ffb1f30a58d3cc4b10833a --entity ecothrift --scopes sales:read`.
  Name the scope `sales:read`; the finance app pulls `sales/daily?month=` nightly at 10:00 UTC.

## When you're done

Clear this inbox. Reply when the icon set is live, or if the method doesn't fit.
