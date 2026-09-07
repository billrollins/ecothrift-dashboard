<!-- Last updated: 2026-09-07 -->
# Protocol: Ship print server

**IF** this file is `@`-mentioned **OR** the user says ship-print-server / distribute print server / release print server / ship print server
**THEN** do every numbered step below, in order. Do not skip. Do not invent extra steps.

Print server semver is `VERSION` in [`printserver/config.py`](../../printserver/config.py). It is **not** repo `.version`. Do not run [`ship-push-git.md`](ship-push-git.md) or [`ship-push-heroku.md`](ship-push-heroku.md). Do not commit unless they also asked.

Admin Settings → Printing **Download** is `PrintServerRelease` (`is_current=True`) → `S3File.url`. Local Django and Heroku each have their own row. The exe lives once on S3.

## 1. Version gate

Read `printserver/config.py` (`VERSION`, `RELEASE_NOTES`, `CHANGELOG`) and the top dated section of [`printserver/CHANGELOG.md`](../../printserver/CHANGELOG.md).

**IF** they named a new version **OR** described a change that is not already in `VERSION` / those changelogs
**THEN** bump `VERSION` and `RELEASE_NOTES`, write the same bullets into the `CHANGELOG` string in `config.py` and into `printserver/CHANGELOG.md` (newest first). Keep those two changelogs identical.

| Change in this print-server ship | Bump |
|----------------------------------|------|
| Breaking print API; dropped route or client-used field | **MAJOR** |
| New endpoint, label/receipt feature, installer behavior stores will run | **MINOR** |
| Bug fix, layout tweak, docs-only | **PATCH** |

Highest bucket wins.
**IF** PATCH vs MINOR is unclear **THEN** PATCH.
**IF** MAJOR vs MINOR is unclear **THEN** STOP and ask. Do not bump yet.

**IF** they did not ask for a new version **THEN** leave `VERSION` as-is and distribute that.

## 2. Snapshot

Record all four. Do not guess.

| Check | How |
|-------|-----|
| Local Settings current | `PrintServerRelease` `is_current=True` via `manage.py shell` |
| Prod Settings current | `GET https://dash.ecothrift.us/api/core/system/print-server-version-public/` |
| This PC running | `GET http://127.0.0.1:8888/health` → `version` (offline is fine) |
| Dist exe | `printserver/dist/ecothrift-printserver.exe` FileVersion, if the file exists |

**IF** `VERSION` already matches local Settings **and** prod Settings **and** local `/health` **and** they did not bump in step 1 **THEN** STOP. Tell them it is already live. Do not rebuild.

## 3. Domain doc

**IF** routes, install path, receipt/label behavior, or the Settings download flow changed
**THEN** update [`.ai/extended/print-server.md`](../extended/print-server.md) (including **Current release**) and bump its stamp.
If not, leave it.

## 4. Build, S3, local Settings, local install

Do not run `printserver/distribute.bat` (it `pause`s). Run:

```bat
venv\Scripts\python.exe printserver\distribute.py --install-local
```

That script **skips** any step that is already done:

- Build — dist exe FileVersion already equals `VERSION` and setup exe exists
- S3 — `print-server/ecothrift-printserver-setup-v{VERSION}.exe` already in the bucket
- Local `PrintServerRelease` — current already equals `VERSION`
- Local install — `/health` already equals `VERSION`

Install (when needed) runs `python printserver/installer/setup.py --install`: stops `ecothrift-printserver.exe` **and** whatever is listening on port **8888**, copies the dist server exe to `%LOCALAPPDATA%\EcoThrift\PrintServer\`, keeps `settings.json` if present, writes HKCU Run, starts the new exe.

**IF** the script exits non-zero **THEN** STOP. Fix. Do not continue to Heroku.

`--force-build` / `--force-upload` only if they asked to rebuild or replace the S3 object.

## 5. Prod Settings download link

Re-read `GET https://dash.ecothrift.us/api/core/system/print-server-version-public/`.

**IF** `version` already equals `VERSION` **THEN** skip.

**ELSE** take `--size` from `printserver\dist\ecothrift-printserver-setup.exe` and `--release-notes` from `RELEASE_NOTES`. Run:

```bat
heroku run --no-tty -a ecothrift-dashboard -- python manage.py publish_printserver --ps-version VERSION --s3-key print-server/ecothrift-printserver-setup-vVERSION.exe --filename ecothrift-printserver-setup.exe --size SIZE --release-notes NOTES
```

Replace `VERSION`, `SIZE`, and `NOTES`. Do not force-push. Do not `git push heroku`.

**IF** Heroku CLI is missing or not logged in **THEN** STOP and say dash.ecothrift.us Settings was not updated. Local Settings (this Django) is already the new link if step 4 registered it.

## 6. Confirm

Live values must match `VERSION`:

- `GET http://127.0.0.1:8888/health`
- Local current `PrintServerRelease`
- Prod public endpoint (if step 5 ran or was already current)

**IF** any disagree **THEN** say so. Do not invent a version.

## 7. Report

STOP. Tell the user: print-server `VERSION`, which steps were skipped, S3 key, this-PC `/health`, local Settings current, prod Settings current.
Do not commit. Do not bump repo `.version`.
