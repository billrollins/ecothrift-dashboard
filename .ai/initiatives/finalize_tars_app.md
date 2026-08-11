<!-- initiative: slug=finalize-tars-app status=active updated=2026-08-11 -->
<!-- Last updated: 2026-08-11 (restructured to Audit → Design → Code; code phases deferred until design is done) -->

# Initiative: Finalize TARS App

**Status:** **Active** — Stage 1 (Audit)

**Objective:** One excellent, **100% functional MVP** of TARS that Mike and Ashley start using on the floor for real, pushed to production. Not a prototype, not a phase-gated research program — a finished small app.

**Supersedes:** [`tars_restoration_workspace`](./_archived/_pending/tars_restoration_workspace.md) (transactional queue/bench) and [`tars_full_instruction_wizard_guidance`](./_archived/_pending/tars_full_instruction_wizard_guidance.md) (process canon / guardrails). Both are closed to new work. Everything from 0 to 100 lives **here**. Their reference material stays valid: [`standalone_studio_contract.md`](../reference/TARS%20Restoration%20Processing%20App/standalone_studio_contract.md), [`phase_0_process_canon.md`](../reference/TARS%20Restoration%20Processing%20App/phase_0_process_canon.md), [`phase_1_pilot_record.md`](../reference/TARS%20Restoration%20Processing%20App/phase_1_pilot_record.md).

**Routes today:** `/restoration/tars` (standalone Studio), `/inventory/restorations` (Processing TO/FROM hub), `/restoration/parts-requests` (procurement).

---

## Finish line

Mike can run a real item from scan to disposition without asking anyone how the app works; Ashley can hand off an item with complete context; Bill can see the parts he must order and the numbers behind a decision. It runs on the device that is actually at the bench. Nothing on screen is a stub, a duplicate calculation, or a dead end. It is in production and the local database is in sync with it.

---

## Structure: Audit → Design → Code

TARS was built across two prior initiatives and many sessions. Parts of it are live, parts are unreachable code, parts exist only as documented intent, and parts were removed. **Nobody currently has one accurate picture of it, including Bill.** So the initiative does not start with a code plan.

| Stage | What happens | Who drives | Output |
|-------|--------------|------------|--------|
| **1 — Audit** | Every TARS element is listed with its real state. Bill reviews each one: **live** if it is reachable in the app, **docs** if it is legacy, removed, unreachable, or never built. Bill records a verdict on each. | Bill reviews, AI compiles | Completed audit register |
| **2 — Design** | Armed with the audit and firsthand use, Bill and AI discuss and agree the final app. Written down before any code. | Bill and AI together | Design document |
| **3 — Code** | Coding phases are written **from the design**, then executed. **This section stays empty until Stage 2 is finished.** | AI proposes, Bill approves | Shipped app |

**Rule: no coding phases are written before Stage 2 is complete.** Any gap, defect, or idea surfaced during Audit is recorded as a finding, not as a plan.

---

## Stage 1 — Audit

**Goal:** One accurate, reviewed inventory of everything TARS is, was, or was meant to be — with Bill's verdict on each element.

**Register:** [`.ai/reference/TARS Restoration Processing App/audit_register.md`](../reference/TARS%20Restoration%20Processing%20App/audit_register.md)

### How elements are reviewed

| Element state | Review method |
|---------------|---------------|
| **Live & reachable** | Bill opens it in the app and uses it. Firsthand experience is the point. |
| **Live but unreachable** (code exists, nothing routes to it) | AI describes what it did; Bill decides whether that capability is still wanted. |
| **Documented only** (planned, never built) | Read the doc; Bill decides if it still matters. |
| **Removed** (deliberately deleted or replaced) | Read the record; Bill confirms it should stay gone. |

### What Bill fills in per element

| Field | Values |
|-------|--------|
| **Verdict** | Keep as-is / Keep with changes / Cut / Undecided |
| **MVP** | Must-have / Nice-to-have / Not MVP |
| **Notes** | What is wrong with it, what it should do instead, who uses it |

### Audit checklist

- [ ] Register seeded with every element and its verified state (AI)
- [ ] Live walkthrough of each reachable surface with Bill
- [ ] Doc review of unreachable, removed, and never-built elements
- [ ] Verdict + MVP + notes recorded on every row
- [ ] Findings (defects, surprises) captured as observations, not solutions
- [ ] Bill confirms the register is complete and accurate

**Exit:** every row has a verdict. Nothing about TARS is unknown or in dispute.

---

## Stage 2 — Design

**Goal:** Agree and document what the finished TARS app is, before writing code phases.

**Design document:** to be created at the start of this stage.

### Inputs

- Completed audit register
- Bill's firsthand experience from the Stage 1 walkthrough
- Existing reference material: Studio contract, process canon, pilot record

### What the design must settle

Recorded here as **open questions**, not options. Answers come from the Stage 1 walkthrough and the Stage 2 discussion.

- What is the finished app, described end to end: who touches it, on what device, in what order?
- Which surfaces exist, and what is on each one?
- What does the app compute, and where does the truth live?
- What can Bill maintain without a developer, and what is fixed?
- What is deliberately **not** in the MVP?
- What does "done" look like for each part, so the code phases are testable?

### Design checklist

- [ ] Design document created
- [ ] Every "Keep with changes" and "Cut" verdict from the audit is reflected
- [ ] Every open question above is answered in writing
- [ ] Bill signs off on the design
- [ ] Only then: Stage 3 phases are written into this file

**Exit:** a written design Bill agrees with, detailed enough to cut into testable coding blocks.

---

## Stage 3 — Code

**Phases to be written after Stage 2 sign-off. Do not populate this section early.**

Each phase will be a digestible, independently testable block sized to finish in one sitting, running the same full cycle:

1. **Design detail** — the specific behavior for this block
2. **Plan** — file-level plan, Bill approves scope before code
3. **Code** — backend, then frontend
4. **Test** — Django tests + Vitest + `npm run build` green
5. **Walkthrough** — Bill verifies against the phase acceptance list
6. **Commit** — [`review.0.Bump.md`](../protocols/review.0.Bump.md) (semver + `CHANGELOG`)
7. **Push to prod** — [`code.9.Push.md`](../protocols/code.9.Push.md)
8. **Pull prod → local** — `scripts/deploy/0_pull_prod_to_local.bat`, so migrations never drift

A phase is not done until step 8. Phase ordering is Bill's call; the cycle does not change.

*(phases: TBD after Stage 2)*

---

## Initiative acceptance

- [ ] Audit register complete, every element reviewed and given a verdict
- [ ] Design document written and signed off
- [ ] All coding phases from the design are shipped
- [ ] The full item lifecycle works on a routed surface, on the bench device
- [ ] No unrouted components, no mock or fallback data, no modeled-but-unreachable states
- [ ] `.ai/extended/` has an accurate TARS doc
- [ ] Shipped to production, Mike and Ashley are using it
- [ ] Bill signs off

---

## Sessions

Logged for documentation only. No owner input required.

*(none yet)*

---

## See also

- Audit register: [`audit_register.md`](../reference/TARS%20Restoration%20Processing%20App/audit_register.md)
- Studio contract: [`standalone_studio_contract.md`](../reference/TARS%20Restoration%20Processing%20App/standalone_studio_contract.md)
- Process canon: [`phase_0_process_canon.md`](../reference/TARS%20Restoration%20Processing%20App/phase_0_process_canon.md)
- Pilot record: [`phase_1_pilot_record.md`](../reference/TARS%20Restoration%20Processing%20App/phase_1_pilot_record.md)
- Superseded: [`tars_restoration_workspace`](./_archived/_pending/tars_restoration_workspace.md), [`tars_full_instruction_wizard_guidance`](./_archived/_pending/tars_full_instruction_wizard_guidance.md)
- Index: [`_index.md`](./_index.md) · Context: [`.ai/context.md`](../context.md)
