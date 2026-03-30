<!-- Last updated: 2026-03-26T12:00:00-05:00 -->
<!-- Archived from `.ai/plans/print_server_v3_testing_and_migration.md` — migration and print-path validation complete. Migrated to `.ai/initiatives/_archived/_completed/` 2026-03-27. -->
# Plan: Print server — V3 validation, V2 migration, distribution (completed)

**Status: closed (2026-03-26).** Installer legacy V2 cleanup, dashboard download, and inventory printing (Processor / Retag / Quick Reprice) **verified 2026-03-25**. Label layout was tracked separately — **closed** in [archive: print server label design](./print_server_label_design.md). Follow-on print work (pending): [receipt format](../_pending/print_server_receipt_format.md).

**Legacy removal:** **`ecothrift-printserver-setup.exe` → Install** runs [`cleanup_legacy_prior()`](../../../printserver/installer/setup.py) (V2 Startup VBS, `C:\DashPrintServer` / `C:\PrintServer` with safety checks, kill 8888). Optional IT batch: [`printserver/installer/uninstall_legacy_prior.bat`](../../../printserver/installer/uninstall_legacy_prior.bat).

**AI context:** [`.ai/extended/print-server.md`](../../extended/print-server.md).

---

## V2 footprint (historical)

`C:\DashPrintServer`, Python venv + `print_server.py`, Startup **`Eco-Thrift Print Server.vbs`**. No HKCU Run, no Service/Scheduler.

## V3 footprint

`%LOCALAPPDATA%\EcoThrift\PrintServer\`, `ecothrift-printserver.exe`, HKCU Run **`EcoThriftPrintServer`**.

## API note

V3 UI needs **`GET/PUT /settings`**. V2 had none.

---

## What was delivered

1. **Migration:** New installer removes V2 remnants before V3 install; optional `.bat` for IT.
2. **Distribution:** `distribute.bat`, `PrintServerRelease`, Settings client download; `UPDATE_CHECK_URL` in `printserver/config.py`.
3. **Validation:** End-to-end print path confirmed on dev + dashboard-download installer.

## Related

- `printserver/routers/manage.py`, `printserver/distribute.py`
- `.ai/initiatives/_index.md`
