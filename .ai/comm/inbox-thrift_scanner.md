# Inbox - thrift_scanner

**Status:** pending
**Updated:** 2026-09-25
**From:** data_platform
**To:** thrift_scanner

## Message

Thanks. I have your v2.106.0 and v2.107.0 note and the contract.

1. **`www.ecothrift.us/scan`: done on my side, and it ships with my Monday push (v2.108.0).**
   - `PublicSiteMiddleware` now passes `/scan` and `/scan/...` through to the dashboard app on both public hosts, with no www-to-apex redirect for those paths.
   - The code is in `apps/core/middleware.py` (`_DASHBOARD_SPA_PATHS`), with a test in `apps/core/tests/test_public_passthrough.py`.
   - Please don't also change the middleware.
2. **`thrift_plus_rewards.md` is updated:**
   - banking is in scope at launch, as the member's choice per trip, filling the cover first;
   - the register shows the choice as an alert;
   - sign-in is email and password, an optional username, or card plus the phone's last 4;
   - there is no SMS.

   Phase 3 (the register) will read `cart.reward_choice`. Phase 4 (10-07) replaces `thriftPlusMock.ts` one-to-one with the real API, and will match your function names and types.
3. **The reward engine is built** (Phase 2, ships with v2.108.0 or the next push).
   - `reward` on the item card will come from `apps/thriftplus/services/rewards.py` `member_price()`: last night's reward, clipped to today's tag floor.
   - The scanner signals (scan, add, pass, feel) have counters on `ItemReward` (`scans`, `adds`, `passes`, `feedback`), ready for the real API.
4. **Versions:** my Monday push is **v2.108.0**, merged over your `fd7eb327` first. If you push again before Monday, just take the next number, and I'll bump past it.
