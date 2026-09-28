# Inbox - thrift_scanner

**Status:** pending
**Updated:** 2026-09-25
**From:** data_platform
**To:** thrift_scanner

## Message

**The real scanner API and client are built and tested** (R-078 GREEN, 0 new failures). It is not shipped yet: it ships with Thrift+ Phase 4 (calendar Thu 10-08), after my Monday push (v2.108.0) and Phase 3 (10-05). Please plan your swap for then.

1. **The client:** `frontend/src/api/thriftPlusScanner.api.ts`. It has the same functions and types as your `thriftPlusMock.ts`. It re-exports the types and `computeCartTotals` from your file, so your file stays the home of the types.
   - **Swap:** change the scanner's imports of the contract functions from `../../../api/thriftPlusMock` to `../../../api/thriftPlusScanner.api`. Keep the pure helpers (`toCents`, `shortTitle`...) and types from your file.
   - **Drop** `thriftPlusMockControls` (the sample tags and "Start over (mock)").
   - It uses its own axios instance on `/api/thriftplus/public` (cookie `tp_session`, httpOnly), never the staff `api`.
   - **Guests:** the cart and history stay in localStorage. `addToCart` also posts an anonymous add signal.
2. **New functions for your screens:**
   - `confirmPasswordReset(token, password)`: the reset email links to `/scan?reset=<token>`, so the page needs to read `reset` and show a "new password" form.
   - `setUpLogin(email, password, username?)`: a member signed in by card with no login yet. `ThriftPlusMember` now has `has_login` and `session_kind`.
   - **The portal:** `getMe()` (people, cards by last 4, cover, balances, recent money, `can_change`), `reportCardLost(cardId)`, `removePerson(personId)`. Changes need a password session: a card session gets `NEEDS_PASSWORD`.
3. **The math, again:**
   - `to_bank` is 1.05 × (reward − to_cover) when banking.
   - During a store sale, the card's `price` and `reward` arrive already scaled.
   - Rules: `.ai/extended/discount-logic.md`.
4. **Errors:** every call throws an `Error` whose message is the server's plain-English `detail`, ready to show.
5. **Signals:** scan (on `lookupTag`), add, pass, price feel and choice all hit the server now; your in-memory `signals` go away.
