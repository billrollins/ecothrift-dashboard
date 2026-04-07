<!-- Last updated: 2026-04-06 -->
# Category research workspace

**Audience:** You are an AI or a human opening this folder cold. This document is the **onboarding guide** for the category-intelligence project that lives here and in the archived initiative [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](../../../.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md).

---

## What this project does

**Category intelligence for a thrift store.** The work pulls **inventory and sales** data from the same PostgreSQL database the dashboard uses (`public` + `ecothrift` schemas), aligns three **bins** (slices of reality) on **identical columns**, maps messy **manifest labels** to **19 canonical categories**, and uses **Claude** to assign every item an AI category. The payoff is **sell-through analysis**: compare **what sold** (Bin 2) vs **what sits on the shelf** (Bin 3) by category—avg sale price, margin, days to sell—so **buying and merchandising** decisions are grounded in data, not guesswork.

---

## What was accomplished

| Area | Outcome |
|------|---------|
| **Unified SQL extracts** | Three bins (`bin1`, `bin2`, `bin3`) with **matching columns** from **`public`** where possible; **Bin 3** uses **`ecothrift`** only to filter “in store” SKUs via **retag notes** (see unified Bin 3 SQL). |
| **Canonical taxonomy** | **19 categories** in [`taxonomy_v1.example.json`](./taxonomy_v1.example.json), validated for prompts and downstream reporting. |
| **Manifest → category** | Rule-based mapping in [`cr/taxonomy_estimate.py`](./cr/taxonomy_estimate.py): on the order of **444** distinct manifest labels mapped to the spine (see phase outputs under `ai_scripts/output/` when present). |
| **AI categorization** | All items run through the API using editable prompts [`cr/prompts.py`](./cr/prompts.py) and execution in [`cr/categorize.py`](./cr/categorize.py) (threaded calls, tqdm, chunk + resume). |
| **Sell-through analysis** | Bin 2 (sold) vs Bin 3 (on shelf) by category: **share of bin**, **avg sale price**, **margin**, **avg days to sell** (Bin 2, when timestamps exist). [`categorize.ipynb`](./categorize.ipynb) includes cells you can reuse for “auction” / buying-style reads. |

---

## Key findings (snapshot)

These are **representative business takeaways** from the categorization and distribution work—not a substitute for re-running numbers after new extracts.

- **Toys & games:** Largest **understock** signal—roughly **~13%** of sales vs **~6.5%** of shelf (category share of Bin 2 vs Bin 3).
- **Home decor:** Largest **overstock** signal—roughly **~9%** of sales vs **~15%** of shelf.
- **Apparel:** **Sells poorly** relative to shelf space—roughly **~2%** of sales vs **~7.5%** of shelf.
- **Kitchen & dining:** **Anchor category**—well balanced at roughly **~18%** on both sold and shelf sides.

Recompute from your latest `*_categorized.csv` / summary exports when making purchasing decisions.

---

## Project structure

Paths are under `workspace/notebooks/category-research/` unless noted. Many artifact dirs are **gitignored**; only selected files are tracked—see root [`.gitignore`](../../../.gitignore).

### Root files

| File | Purpose |
|------|---------|
| [`README.md`](./README.md) | This handoff document. |
| [`taxonomy_v1.example.json`](./taxonomy_v1.example.json) | Canonical **19** category names (`taxonomy_v1`) for prompts, CLI `--taxonomy`, and validation. |
| [`discovery_lockin.example.md`](./discovery_lockin.example.md) | Example / template for locking discovery assumptions (optional). |
| [`category_research.ipynb`](./category_research.ipynb) | **Primary notebook:** Django setup, `run_extract`, pickles, review, taxonomy estimate flows. |
| [`categorize.ipynb`](./categorize.ipynb) | **AI categorization:** sample run, full bin run with chunks, `build_summary` (AI vs manifest tables). |

### `cr/` package (tracked modules)

| File | Purpose |
|------|---------|
| [`cr/__init__.py`](./cr/__init__.py) | Public exports (`get_sample`, `ai_categorize`, `ai_categorize_full`, `build_summary`, etc.). |
| [`cr/paths.py`](./cr/paths.py) | Paths for cache, exports, categorized CSVs, chunk dirs. |
| [`cr/sql_loader.py`](./cr/sql_loader.py) | Load unified SQL text from [`scripts/sql/`](../../../scripts/sql/). |
| [`cr/extract.py`](./cr/extract.py) | Run unified extracts, write pickles (`load_extract_pickle`, `run_extract`, …). |
| [`cr/review.py`](./cr/review.py) | Helpers for reviewing extract columns and sanity checks in the notebook. |
| [`cr/taxonomy_estimate.py`](./cr/taxonomy_estimate.py) | **Manifest label → canonical category** rule table and application (444-label-scale mapping). |
| [`cr/prompts.py`](./cr/prompts.py) | **Editable** system/user prompts for Claude; category list; no API calls. |
| [`cr/categorize.py`](./cr/categorize.py) | **Claude batch execution:** threading, progress bar, chunk + resume, dual AI/manifest summaries. |

### SQL (repo: `scripts/sql/`)

| File | Purpose |
|------|---------|
| [`unified_bin1_public.sql`](../../../scripts/sql/unified_bin1_public.sql) | Bin 1 — processed / foundation slice (`public`). |
| [`unified_bin2_public.sql`](../../../scripts/sql/unified_bin2_public.sql) | Bin 2 — sold lines (`public`); includes item processing time for **days-to-sell**. |
| [`unified_bin3_public.sql`](../../../scripts/sql/unified_bin3_public.sql) | Bin 3 — in store now; **ecothrift** retag-note filter. |
| [`category_research_discovery.sql`](../../../scripts/sql/category_research_discovery.sql) | One-line pointer to discovery SQL under this workspace. |

Discovery SQL file to run via `ai_execute_sql.py`: [`ai_scripts/sql/category_research_discovery.sql`](./ai_scripts/sql/category_research_discovery.sql).

### `ai_scripts/`

| Path | Purpose |
|------|---------|
| [`ai_scripts/ai_execute_sql.py`](./ai_scripts/ai_execute_sql.py) | Generic **“run SQL file → CSV”** helper (Django DB connection); any agent can reuse for ad hoc queries. |
| [`ai_scripts/sql/*.sql`](./ai_scripts/sql/) | Committed SQL snippets (e.g. discovery). |
| `ai_scripts/output/` | **Gitignored** CSV outputs from `ai_execute_sql.py` (e.g. unified sample pulls, phase distributions). |

### Notebooks

| Notebook | Role |
|----------|------|
| `category_research.ipynb` | Extracts, pickles, mapping, review. **Run first** when refreshing data. |
| `categorize.ipynb` | AI categorization + summaries. **Run after** pickles exist; needs `ANTHROPIC_API_KEY`. |

### `docs/`

| File | Purpose |
|------|---------|
| [`docs/taxonomy_input_schema.md`](./docs/taxonomy_input_schema.md) | Unified vs legacy column contract for taxonomy inputs. |

### `cache/`

| Path | Purpose |
|------|---------|
| [`cache/README.md`](./cache/README.md) | Explains approved pickle names (`extract_bin1.pkl`, …). |
| `extract_bin*.pkl` | **Gitignored** frozen extracts for fast notebook iteration. |

### `exports/`, `categorized_exports/`, `reports/`, `model_compare/`

| Folder | Purpose |
|--------|---------|
| `exports/` | Legacy **`export_category_bins`** CSV outputs (gitignored). |
| `categorized_exports/` | AI run outputs: `{bin}_categorized.csv`, `chunks/{bin}_{n}.csv`, optional `summary_ai.csv` / `summary_manifest.csv` (gitignored). |
| `reports/` | **`report_category_bins`** markdown (gitignored). |
| `model_compare/` | Ad hoc model comparison artifacts (gitignored). |

### `logs/`

| Path | Purpose |
|------|---------|
| [`logs/README.md`](./logs/README.md) | Logging layout. |
| `extraction_runs.log` | Append-only extract log (gitignored). |
| `logs/categorization/` | CLI `categorize_category_bins` JSONL logs (gitignored). |

---

## Reusable components for future work

| Component | Why reuse it |
|-----------|----------------|
| [`ai_scripts/ai_execute_sql.py`](./ai_scripts/ai_execute_sql.py) | Drop-in **SQL → CSV** for any research task against the Django DB. |
| [`cr/prompts.py`](./cr/prompts.py) | **Prompt templates** isolated from logic—swap taxonomy or task (classification, tagging) without touching execution. |
| [`cr/categorize.py`](./cr/categorize.py) | **Threaded** Anthropic calls, **tqdm**, **chunk + resume** CSV pattern—suitable for any **batch API** job, not only categories. |
| [`cr/taxonomy_estimate.py`](./cr/taxonomy_estimate.py) | **Manifest label mapping** when categories or vendor labels change. |
| **Auction / buying cells** in [`categorize.ipynb`](./categorize.ipynb) | Copy into a **standalone notebook** for focused buying meetings without re-running full pipelines. |

---

## How to rerun

### Prerequisites

1. **Repo root** as the Jupyter **working directory** (or `sys.path` / `os.chdir` as in the notebooks).
2. **Python:** `pip install -r workspace/notebooks/_shared/requirements-notebooks.txt` (includes `anthropic`, `tqdm`, pandas, etc.).
3. **Django:** `DJANGO_SETTINGS_MODULE=ecothrift.settings`, `django.setup()` as in the first cells of each notebook.
4. **Database:** `.env` / `DATABASE_*` pointing at the store Postgres (same as dashboard).
5. **AI:** `ANTHROPIC_API_KEY` in the environment **or** `ANTHROPIC_API_KEY` in Django settings for [`categorize.ipynb`](./categorize.ipynb).

### Notebook order

1. Open [`category_research.ipynb`](./category_research.ipynb) → run **`run_extract`** for `bin1` / `bin2` / `bin3` (or `"all"`) → **`save_pickle`** when satisfied.
2. Open [`categorize.ipynb`](./categorize.ipynb) → sample **`ai_categorize`** → optional full **`ai_categorize_full`** → **`build_summary`**.

### Regenerating pickles

If **SQL** changes (under `scripts/sql/unified_bin*_public.sql`) or **warehouse data** changes materially, re-run the extract cells in **`category_research.ipynb`** and overwrite the pickles in **`cache/`**. Old categorized CSVs will **not** pick up new columns until you re-run **`ai_categorize_full`**.

---

## What is **not** in this project

- **V1 POS history depth:** The **`public`** cart / line / item / manifest tables hold **2+ years** of sales history; the **unified bins** intentionally implement the **initiative’s** slice (e.g. Bin 2 window), not a full historical warehouse export. Join paths for deeper history were discussed in session work but **not** implemented here.
- **Subcategories:** Deferred; the spine is **19 top-level** categories only.
- **Django CLI vs notebook AI:** [`categorize_category_bins`](../../../apps/inventory/management/commands/categorize_category_bins.py) uses a **different prompt/format** than the notebook path (`cr/prompts.py`). They are **not** synchronized—align manually if you need parity.

---

## Legacy CLI (still supported)

```bash
python manage.py export_category_bins --bins all
python manage.py categorize_category_bins --taxonomy workspace/notebooks/category-research/taxonomy_v1.example.json --bin bin2 --input workspace/notebooks/category-research/exports/...
python manage.py report_category_bins
```

Uses the **`default`** database; SQL lives under [`scripts/sql/`](../../../scripts/sql/). Canonical filesystem paths for CLI outputs: [`apps/inventory/category_research_paths.py`](../../../apps/inventory/category_research_paths.py).

---

## See also

- **Initiative (archived completed):** [`.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md`](../../../.ai/initiatives/_archived/_completed/category_sales_inventory_and_taxonomy.md)
- **Taxonomy helpers (Django app):** [`apps/inventory/services/category_taxonomy.py`](../../../apps/inventory/services/category_taxonomy.py)
