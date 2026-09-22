<!-- initiative: slug=ai-settings-floorplan status=active updated=2026-09-22 -->
<!-- Last updated: 2026-09-22 (opened) -->
# Initiative: AI settings and floorplan AI

**Status:** **Active** - Phase 1 built and verified on branch `ai-settings-floorplan`; awaiting owner review and merge.

**Objective:** Superusers choose AI models and effort per action in Settings > AI. The floorplan editor gets two AI tools that preview and wait for Apply.

**Compass:** this file is not the compass.

## Finish line

- Settings > AI: model catalog (add, edit, archive, unarchive, check for new) and per-action model + effort.
- `ai_model()` order: override, Settings assignment, `.env`, `AI_MODEL`. Effort mapped per provider; rejected optional params retried once without.
- Floorplan: Build SVG with AI (Super Admin) and Adjust with AI (Manager+), both preview then Apply; nothing saves by itself.

## Out of scope

- OpenAI provider (Astra, `gpt-6-astra`), throttling on the floorplan AI endpoints, folding the INVENTORY_CLEANUP model list into Settings.

## Phases

### Phase 1 - build (branch `ai-settings-floorplan`)
- [x] Backend: models, seed, router, Settings API, floorplan endpoints, tests green.
- [x] Frontend: AI tab, two floorplan dialogs, tests and tsc green.
- [x] Docs updated.

### Phase 2 - owner review and ship
- Owner merges `ai-settings-floorplan` and releases via `ship-push-git.md`.

## Acceptance

- Scoped and full pytest match baseline plus new passing tests; vitest failing set unchanged; `tsc` clean.

## Record

**2026-09-22 - Opened.** Built from the plan `ai_settings_floorplan_4d0dfa53.plan.md`.

**2026-09-22 - Phase 1 built.** Scoped pytest 209 passed (163 + 46 new). Full pytest: failing set identical to main except one timing flake (`test_restoration_history_forget` superseded count; passes alone). Frontend: tsc clean; vitest 1099 passed, same 6 failing files as main; 14 new tests incl. render tests for AiPanel, BuildSvgDialog, AdjustPlanDialog. Opus 5.5 handled up front (no temperature, tool_choice auto). Astra not added (no OpenAI provider).

## See also

- `apps/core/ai_config.py`, `apps/core/services/llm_router.py`, `apps/core/services/ai_catalog.py`, `apps/floorplan/ai.py`
