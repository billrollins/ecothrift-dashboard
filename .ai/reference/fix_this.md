# `fix_this` — Final Review visual rebuild (pointer)

**Canonical spec:** **[`final_review_visual_rebuild_directive.md`](./final_review_visual_rebuild_directive.md)**

Use that file for:

- **§11** — defect checklist (all ten must be gone before review).
- **§13** — implementation order (steps 1–4 are the minimum bar before resurfacing for visual review).
- **§14** — done definition.

**Execution plan (how it maps to code):** [`final_review_visual_pass_plan.md`](./final_review_visual_pass_plan.md)

**Design / behavior reference:** [`consult_design_final_review.md`](./consult_design_final_review.md) (where the directive does not override).

---

## Why this file exists

So reviewers and coders share **one short path** (`fix_this.md`). Fixing data contradictions alone **does not** satisfy scope: the **visual rebuild** in the directive is mandatory. Silent non-delivery is not acceptable; if a step is unclear or blocked, raise a **specific** question on that step.
