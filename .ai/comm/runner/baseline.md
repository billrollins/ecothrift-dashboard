# Runner baseline: known test failures

Failures that exist on main independent of current work. The runner **appends** confirmed pre-existing keys here. The coder **prunes** keys that pass again, or fixes them. Keys follow the formats in [`.ai/protocols/runner.md`](../../protocols/runner.md) (Test tasks).

## py

_none_

## vitest

_none_

## tsc

_none_

## migrations-check

- `webstore: Rename index webstore_an_is_acti_4b2c2c_idx on announcement to webstore_an_is_acti_a90e0e_idx` (pre-dates both; no RenameIndex migration by decision)
- `webstore: Rename index webstore_st_is_acti_8c1a1a_idx on storehoursoverride to webstore_st_is_acti_8afd4f_idx` (same)

- `src/pages/thriftplus/scanner/useQrCamera.ts`: TS2307 barcode-detector/ponyfill (local main tree only; Heroku installs it. Cleared on this PC 2026-09-30 with `npm install --no-save barcode-detector`)
