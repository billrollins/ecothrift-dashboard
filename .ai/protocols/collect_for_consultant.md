<!-- Last updated: 2026-04-09T20:00:00-05:00 -->
# Protocol: Refresh docs and collect consultant handoff files

Run this protocol after a build phase completes (typically before or alongside review_bump). It ensures documentation reflects what was actually built and collects files the Consultant needs into a single directory for easy handoff.

---

## Part A: Update stale documentation

Work through each file below. For each one, read the current version, compare against what is actually in the codebase, and update anything that is out of date. Update the `<!-- Last updated: ... -->` timestamp on every file you change.

### 1. `.ai/initiatives/bstock_auction_intelligence.md`

- Update the current phase section to reflect what was implemented (not just planned).
- Mark completed sub-steps in the acceptance checklist.
- Add any new commands, endpoints, models, or services that shipped.
- Update the "Priority" line at the top if the active phase changed.
- Do NOT archive or move the initiative without explicit user confirmation.

### 2. `.ai/consultant_context.md`

- Update "What is implemented" to cover all shipped phases and sub-phases.
- Add new models, fields, endpoints, commands, services.
- Update the phase summary table.
- Add any new gotchas that consultants should know.
- Keep it dense with pointers to extended docs. Do not duplicate extended doc content verbatim.
- Ask yourself: if a consultant opened this file cold after this release, would they have the full picture? If not, fill the gaps.

### 3. `.ai/extended/backend.md`

- Update the `apps/buying` section with new models, fields, commands, services, and API endpoints.
- Add any new AppSettings keys.
- Update the models table if fields were added to existing models.

### 4. `.ai/extended/bstock.md`

- Update the API surface table with any new endpoints (internal Django endpoints, not B-Stock external endpoints).
- Update operational safety section if new commands or triggers were added.

### 5. `.ai/extended/frontend.md`

- Update if any frontend changes shipped. Skip if no frontend work was done in this phase.

### 6. `.ai/context.md`

- Verify the "Current State" section matches reality.
- Update if anything is stale.

### 7. Root `CHANGELOG.md`

- Verify the latest section matches what shipped. Add entries if work was done but not logged.

---

## Part B: Collect files for consultant handoff

After Part A is complete, copy the following files into `workspace/notes/to_consultant/files-update/`. Create the directory if it does not exist. These are **copies**, not moves. The originals stay in place.

```bash
# Create the output directory
mkdir -p workspace/notes/to_consultant/files-update

# Core context
cp .ai/context.md workspace/notes/to_consultant/files-update/
cp .ai/consultant_context.md workspace/notes/to_consultant/files-update/

# Initiative docs
cp .ai/initiatives/bstock_auction_intelligence.md workspace/notes/to_consultant/files-update/
cp .ai/initiatives/historical_sell_through_analysis.md workspace/notes/to_consultant/files-update/
cp .ai/initiatives/_index.md workspace/notes/to_consultant/files-update/

# Extended docs
cp .ai/extended/backend.md workspace/notes/to_consultant/files-update/
cp .ai/extended/frontend.md workspace/notes/to_consultant/files-update/
cp .ai/extended/bstock.md workspace/notes/to_consultant/files-update/

# Protocols
cp .ai/protocols/review_bump.md workspace/notes/to_consultant/files-update/
cp .ai/protocols/startup.md workspace/notes/to_consultant/files-update/

# Solution designs (if they exist)
cp workspace/notes/from_consultant/phase5_solution_design.md workspace/notes/to_consultant/files-update/ 2>/dev/null || true

# Taxonomy reference
cp workspace/notebooks/category-research/taxonomy_v1.example.json workspace/notes/to_consultant/files-update/ 2>/dev/null || true

# Category research README
cp workspace/notebooks/category-research/README.md workspace/notes/to_consultant/files-update/category_research_README.md 2>/dev/null || true

# Version and changelog
cp .version workspace/notes/to_consultant/files-update/
cp CHANGELOG.md workspace/notes/to_consultant/files-update/
```

After copying, list the directory contents with file sizes so the user can confirm everything is there.

---

## Part C: Report

Summarize what you changed in Part A (which files, what was stale, what you fixed). List any files from Part B that were missing or could not be copied. Flag anything you were unsure about and did not change.
