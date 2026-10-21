<!-- Last updated: 2026-10-21 (flaky tests made reliable; TARS note lock and slow scanner tests listed) -->
# Known issues and live gaps

Load when a task touches one of these areas, or before a ship (docs audit in [`ship.md`](../protocols/ship.md)). Fixed items come off this list.

## Known issues

- **Inventory — acquisition cost:** `Item.retail_value` is vendor/manifest retail. `Item.cost` is allocated per PO using `PurchaseOrder.est_shrink` and listing retail. Retag floor stock can have null cost — see Item acquisition cost in [`backend.md`](backend.md).
- **`anthropic` package** must be in the venv for AI features (lazy import).
- Main JS chunk is about 0.9MB (275KB gzipped): every screen except login is lazy-loaded (`App.tsx`), and what is left is the shared base (MUI, react-router, react-dom, date-fns, axios, the API modules). Splitting MUI and React into vendor chunks was tried and made the first load bigger; only worth it for cross-release caching. Charts, the data grid, the editors, the PDF and camera libraries load only with their screens.
- **Thrift+ — floor counts include back stock and unwritten shrink:** the supply rule and Thrift+ → Overstock (rulebook P6) count every `on_shelf` unit, and almost none carry a back-stock location (52 of 35,017 on 10-19), so some products look slower than they are and grow ThriftBucks sooner. Fixed by back-stock counts (P5, P7).
- **TARS — note lock still reads the clock:** `comment_is_locked` (`restoration_comments.py`) counts another person's action as "after" a note by `started_at > occurred_at`. An action started in the same clock tick as the note does not lock it. Clear history's own split by action now goes by timeline ids (2026-10-21); the lock was left as it was.
- **Tests — slowest left under load:** with the full vitest suite beside the Django suite, the longest tests run 7-10 s against the 20 s limit (`MembersPanel`, `FinalizeThriftPlusPage`, `AdjustPlanDialog`, `BuildSvgDialog`, and the scanner's "opens a trip line's tag again"). Each types into its forms with `user.type`; if one starts timing out, give it the same treatment as the 2026-10-21 fixes (one change instead of typing, reduced motion for count-ups, a test clock instead of a real wait).
- **Tests — print server paced-print test needs pywin32:** `printserver/test_paced_print.py::PacedSendTests::test_one_job_written_a_strip_at_a_time_with_the_waits` fails in the main 3.14 venv with `No module named 'win32con'`. pywin32 is in `printserver/requirements.txt`, not in `requirements.txt`, so the rebuilt venv lacks it (seen 2026-10-21).

## Not yet implemented (live gaps)

- No DB link from won **Auction** → **PurchaseOrder**.
- Email notifications beyond Graph transactional mail (holds, magic links, and password resets are covered).
- Broad automated test suite (POS and restoration have coverage; most domains do not).
- Pricing ML model not trained. Buying report cards start empty: only trucks won with "We won it" (v2.104.0+) count, and calibration needs 5 trucks that are 90+ days old and half sold.
