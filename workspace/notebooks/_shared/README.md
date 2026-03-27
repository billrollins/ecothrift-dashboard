# Notebooks — shared config and setup

Shared **`config.example.py`**, **`config_local.py`** (gitignored), and **`requirements-notebooks.txt`** for all notebooks under `workspace/notebooks/`.

Project notebooks live in slug folders: **`db-explorer/`**, **`historical-data/`**, **`bstock-scraper/`** (B-Stock package).

## Setup

1. Create a virtualenv (or use the project `venv`) and install notebook deps:

   ```bash
   # From repo root:
   pip install -r workspace/notebooks/_shared/requirements-notebooks.txt
   pip install jupyter
   ```

2. **`config_local.py`** (gitignored) — either:
   - Copy **`config.example.py`** → **`config_local.py`** in this `_shared/` folder and edit credentials, or
   - Use the repo’s generated **`config_local.py`**, which reads **`DATABASE_*`** from the project root **`.env`** (same as Django). DB1/DB2 use database names `old_production_db` and `db2` on that same server; change those in `config_local.py` if your local names differ.

3. For DB1/DB2 on **different** hosts or passwords than `.env`, edit **`config_local.py`** or switch to the static template from `config.example.py`.

4. Start Jupyter (cwd can be **repo root** or **`workspace/notebooks`** — notebooks resolve `_shared/config.example.py` automatically). Optional: set env **`NOTEBOOK_DIR`** to **`workspace/notebooks`** if your layout differs.

   ```bash
   cd workspace/notebooks   # or: cd <repo-root>
   jupyter notebook
   ```

   Open **`db-explorer/db_explorer.ipynb`** for multi-DB exploration, or notebooks under **`historical-data/`** / **`bstock-scraper/Scraper/examples/`**.

## Jupyter kernel (fixes `ModuleNotFoundError: sqlalchemy`)

Dependencies live in **`requirements-notebooks.txt`**. They must be installed in the **same Python** as your Jupyter kernel (not only in a venv you never select).

1. `venv\Scripts\activate` (or your project venv), then `pip install -r workspace/notebooks/_shared/requirements-notebooks.txt` and `pip install jupyterlab` if needed.
2. Start Jupyter from that venv: `jupyter lab`.
3. In the notebook UI: **Kernel → Change kernel** → choose the venv’s Python.

If the venv does not appear, register it once:

```powershell
.\venv\Scripts\python.exe -m ipykernel install --user --name=ecothrift-dashboard --display-name="Python (ecothrift venv)"
```

Then pick **Python (ecothrift venv)**.

**Quick fix without switching kernels:** run in a cell `%pip install SQLAlchemy pandas psycopg2-binary` (installs into the **current** kernel only).

## Outputs

- **`db-explorer/pickles/`** — default folder for `df_to_pickle` / `df_from_pickle` in db_explorer (gitignored). Created automatically if missing.
- **`bstock-scraper/Scraper/output/`** — B-Stock scraper CSV/JSON exports (gitignored).

## B-Stock scraper (`bstock-scraper/Scraper/`)

Python package under **`workspace/notebooks/bstock-scraper/Scraper/`** (tracked). **Do not automate B-Stock login** (CAPTCHA / Cloudflare). Capture JSON XHR from DevTools (often `search.bstock.com` or `auction.bstock.com`, not guessed `bstock.com/api/...` HTML). Initiative and constraints: [`.ai/initiatives/_archived/_pending/bstock_scraper.md`](../../.ai/initiatives/_archived/_pending/bstock_scraper.md).

1. Install deps (includes Playwright for optional browser fallback):

   ```bash
   pip install -r workspace/notebooks/_shared/requirements-notebooks.txt
   playwright install chromium
   ```

2. **Config:** Copy **`Scraper/config.example.py`** to **`Scraper/bstock_config_local.py`** (gitignored). Fill `TOKEN`, `API_URL`, `EXTRA_HEADERS`, pagination keys from **Copy as cURL**.

3. **Notebook API** — add `workspace/notebooks/bstock-scraper` to `sys.path` if your Jupyter cwd is repo root:

   ```python
   from Scraper import BStockScraper
   scraper = BStockScraper()
   auctions = scraper.get_auctions()
   scraper.update()
   scraper.save_to_disk()  # CSV + JSON under Scraper/output/
   ```

   Quickstart: **`bstock-scraper/Scraper/examples/bstock_quickstart.ipynb`**.

4. **CLI (API path):** from **`workspace/notebooks/bstock-scraper`**: `python -m Scraper`

5. **Browser fallback:** from **`workspace/notebooks/bstock-scraper`**: `python -m Scraper.browser --setup` then `python -m Scraper.browser` (profile under **`Scraper/bstock_auth/`**, gitignored).

6. **Token refresh (experimental):** `python -m Scraper.refresh_token` (requires `REFRESH_TOKEN` in `bstock_config_local.py`).

## Documentation

- **`.ai/extended/databases.md`** — what DB1 / DB2 / DB3 mean and where audits live.
- **Local DB audit exports** — if you keep full schema markdown, store under `workspace/database-audits/` (gitignored); routing notes in `.ai/extended/databases.md`.
- **`workspace/testing/e2e_retag_pos_sales_verification.md`** — manual E2E checklist (Retag → POS → SQL); see `workspace/testing/README.md`.
