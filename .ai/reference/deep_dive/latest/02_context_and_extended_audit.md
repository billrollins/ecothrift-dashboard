# Context And Extended Audit

## Executive Summary

- **Primary steering:** `.ai/context.md` remains the coding-agent entrypoint; `.ai/consultant_context.md` provides dense cross-domain narrative + mirrored extended TOC.
- **Extended library:** **15** domain files under `.ai/extended/` — tables in **`context.md`** and **`consultant_context.md`** list the same set (auth, backend, bstock, cash-management, consignment, consultant_handoff, databases, development, frontend, inventory-pipeline, pos-system, print-server, retag-operations, ux-spec, vpn-socks5).
- **Drift risk:** Low for extended TOC parity; **Medium** for narrative freshness inside each extended file when `[Unreleased]` is moving quickly (inventory/processing).
- **Confidence:** **High** on TOC parity; **Medium** on per-file staleness without reading every extended doc end-to-end this run.

## Context Files

| File | Audience | Freshness signal | Finding |
|------|----------|-------------------|---------|
| `.ai/context.md` | Coding agents | Header comment **2026-05-02** in sampled read | Aligns with Final Review visual rebuild notes + Item Processor |
| `.ai/consultant_context.md` | Consultants / one-file handoff | Extended TOC **2026-era** | Matches `context.md` TOC rows |

## Extended Docs — Inventory vs Protocol Focus

Files most relevant to **review.9.Deep** preprocessing trace (should be loaded when touching those flows):

| File | Relevance |
|------|-----------|
| `inventory-pipeline.md` | PO flow, preprocessing stages, manifest templates |
| `backend.md` | Serializers, caching, management commands inventory |
| `frontend.md` | Pages/hooks for inventory and buying |
| `ux-spec.md` | Final Review density, tolerance bands, stepper language |
| `development.md` | Local scripts, Heroku scheduler parity, env keys |

## Consultant Context Coverage

Sampled sections reference:

- Active initiative **`order_processing_pipeline_rebuild`** and Final Review mockup pointers (`fix_this.md`, directive/plan docs under `.ai/reference/`).
- B-Stock ops posture (scheduler commands, valuation, SOCKS5) with canonical **`bstock.md`** + `scraper.py`.

No contradiction detected between **`context.md`** and **`consultant_context.md`** extended TOC rows in this audit pass.

## README Alignment

Root **`README.md`** advertises React **18**, TS, MUI **v7**, Vite, TanStack Query, Django — consistent with **`context.md`** and **`CHANGELOG`** themes.

## Protocols Directory

`.ai/protocols/` includes startup, checkpoint, bump, push, deep review, close — matches **`context.md`** Quick Reference list (`code.0.Startup`, `session.1.Checkpoint`, `review.0.Bump`, `code.9.Push`, `review.9.Deep`, `session.9.Close`, plus `session.0.Create`, `code.1.Bearing`).

## Gaps / Risks

| Gap | Evidence | Recommendation |
|-----|----------|----------------|
| Narrative lag inside extended bodies | Large `[Unreleased]` in `CHANGELOG` while initiatives mention Session 11+ | After major merges, run **`review.0.Bump`** or targeted extended edits |
| Reference sprawl under `.ai/reference/` | Multiple Final Review planning docs | Already partially governed by directive vs plan precedence in `CHANGELOG`; keep pointer docs short |

## Notes For `PLAN.md`

- **`CTX-***`: Optional pass — sync **`inventory-pipeline.md`** / **`frontend.md`** bullets with whatever ships when `[Unreleased]` is cut (source: `CHANGELOG` vs extended).
