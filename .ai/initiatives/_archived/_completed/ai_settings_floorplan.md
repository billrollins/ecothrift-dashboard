<!-- initiative: slug=ai-settings-floorplan status=completed updated=2026-09-23 -->
<!-- Archived 2026-09-23: disposition=completed merged into main (ecc60707). Ships with the unreleased B-Stock release. Owner closed it. -->
<!-- Last updated: 2026-09-23 (moved to _completed) -->
# Initiative: AI settings and floorplan AI

**Status:** **Completed** (2026-09-23) — merged into `main` (`ecc60707`). Settings > AI and floorplan Build SVG / Adjust with AI. Ships with the unreleased B-Stock release. After that Heroku release has run `core/0006`, delete `AI_MODEL_<PURPOSE>` / `AI_MODEL_FAST` from `.env` / `.envprod` and `heroku config:unset` them. Not before, or `0006` has nothing to copy.

**Objective:** Superusers choose AI models and effort per action in Settings > AI. The floorplan editor gets two AI tools that preview and wait for Apply.

**Compass:** retired. [`bstock_daily_buying`](../../bstock_daily_buying.md) is the compass.

## Finish line

- Settings > AI: model catalog (add, edit, archive, unarchive, check for new) and per-action model + effort.
- `ai_model()` order: override, Settings assignment, fallback (`AI_MODEL`, image fallback for LABEL_IMAGE). Settings > AI is the only home for per-feature models; `core/0006` copied the old `AI_MODEL_<PURPOSE>` env values in. Effort mapped per provider; rejected optional params retried once without.
- Floorplan: Build SVG with AI (Super Admin) and Adjust with AI (Manager+), both preview then Apply; nothing saves by itself.

## Out of scope

- OpenAI provider (Astra, `gpt-6-astra`), throttling on the floorplan AI endpoints, folding the INVENTORY_CLEANUP model list into Settings.

## Phases

### Phase 1 - build (branch `ai-settings-floorplan`)
- [x] Backend: models, seed, router, Settings API, floorplan endpoints, tests green.
- [x] Frontend: AI tab, two floorplan dialogs, tests and tsc green.
- [x] Docs updated.

### Phase 2 - owner review and ship
- [x] Merged into `main` (`ecc60707`); ships in the same MINOR release as B-Stock daily buying Phase 1.
- [x] Owner closed it (2026-09-23). Release is the ship protocols, with B-Stock Phase 1.
- [x] Post-deploy env unset is written in Status. Do it only after Heroku has run `core/0006`.
- [x] Removed worktree `C:\Coding\ecothrift-ai-settings` and deleted branch `ai-settings-floorplan` (2026-09-23).

## Acceptance

- Scoped and full pytest match baseline plus new passing tests; vitest failing set unchanged; `tsc` clean.

## Record

**2026-09-22 - Opened.** Built from the plan `ai_settings_floorplan_4d0dfa53.plan.md`.

**2026-09-22 - Phase 1 built.** Scoped pytest 209 passed (163 + 46 new). Full pytest: failing set identical to main except one timing flake (`test_restoration_history_forget` superseded count; passes alone). Frontend: tsc clean; vitest 1099 passed, same 6 failing files as main; 14 new tests incl. render tests for AiPanel, BuildSvgDialog, AdjustPlanDialog. Opus 5.5 handled up front (no temperature, tool_choice auto). Astra not added (no OpenAI provider).

**2026-09-23 - Merged into main.** `ecc60707` on top of B-Stock daily buying Phase 1. Conflicts were doc headers plus `ai_key_mapping.py`, which keeps `effort=ai_effort('KEY_MAPPING')` and main's `timeout=60` (the background manifest pull needs a bounded call). Stale `AI_MODEL_<PURPOSE>` wording left in buying docstrings and the unknown-manifest message now points at Settings > AI. Full-suite verification is queued as T-001 (`.ai/comm/test-requests.md`).

**2026-09-23 - Completed.** Owner closed it. Built and merged; the release rides with B-Stock Phase 1. Env unset stays a ship follow-up, in Status.

**2026-09-23 - Env retired.** Per-feature `AI_MODEL_*` / `AI_MODEL_FAST` removed from settings.py; migration `core/0006_ai_models_from_env` copies each environment's values into Settings > AI (skipped under tests) and adds INVENTORY_CLEANUP as an action. After deploy: delete those lines from `.env` / `.envprod` and `heroku config:unset` them.

## See also

- `apps/core/ai_config.py`, `apps/core/services/llm_router.py`, `apps/core/services/ai_catalog.py`, `apps/floorplan/ai.py`
