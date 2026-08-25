<!-- initiative: slug=tars-full-instruction-wizard-guidance status=pending updated=2026-07-21 -->
<!-- Archived 2026-07-21: disposition=pending paused off main index (Phase 1.5 Studio shipped; park for v2.50 Deliveries release; resume owner/Mike floor validation then Phase 2) -->
<!-- Last updated: 2026-07-21 (parked → _pending/; stabilize tests for release) -->

# Initiative: TARS Decision Guardrails / Worksheet / Guidance App

**Status:** **Superseded — closed to new work.** All remaining TARS scope now lives in the active initiative [`finalize_tars_app`](../_completed/finalize_tars_app.md). Do not resume this file; read it for history and for the process canon / guardrail reasoning only. Phase 0–1 + standalone Studio shipped.

**Purpose:** Establish the full TARS operating process and encode it as an integrated **guardrail / worksheet / reusable decision system** so Processing and Restoration staff save consistent work, tests, evaluations, rules of thumb, and decisions—not a separate library of formal documents.

**Planning rule:** This document fixes the **why, boundaries, outcomes, guardrails, and major phases**. It intentionally does **not** pre-select every UX or technical solution. Each phase begins with a planning session that resolves the choices needed for that phase, writes acceptance criteria, confirms scope and risks, and updates this document before implementation. Later-phase choices stay open until evidence from earlier phases exists.

**Related (do not conflate):** [`tars_restoration_workspace`](./tars_restoration_workspace.md) owns the transactional queue/bench product. This initiative owns the **process, guidance, content operations, and improvement system** layered onto that product. See [Boundary with the parked workspace](#boundary-with-the-parked-workspace).

**Reference material:** [`.ai/reference/tars/`](../../../reference/tars/). The prototype HTML was removed 2026-08-13; recover from git history if needed.

---

## Current next (owner direction — 2026-07-13)

| Surface | Owner grade | Direction |
|---------|-------------|-----------|
| **Processing Restorations hub** (`/inventory/restorations`) | **Overall pretty good** | Keep; polish only as needed. TO setup + FROM desk (Worked/Untouched) replace Restoration Returns / inline grade blocking. |
| **Standalone TARS Studio** (`/restoration/tars`) | **Implementation complete — owner floor grade pending** | Full-screen new-tab work app: one header, one Bench item, Item State, focused actions, durable chronological log, valuation loop, and prominent labor controls. Iterate from live owner/Mike feedback before Phase 2. |

**Sequencing:** Do **not** start Phase 2 Bill-managed catalogs until the Decision Wizard UX pass is planned and accepted (or Bill explicitly reorders). Floor trust depends on the wizard feeling excellent, not merely correct.

---

## Finish line (initiative)

TARS no longer depends on tribal knowledge:

1. **Canonical process** — Processing staff, restoration technicians, leads, and owners share a clear, approved map of how work enters, moves through, pauses, escalates, exits, returns, and improves.
2. **Structured decisions** — staff use an in-app worksheet/template that captures the right tests, evaluation steps, grade logic, rules of thumb, decisions, work, and reasons for their role and item context.
3. **Controlled economic execution** — guardrails distinguish tested/untested, working/broken, as-is, repair, and salvage outcomes; they support margin/throughput decisions without duplicating the transactional TARS system.
4. **Reusable guardrails** — Bill can build and maintain structured test types, grade scales, decision rules, steps/phases, evaluation/salvage methods, and other templates as operations change.
5. **Closed improvement loop** — staff feedback and observed process gaps reach a durable intake, are triaged and decided, become process/content/product changes, and close with communication to affected staff.
6. **Measured maturity** — owners can tell whether guidance is used, where staff still get stuck, whether updates improve outcomes, and which TARS investments should come next.

The initiative is complete only when the process, product, ownership model, rollout, and ongoing operating cadence all work together. A static SOP/document library does not meet the finish line; the structure must participate in the work and preserve decisions.

---

## Why this exists

TARS is not only a queue or bench UI. It is an evolving operating system for restoration work. The live product records transactions, but the organization also needs to preserve and improve the judgment around those transactions:

- what staff should do and why;
- which steps change by role, item, grade scale, risk, or TARS action;
- when to proceed, pause, ask, order parts, apply a saved rule/template, or invoke a safety hold;
- who may change the process and how that change reaches the floor;
- how comments, exceptions, mistakes, and better ideas become durable improvements.

Without a process canon and structured in-app guardrails, the bench can continue to function while judgment remains tribal, similar items receive inconsistent decisions, and work cannot compound into reusable operating knowledge.

---

## Shipped baseline — design from what exists

This is a **brownfield** initiative. Phase planning must verify current behavior, then extend it rather than rebuilding a hypothetical TARS product.

### Live workflow and surfaces

- **Processing handoff and Restorations desk:** items dispatched to restoration create a `RestorationJob`; Processing completes grade scale/values + handoff on **`/inventory/restorations`** (TO lane), then Mike uses TARS Studio Inbox / bench. Legacy `/restoration/queue` nav is removed; route may still redirect into Studio.
- **Live bench / Studio:** `/restoration/tars` is a standalone staff app outside dashboard chrome. It opens in a new tab and provides full-width Inbox / one-item Bench / Pending lanes, URL deep links, one integrated header, always-visible Item State, focused actions, and a chronological Restoration log.
- **Execution record:** Test / Assemble / Repair / Salvage are attributed timeline events with notes, result, and labor minutes. Separate verb sub-tabs from the early prototype are **not** the current product direction.
- **Pending and escalation:** existing reasons include parts/research/approval needs, `research_sop`, and `safety_hold`; these are natural guardrail and decision-record integration points.
- **Parts:** technicians can identify/request parts from the bench; in the current operating model **Bill orders parts**, while Mike owns Restoration execution.
- **Completion and loopback:** completion records final grade, work, costs, and disposition; items may move to Processing, Storage, Salvage, or Online Sales, and Processing handles returns on the **Restorations** hub FROM lane (`/inventory/restorations?lane=from`).
- **Operational integrations:** restoration timers interact with HR clock/break behavior, and dashboard metrics already count job states and TARS action types.

### Existing technical and policy facts

- `RestorationJob` and its APIs are the transactional source of truth; guidance must not create a competing job lifecycle.
- Current restoration access is broadly staff-oriented, while selected management actions use Manager/Admin controls. Bill is the initial superuser/builder and guardrail author; later delegation remains a Phase 2 decision.
- Existing data provides a starting measurement baseline, not proof that every desired maturity metric is already reliable.
- The reference prototype includes a profit decision engine and Owner time-premium steering. Those concepts are not automatically in scope for this guidance initiative.

### Known baseline gaps or stale assumptions

- The parked initiative's old “complete → item location” item is already substantially shipped.
- Per-verb detail panels were superseded by the unified workbench. Reintroducing them requires an explicit product decision, not an assumption.
- Photos and Owner steering remain transactional-product possibilities, not guidance deliverables by default.

---

## Scope

### In scope

- Map the **as-is** and approved **as-intended** TARS process across Processing, Restoration, Manager/Lead, and Owner touchpoints.
- Define terms, roles, decisions, exceptions, handoffs, safety/escalation paths, and exits.
- Design and deliver in-app worksheets, reusable templates, decision rules, test types, evaluation/salvage methods, contextual prompts, and saved work/decision records where they solve validated needs.
- Connect guidance to real work at appropriate moments without duplicating transactional state.
- Define process/guardrail ownership, permissions, change control, version history, communication, and rollback.
- Support Mike's Restoration decisions and Ashley's Processing handoffs first; preserve a path for additional processors and future Restoration staff.
- Capture feedback and improvement requests in a form that can be triaged and closed.
- Establish rollout, support, adoption, quality, and improvement measures.
- Feed genuine transactional feature gaps to the parked workspace or a separately approved implementation scope.

### Out of scope unless a phase plan explicitly brings it in

- Another broad rewrite of the accepted standalone `/restoration/tars` architecture without new owner evidence.
- Treating the early reference prototype as a requirement to restore verb tabs, profit cards, or Owner steering.
- A company-wide LMS, generic SOP/document platform, or replacement for HR training.
- Encoding every possible item/category/verb path before validating a narrow useful path.
- Making AI the process authority. AI assistance may be explored, but human approval is required for operational guidance.
- Automatically turning every instruction into a hard application gate.
- Solving unrelated restoration transaction gaps merely because feedback identifies them.

---

## Product and process principles

1. **Floor truth before software** — observe and validate how work actually happens before encoding the intended process.
2. **One transactional truth** — `RestorationJob` and existing actions remain authoritative; guidance may explain, prefill, warn, or gate but must not fork the workflow.
3. **Guidance at the moment of need** — favor help in the work context, with deeper reference available when needed.
4. **Layer, do not overwhelm** — new staff may need detailed sequencing; experienced staff need fast reminders, exceptions, and search.
5. **Label authority clearly** — every meaningful instruction should be recognizable as policy, safety requirement, recommendation, example, or optional technique.
6. **Start narrow, prove, then expand** — one complete high-value journey is better than shallow coverage of every verb.
7. **Editable with governance** — easier updates must not mean unreviewed changes; ownership, effective version, and rollback matter.
8. **Throughput and margin first, with minimum stop-outs** — test only when information can change the disposition; allow explicit untested/as-is/broken/salvage outcomes; mandatory legal, handling, and truthful-disclosure constraints still override margin.
9. **Close the feedback loop** — collecting comments without ownership, status, decisions, and communication is not continuous improvement.
10. **Measure only what can drive a decision** — use existing data first; add instrumentation when a phase identifies a specific decision it will support.
11. **Phase planning owns solution detail** — this initiative sets outcome constraints; each phase selects the simplest defensible implementation with current evidence.
12. **Economic comparison** — when paths are otherwise valid, rank them primarily by expected contribution margin per labor minute, adjusted for workload/backlog; do not spend labor collecting evidence that cannot change the decision.

---

## Current people and operating model

| Person / role | Need this initiative must address |
|---------------|-----------------------------------|
| **Bill Rollins — Owner/CEO, superuser, builder** | Designs the system and guardrails, sets business/policy direction, orders parts, reviews consequential exceptions, and needs saved work/decisions to improve the model. |
| **Mike — Lead Restoration; currently the only Restoration performer** | Uses the guardrail/worksheet to evaluate, test, decide, record work, hold/escalate, salvage, and complete items consistently without inventing the decision structure each time. |
| **Ashley — Lead Processor** | Uses upstream guardrails for Restoration routing, grade scales/values, required context, and returned-item handling; helps keep her Processing team consistent. |
| **Other Processing staff** | Follow Ashley's Processing structure and provide complete, comparable handoffs to Mike. |
| **Future Restoration staff** | Reuse the same decision framework so similar evidence produces similar decisions instead of person-dependent judgment. |

**Initial authority:** Bill + Mike jointly approve the TARS process. Mike owns day-to-day Restoration use/support; Bill owns product/guardrail design, consequential changes, and parts ordering. Ashley owns Processing practice under the agreed handoff rules.

---

## Process spine to validate in Phase 0

This is a discovery hypothesis, not a formal SOP:

1. **Qualify and send** — Processing determines that Restoration is appropriate and supplies grade/value context.
2. **Receive and prepare** — Restoration scans the item, confirms identity/context, and performs the minimum handling/compliance stop-out screen.
3. **Assess** — inspect, test enough to understand condition, choose/evaluate grade direction, and identify uncertainty.
4. **Plan** — use the worksheet/guardrails to choose the next TARS action, expected outcome, required tests/parts/tools/time, and escalation needs.
5. **Execute and record** — Test / Assemble / Repair / Salvage or another approved action; save material evidence, work, and decisions without excessive burden.
6. **Pause or escalate** — parts, Bill approval, missing decision guidance/research, safety hold, blocked item, or other explicit reason.
7. **Complete and dispatch** — confirm final grade, notes/costs, disposition, labels/handling, and downstream ownership.
8. **Return or rework** — handle rejected, incomplete, misrouted, or newly discovered work without losing history.
9. **Learn and improve** — capture ambiguity, failure, workaround, idea, or missing instruction and close it through the improvement loop.

Phase 0 may rename, combine, reorder, or branch these steps after observation and owner approval.

---

## Required capability areas

### Process canon

- Approved process map, vocabulary, role boundaries, handoffs, decisions, exceptions, and exits.
- Clear distinction among policy, legal/handling/disclosure stop-out, application gate, recommendation, and local technique.
- Traceability from guidance back to a process step and owner.

### Structured decisions and work

- A contextual worksheet/template that helps Ashley provide comparable inputs and Mike make/save comparable evaluations and decisions.
- Reusable test types, grade scales, rules of thumb, instructions, steps/phases, evaluation methods, salvage methods, and decision criteria.
- Saved item-level evidence, selected rules/templates, decisions, reasons, work performed, and outcome.
- Universal ways to think about work so different people can reach similar decisions from similar evidence.
- Explicit handling of unknown/untested status, blocked work, missing decision guidance, and mandatory stop-outs.

### Execute integration

- Guidance can coexist with live scans, evaluation, work logs, parts, holds, timers, completion, dispositions, and returns.
- Any proposed hard gate has an owner-approved reason, escape/escalation path, validation rules, and failure behavior.
- Product changes beyond guidance are assigned explicitly to this initiative, the parked workspace, or another initiative before implementation.

### Guardrail/template operations and governance

- Bill initially owns structure and consequential changes; Mike owns Restoration feedback/use; Ashley owns Processing feedback/use.
- Reusable rules/templates can evolve without rewriting each item's saved work or silently changing prior decisions.
- Version/audit history and rollback sufficient to answer which guardrails produced a decision at a given time.
- Change communication and acknowledgement proportionate to impact; formal document publishing is not the product center.

### Continuous improvement

- Durable intake for staff comments, bugs, process gaps, missing guardrails, inconsistent decisions, safety issues, and tool requests.
- Triage, priority, owner, decision, status, implementation destination, and closure communication.
- A recurring review cadence that can update process, rules/templates, product behavior, coaching, or policy.

### Measurement and rollout

- Baseline before intervention, explicit target or learning question, and accountable owner.
- Floor validation with representative staff before broad rollout.
- Adoption/support plan, accessibility/usability checks, and a way to detect stale or harmful guidance.

---

## Boundary with the parked workspace

| Active guidance initiative | Parked transactional workspace |
|----------------------------|--------------------------------|
| Defines the reusable decision structure, guardrails, worksheets/templates, roles, and improvement method. | Owns what queue/bench transactions and job state can do. |
| Process map, evaluation/test/decision models, reusable rules, saved decision context, feedback, rollout, and maturity measures. | Job lifecycle, workstation interactions, parts/photos, completion/disposition mechanics, steering engine, and API behavior. |
| May integrate structured fields, prompts, recommendations, calculations, warnings, or approved gates into live surfaces. | Supplies the transactional source of truth and implements separately approved bench capabilities. |

**Working boundary:** keep the initiatives separate. Do not reactivate or merge [`tars_restoration_workspace`](./tars_restoration_workspace.md) automatically.

At each phase plan:

1. Classify proposed work as **process/content**, **guidance integration**, or **transactional capability**.
2. Keep process/content and ordinary guidance integration here.
3. If a transactional capability is required, either make the dependency explicit and reactivate the parked initiative with owner approval, or record a clearly approved cross-initiative slice.
4. Do not rebuild removed verb panels or already shipped disposition behavior from stale notes.

---

## Phases

The initiative has **four large phases**. A phase may span multiple implementation sessions. Phase plans may refine deliverables and later phases, but they must preserve the initiative finish line and boundaries unless the owner explicitly changes them.

| Phase | Goal | Status |
|-------|------|--------|
| **0 — Process canon & product direction** | Agree on how TARS works, who owns it, what problem the first guidance slice solves, and how it fits the live product. | **Complete — 2026-07-10** |
| **1 — Structured decision-work MVP** | Deliver one end-to-end Ashley-to-Mike worksheet/guardrail journey and validate representative behavior. | **Complete — 2026-07-10** (logic retained inside standalone Studio) |
| **1.5 — Standalone Studio UX A+** | Replace the rejected Guided decision experience with a focused full-screen TARS work app while preserving the guardrail contracts. | **Implementation complete — owner floor validation / iteration next** |
| **2 — Managed guardrail system & rollout** | Expand useful rules/templates and let Bill safely maintain their structure and versions. | **Blocked on 1.5** (unless Bill reorders) |
| **3 — Continuous improvement & maturity** | Run a durable feedback-to-change loop and measure whether TARS is getting better. | Awaiting Phase 2 |

### Phase 1.5 — Standalone Studio UX A+ (implementation complete; validation next)

**Goal:** Take the live Guided decision experience from an owner **D/F** to **A+** without throwing away Phase 1 contracts (handoff, stop-outs, tests, paths, economics, saved decision).

**Owner verdict (2026-07-13):** Restorations Processing Hub is **overall pretty good**. The TARS Wizard is **not** — “so many things I hate.” UX pass is the priority before catalog/editor work.

**Implemented outcome:**

- Standalone, high-contrast Studio modeled on Blog Studio's window ownership.
- One integrated header and one technician-owned Bench item; no dashboard chrome, nested item rail, or persistent tool shelf.
- Always-visible Item State, one focused action surface, and a durable attributed Restoration log.
- Prominent labor control with meaningful-action auto-start, HR synchronization, and five-minute idle confirmation.
- Same autosave / decisionWork / economics / stop-out behavior retained behind the new information architecture.
- Explicit owner/floor acceptance remains the exit gate.

**Exit criteria:**

- Bill grades the wizard UX **A+** (or records remaining A-level nits with an explicit ship decision).
- Phase 1 automated contracts and completion gates still pass.
- Phase 2 planning may begin.

**Validation decides:** remaining critique list from Bill/Mike; density and language refinements; whether the accepted Studio is ready to unblock Phase 2 catalogs.

### Phase 0 — Process canon & product direction

**Goal:** Establish an owner-approved, cross-role TARS process and enough product direction to choose a focused MVP without prematurely fixing the final architecture.

**Outcomes:**

- Observed **as-is** and approved **as-intended** process maps spanning send, queue, bench, holds/parts, completion/disposition, returns/rework, and improvement.
- Shared vocabulary for TARS actions, grades, tested/untested condition, decisions, states, exceptions, and escalation.
- Matrix of policy vs recommendation vs warning vs hard gate, including existing application gates.
- Named process/guardrail owner, approver, operational support path, and expected review cadence.
- Role/needs findings for Bill, Mike, Ashley, other processors, and future Restoration staff.
- Gap register separating process ambiguity, missing guardrail/decision structure, coaching need, reusable-template problem, and transactional product gap.
- Baseline of available operational data and the few questions the MVP should help answer.
- Product direction and one end-to-end MVP journey selected for Phase 1.

**Exit criteria:**

- Owner and representative floor users approve the process spine or record explicit unresolved exceptions.
- Every critical step has an owner and escalation/stop-out path.
- The Phase 1 user, journey, context, finish line, acceptance tests, and out-of-scope list are written.
- Transactional dependencies are assigned rather than silently absorbed.

**Phase planning decides:** participants and observation method; process-map format; exact role boundaries; selected Mike/Ashley journey; inside-bench vs adjacent entry point; discovery artifacts; which decisions must be owner-approved.

**Phase 0 result:** Approved [`process canon`](../../../reference/tars/phase_0_process_canon.md). Discovery workbook removed 2026-08-13.

### Phase 1 — Structured decision-work MVP

**Goal:** Deliver and validate the smallest complete in-app worksheet/guardrail experience for one linked Ashley-to-Mike TARS journey with saved, comparable evidence and materially more consistent decisions.

**Result (2026-07-10):** **Complete.** The versioned Processing handoff, integrated Guided decision workbench, authoritative contribution-per-labor-minute engine, ordinary override rules, mandatory stop-outs, completion integration, and backward-compatible tests are implemented. Bill accepted the functioning MVP based on automated representative-item coverage; Ashley/Mike live use feeds continuous improvement rather than blocking functionality. See [`phase_1_pilot_record.md`](../../../reference/tars/phase_1_pilot_record.md).

**Outcomes:**

- Structured inputs, reusable tests/rules, and saved decisions at the chosen journey's meaningful handoff, evaluation, action, hold/escalation, and completion points.
- Enough contextual direction to answer “what evidence do I need, how should I reason, what do I record, and when should I stop or ask?”
- Clear treatment of policy, disclosure/compliance stop-outs, recommendation, and optional technique.
- Integration with live TARS context without duplicating job state or breaking existing workflow.
- Lightweight feedback and instrumentation sufficient to learn from real use after MVP acceptance.
- Automated representative-item coverage plus a recorded path for real-use findings and fixes.

**Exit criteria:**

- The complete selected journey is covered by representative automated scenarios and remains usable without a staff-signoff wait state.
- Bill confirms the MVP expresses the approved product direction; Ashley/Mike use becomes continuous-improvement evidence.
- Existing TARS transactions, permissions, and failure paths remain intact.
- Automated acceptance, truthful-classification/mandatory-stop, support, compatibility, and rollback paths pass.
- Phase 2 starts with a prioritized candidate backlog that is revised from observed use rather than delayed for pre-use certainty.

**Phase planning decides:** exact worksheet/template structure; route/surface; reusable versus item-instance fields; calculations and recommendations; saved evidence/decision shape; prompts versus gates; feedback affordance; pilot size and measures.

#### Approved Phase 1 handoff

**Users and authority:**

- **Ashley** supplies the Processing handoff and reports friction/corrections through continuous improvement.
- **Mike** is the primary Restoration worksheet/decision user.
- **Bill** builds/reviews the reusable guardrails, orders parts, and inspects saved decisions/exceptions.

**Selected journey:** Ashley handoff → Mike receives/scans → mandatory stop-out/disclosure screen → condition/completeness → structured tests/results/unknowns → viable grades/sale states → value/time/parts comparison → saved grade direction + next TARS action + reason.

**First worksheet priority:** tests performed, results, condition evidence, and unknowns. Do not add fields unless they change or explain a decision.

**Economic model:** Throughput/margin first. Test only when the result can change the decision. Explicit untested/as-is/broken/salvage outcomes are valid when allowed and represented truthfully. Compare valid paths primarily by **expected contribution margin per labor minute**, adjusted for workload/backlog.

**Finish line:** Ashley can hand off one item with complete comparable context; Mike can save the evidence needed to select grade direction and next action; Bill can inspect the reason and determine how to improve the reusable guardrail.

**Pilot learning questions:**

1. Does the structure capture enough evidence for Mike to make and later explain the grade/action decision?
2. Does Ashley's handoff reduce missing or non-comparable context without duplicating work she already does consistently?
3. Which reusable tests/rules improve consistency, and which fields add labor without changing the decision?

**Pilot evidence:**

- worksheet completion and abandoned/skipped fields;
- required test/result/unknown coverage;
- saved grade/action reason completeness;
- Ashley and Mike usability feedback;
- Bill's weekly review of unsupported cases, overrides, and candidate rule/template changes.

**Dependencies / operational checkpoints:**

- Ashley's first live handoffs and Mike's first representative decisions are CI observations, not functionality gates.
- Keep `RestorationJob` as transactional truth and preserve the current direct queued → bench flow.
- Do not use current verb metrics as success measures (`benchRows` vs legacy `actions` mismatch).
- Parts pilot follows Mike-submit → Bill-order → Mike-receive/resume.

**Out of scope for the MVP:** full TARS coverage; final guardrail editor/versioning architecture; generic SOP/document library; automatic changes to transactional lifecycle; broad analytics targets at the current four-job production baseline.

### Phase 2 — Managed guardrail system & rollout

**Goal:** Turn the proven MVP into an operationally managed rule/template system that covers priority TARS decisions and can evolve safely without rewriting code for every guardrail change.

**Outcomes:**

- Chosen model and editing experience for reusable test types, scales, rules, evaluation/salvage logic, steps, and decision templates.
- Appropriate draft, review, activate/effective-date, audit, communication, and rollback behavior.
- Permission matrix for viewers, contributors, editors, approvers, and administrators.
- Expanded priority coverage across Ashley's handoff, Mike's TARS actions, grade scales, item contexts, exceptions, and downstream decisions.
- Context selection, examples, media, or printable support only where validated.
- Rollout, coaching, accessibility, support, and guardrail-maintenance practices.
- Proven integration rules for any guidance-driven prompts or hard gates.

**Exit criteria:**

- Bill can change, review, activate, verify, and roll back guardrail versions through the approved path.
- Mike and Ashley see the correct current rules/templates for the supported context while old item decisions retain their applied version.
- Priority coverage and rollout acceptance are signed off.
- Changes are auditable and consequential updates are communicated.
- Guardrail ownership and recurring maintenance continue without depending on the implementation session.

**Phase planning decides:** structured Postgres rules/templates versus hybrid configuration; which Quality Audit patterns are reusable; schema and instance snapshot model; exact permissions; versioning depth; coverage order; acknowledgement rules; gate integration; migration and rollout sequence.

### Phase 3 — Continuous improvement & maturity

**Goal:** Make TARS systematically improve through durable feedback, accountable decisions, measured outcomes, and a recurring operating cadence.

**Outcomes:**

- Feedback intake with enough context to act on process gaps, missing/weak guardrails, inconsistent decisions, mandatory stop-outs/disclosure, bugs, and product requests.
- Triage method with owner, priority, decision, destination, status, target response, and closure communication.
- Explicit path from accepted feedback to process edit, rule/template version, coaching action, product initiative, or documented no-change decision.
- Metrics and review views that combine useful existing restoration data with only the additional instrumentation proven necessary.
- Recurring review cadence for process health, stale rules/templates, unresolved feedback, decision consistency, quality, and business outcomes.
- Hardening for permissions, auditability, reliability, support, retention/privacy, and operational handoff.

**Exit criteria:**

- At least one real feedback item completes intake → decision → change/no-change → communication → follow-up.
- Named owners run the review cadence with a visible backlog and aging.
- The organization can identify where guardrails are improving decisions, where they are failing, and the next prioritized maturity investment.
- Process, rule/template versions, item decisions, product changes, coaching, and releases stay traceable.
- Ongoing ownership and success measures are accepted as normal operations, not project cleanup.

**Phase planning decides:** feedback taxonomy and object; in-app inbox vs external/linked board; submitter visibility and notifications; triage SLA/cadence; initiative/release linkage; exact dashboards and targets; advanced outcome measures; retention/privacy details; whether AI assists clustering or drafting.

---

## Decision register — intentionally deferred

| Decision | Guardrail / current default | Decide in |
|----------|-----------------------------|-----------|
| Who owns the canonical process and final policy calls? | **Resolved:** Bill + Mike jointly; Bill owns product/policy guardrails, Mike owns Restoration practice. | Phase 0 |
| Who are the first users? | **Resolved:** Mike (Restoration) and Ashley (Processing), with their linked handoff/decision flow. | Phase 0 |
| Where does the decision structure live? | Inside or directly adjacent to the live workflow; never a competing transaction surface or document library. | Phase 0 / 1 |
| What worksheet/template structure captures evidence and decisions? | Use the least complex structured model that produces comparable work and reusable thinking. | Phase 1 |
| Prompts, calculations, recommendations, acknowledgement, or hard gates? | Structure first; gates require policy or mandatory compliance/disclosure, plus escape and failure-path justification. | Phase 1 / 2 |
| How do Mike/Ashley and future staff share one model? | One canon and reusable rule/template set; role-specific fields may differ without contradicting it. | Phase 1 / 2 |
| Hard-coded MVP, structured rules/templates, or hybrid configuration? | MVP may be narrow; long-term rules and applied versions must be governable and auditable. | Phase 1 / 2 |
| Who can edit, activate, review, and roll back guardrails? | Bill initially; later delegation follows least privilege. | Phase 2 |
| Which rules/templates need versions, effective dates, snapshots, or acknowledgement? | Proportion controls to business/compliance risk; prior item decisions must remain explainable. | Phase 2 |
| How is feedback captured and categorized? | It must be durable, contextual enough to act on, owned, and closable. | Phase 3 |
| What does “TARS matured” mean quantitatively? | Baseline first; targets must support decisions, not vanity reporting. | Phase 0 / 3 |
| Does AI help author, search, cluster, or recommend? | Optional assistant only; no unapproved operational authority. | Phase 2 / 3 |
| Does a transactional gap belong here or in the parked initiative? | Keep the boundary above; assign explicitly before implementation. | Every phase |

---

## Candidate success measures

Phase 0 selects a small baseline set; Phase 3 formalizes targets and review. Not every candidate requires new instrumentation.

- **Adoption:** worksheet/template use, completion/abandonment, rule selection, and unsupported-case patterns.
- **Decision consistency:** similar evidence produces similar grade/action/disposition decisions; exceptions have recorded reasons.
- **Flow:** queue/bench cycle time, pending duration by reason, parts wait, `research_sop` recurrence, completion/disposition mix.
- **Quality:** returns/rework, corrections, grade changes, overrides, missed required steps, recurring process exceptions.
- **Classification/compliance:** tested status, condition/disclosure completeness, mandatory stop-outs, and unresolved unknowns.
- **Guardrail health:** stale/unowned rules, activation lead time, rollback/correction frequency, and coverage of priority decisions.
- **Improvement health:** feedback age, triage time, decision/closure rate, reopen rate, changes shipped and communicated.
- **Business outcome:** labor/parts estimate accuracy, value/profit variance, throughput, or salvage recovery only when the data and decision use are trustworthy.
- **Existing baseline:** current dashboard action counts and restoration job-state metrics should be reused before adding parallel reporting.

---

## Risks and controls

| Risk | Control |
|------|---------|
| Build from the prototype instead of the live workflow | Phase 0 maps current code and floor behavior; prototype remains reference only. |
| Encode an idealized or disputed process | Separate as-is from as-intended; require owner and representative-user approval. |
| Create a second TARS workflow | Keep `RestorationJob` transactional truth and enforce the initiative boundary. |
| Overbuild before staff value is known | Prove one complete journey in Phase 1. |
| Structure slows work or becomes screen clutter | Save/reuse decisions, test with Mike and Ashley, and require only fields that change or explain a decision. |
| Hard gates trap legitimate exceptions | Require escalation/override rules and test failure modes before gating. |
| Easy editing causes unsafe or contradictory guardrails | Bill-controlled editing, review/activation, audit, effective version, and rollback in Phase 2. |
| Rules/templates drift from product behavior | Named ownership, applied-version snapshots, release/change linkage, and recurring review. |
| Feedback becomes a graveyard | Named triage owner, cadence, statuses, aging, decisions, and closure communication. |
| Margin/throughput score hides disclosure or prohibited-sale risk | Keep tested status and condition explicit; mandatory legal/handling/disclosure stop-outs cannot be overridden by the economic score. |
| AI introduces authoritative mistakes | Human approval and provenance; AI remains optional assistance. |

---

## Dependencies and phase inputs

- Access to Ashley and representative processors plus Mike for observation and validation.
- Bill and Mike jointly settle TARS process/policy; Bill settles product structure and consequential business guardrails.
- Stable enough live queue/bench behavior to pilot guidance against real work.
- Bill initially maintains the guardrail/template system; Mike and Ashley provide operational feedback.
- Permission to use operational data needed for approved measures, with minimum necessary retention and access.
- Explicit owner approval before reactivating or merging the parked transactional initiative.

---

## Initiative-level acceptance

- [ ] Canonical cross-role TARS process and vocabulary are approved and owned.
- [ ] Priority policy, tested/untested disclosure, mandatory stop-out, recommendation, exception, and hard-gate distinctions are explicit.
- [ ] At least one linked Mike/Ashley worksheet/decision journey proves useful in live work, then priority coverage is rolled out.
- [ ] Guardrails integrate with the live TARS source of truth and do not duplicate the job lifecycle.
- [ ] Bill can safely maintain, activate, audit, communicate, and roll back rule/template versions.
- [ ] Staff have a clear path to stop, escalate, flag a missing guardrail, and submit improvements.
- [ ] Feedback has accountable triage, decisions, destinations, statuses, and closure.
- [ ] Adoption, decision consistency, process, classification/compliance, guardrail-health, and improvement measures support recurring decisions.
- [ ] Permissions, accessibility, reliability, support, and handoff are accepted for ongoing operation.
- [ ] Transactional gaps are traceable to the parked workspace or another explicitly approved scope.

---

## Technical and product anchors

- Live routes: `/restoration/tars`, `/restoration/parts-requests`, `/inventory/restorations` (legacy `/inventory/restoration-returns` redirects to FROM)
- Bench: [`frontend/src/pages/restoration/tars/TarsWorkstation.tsx`](../../../../frontend/src/pages/restoration/tars/TarsWorkstation.tsx)
- Grade table: [`frontend/src/pages/restoration/tars/TarsGradeTable.tsx`](../../../../frontend/src/pages/restoration/tars/TarsGradeTable.tsx)
- Holds/escalation types: [`frontend/src/pages/restoration/tars/tarsWorkTypes.ts`](../../../../frontend/src/pages/restoration/tars/tarsWorkTypes.ts)
- TARS Studio Inbox (replaces Processing-facing Queue nav): [`frontend/src/pages/restoration/tars/studio/`](../../../../frontend/src/pages/restoration/tars/studio/)
- Parts requests: [`frontend/src/pages/restoration/TarsPartsRequestsPage.tsx`](../../../../frontend/src/pages/restoration/TarsPartsRequestsPage.tsx)
- Processing Restorations hub: [`frontend/src/pages/inventory/restorations/RestorationsPage.tsx`](../../../../frontend/src/pages/inventory/restorations/RestorationsPage.tsx)
- Backend model/services: [`apps/inventory/models.py`](../../../../apps/inventory/models.py), [`apps/inventory/services/restoration.py`](../../../../apps/inventory/services/restoration.py), [`apps/inventory/services/restoration_bench.py`](../../../../apps/inventory/services/restoration_bench.py)
- Existing metrics: [`apps/pos/services/dashboard_metrics.py`](../../../../apps/pos/services/dashboard_metrics.py)
- Content precedents: [`retail_quality_audit`](../_completed/retail_quality_audit.md), [`blog_studio`](../_completed/blog_studio.md)
- Current product history: [`CHANGELOG.md`](../../../../CHANGELOG.md) (`2.34.0`–`2.39.0`)

---

## See also

- Parked transactional initiative: [`tars_restoration_workspace`](./tars_restoration_workspace.md)
- Process canon: [`.ai/reference/tars/`](../../../reference/tars/)
- Frontend context: [`.ai/extended/frontend.md`](../../../extended/frontend.md)
- Backend context: [`.ai/extended/backend.md`](../../../extended/backend.md)
- Active initiatives index: [`.ai/initiatives/_index.md`](../../_index.md)
