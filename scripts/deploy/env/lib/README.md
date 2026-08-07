# Environment config & Heroku sync

Handoff doc for reviewing how local/prod env vars are organized and pushed to Heroku.

## Purpose

Eco-Thrift dashboard reads configuration from **exactly two repo-root env files**.
Both are gitignored; there is no committed example/template file:

| File | Role |
|------|------|
| **`.env`** | Local development — Django (`ecothrift/settings.py` via python-decouple), Vite (`frontend/vite.config.ts` loads same file) |
| **`.envprod`** | Production mirror — same keys as the shared portion of `.env`, but with prod-specific values in the **top section** (DEBUG, hosts, etc.) |

The authoritative list of supported variables is the **Environment Variables** table in
`.ai/extended/development.md`.

**Heroku does not read `.env` or `.envprod`.** Those files exist on the developer machine only. Production uses **Heroku Config Vars** set separately (Dashboard or CLI).

The deploy script **`scripts/deploy/env/sync_to_heroku.bat`** pushes **`.envprod` → Heroku Config Vars** so prod config stays in one editable file locally.

## Developer workflow

1. Edit **`.env`** for local dev; edit **`.envprod`** when prod/Heroku values should change.
2. Keep the **shared block** (keys, models, AWS, B-Stock, …) identical between the two files unless intentionally different.
3. When ready to update Heroku:

   ```bat
   scripts\deploy\env\sync_to_heroku.bat --dry-run
   scripts\deploy\env\sync_to_heroku.bat
   ```

4. **`--dry-run`** prints var names and masked values; never contacts Heroku, so it
   works offline and without login.
5. **`--check-drift`** reads the live Config Vars and reports keys that exist on
   Heroku but not in `.envprod`; pushes nothing. Requires `heroku login`.
6. Live sync asks `Y/N` confirmation, runs the drift report, then `heroku config:set`
   in batches of 20 (each batch is one release, so expect a restart per batch).

**This sync only ever sets keys — it never unsets.** A var added directly on Heroku
therefore survives forever and silently breaks the "`.envprod` mirrors production"
promise. That is what `--check-drift` exists to catch; clear a stale one with
`heroku config:unset <KEY> -a ecothrift-dashboard`.

## Folder layout

```
scripts/deploy/env/
  sync_to_heroku.bat          ← only operator-facing file
  lib/
    README.md                 ← this file
    env_io.py                 ← parse .env format, repo_root(), mask secrets for dry-run
    sync_to_heroku.py         ← CLI: read .envprod, skip local-only keys, heroku config:set
```

**Do not move `.env` / `.envprod` into this folder.** Django and Vite expect them at the repo root.

## What the sync script pushes vs skips

**Skipped (never sent to Heroku):**

- `DATABASE_URL` — Heroku Postgres addon manages this
- `DATABASE_*` — local Postgres only
- `PROD_DATABASE_*` — local convenience for `0_pull_prod_to_local.bat` / `--database production`
- `VITE_DEV_LOG` — local frontend dev only
- Heroku internal vars (`HEROKU_*`)

**Empty values** are skipped (won’t clear an existing Heroku var).

**Everything else** in `.envprod` is pushed, including API keys and all `AI_*` model knobs.

Default app: `ecothrift-dashboard` (`--app` override on the Python script).

## Recommended `.env` / `.envprod` structure

**Top — environment-specific** (different between the two files):

| Concern | `.env` (dev) | `.envprod` (prod) |
|---------|--------------|-------------------|
| Debug | `DEBUG=True` | `DEBUG=False` |
| Environment | `ENVIRONMENT=development` | `ENVIRONMENT=production` |
| Django settings | *(default `ecothrift.settings`)* | `DJANGO_SETTINGS_MODULE=ecothrift.settings_production` |
| Secret key | local dev key | prod key (unique) |
| Hosts | `localhost,127.0.0.1,testserver` | `dash.ecothrift.us,…` |
| Database | `DATABASE_*` local Postgres | *(omit — Heroku uses DATABASE_URL)* |
| Prod DB pull | `PROD_DATABASE_*` optional | *(omit)* |
| Frontend | `VITE_DEV_LOG=true` | *(omit — not used on Heroku build)* |

**Bottom — shared** (same keys and values in both files):

- `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY`
- AI models (minimal set; see below)
- `USE_S3`, `AWS_*`
- B-Stock / SOCKS5 vars as needed

### AI model knobs (slim)

Code in `ecothrift/settings.py` + `apps/core/ai_config.py` supports many `AI_MODEL_<PURPOSE>` vars, but **most fall back** to:

```env
AI_MODEL=grok-4-1-fast              # default for most features
AI_MODEL_FAST=grok-4-1-fast         # high-volume paths
AI_MODEL_INVENTORY_CLEANUP=gemini-2.5-flash   # preprocessing Step 2 only
```

Only add purpose-specific `AI_MODEL_*` lines when one feature needs a different model.

## How Django loads config

- **Local:** `ecothrift/settings.py` reads `.env` from repo root when the file exists.
- **Heroku:** no `.env` file; `settings_production.py` imports base settings; env vars come from Heroku Config Vars / `DATABASE_URL`.

Relevant settings block: `ecothrift/settings.py` — `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY`, `AI_MODEL*`, AWS, B-Stock.

## AI provider routing (unified — llm_router)

**All AI features** route through `apps/core/services/llm_router.py` by model id:

- `grok-*` → xAI (`XAI_API_KEY`, alias `GROK_API_KEY`)
- `gemini-*` → Google (`GOOGLE_API_KEY`, alias `GEMINI_API_KEY`)
- else → Anthropic (`ANTHROPIC_API_KEY`)

`AI_PROVIDER=auto` (default) keeps that inference; setting it to `anthropic` / `xai` /
`google` force-overrides for every call. Every `AI_MODEL_<PURPOSE>` knob therefore
accepts any provider's model id — a missing key fails fast with `LLMConfigError`
(HTTP 503 from API endpoints), never a silent wrong-provider call.

## Related files (outside `env/`)

| Path | Notes |
|------|-------|
| `ecothrift/settings.py` | Loads all env vars |
| `ecothrift/settings_production.py` | Heroku overrides (DATABASE_URL, SSL, CORS) |
| `apps/core/ai_config.py` | `ai_model(purpose, override=…)` |
| `apps/core/services/llm_api_keys.py` | Key resolution from settings (.env only locally) |
| `.gitignore` | `.env`, `.env.*`, `.envprod` all gitignored — no env file is ever committed |
| `.ai/extended/development.md` | **Environment Variables** table — the authoritative key list (there is no example/template env file) |

## Review checklist for Fable

1. **Sync safety** — `lib/sync_to_heroku.py` skip list complete? Any prod-only vars that should never be pushed?
2. **Secret handling** — dry-run masks keys; confirm no logging of raw secrets.
3. **Parity** — `.envprod` top section matches what Heroku actually needs (`DJANGO_SETTINGS_MODULE`, `ALLOWED_HOSTS`, …).
4. **AI config** — document whether to slim `.envprod` to 3 model lines; remove dead `VITE_PUBLIC_*` vars if still present in user files. **`VITE_API_URL` is set on Heroku but read by nothing** (the frontend uses a relative `/api` base) — candidate for `config:unset`.
5. **Universal LLM router** — DONE: every AI call site routes via `apps/core/services/llm_router.py` (`ai_model()` purpose lookup + provider by model id), so `.envprod` model changes work everywhere.
6. **Deploy integration** — should `4_deploy_careful.bat` optionally run sync before/after push? Currently manual.

## History (why this exists)

- User wanted API keys and model knobs in one place (`.env` / `.envprod`), not workspace key files.
- Heroku Config Vars must be set explicitly; `.env` is never deployed with the app.
- Fragment/compose workflow (`dev.header` + `.env.shared`) was tried under `scripts/deploy/env/` then **removed** in favor of editing repo-root `.env` / `.envprod` directly and running one bat to sync prod.
