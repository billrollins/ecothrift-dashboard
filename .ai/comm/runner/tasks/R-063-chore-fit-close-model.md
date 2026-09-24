> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-063 · Chore: run the new close-model fit on dev (report only)

- **Type:** chore · **Database:** dev, read-only (the command without `--save` writes nothing) · **Time box:** 30 minutes
- **Code:** the main tree as it is (`apps/buying/services/close_model_fit.py` and the command `fit_close_model`).
- **Why:** The likely close now uses R-053's ratios and optional seller × condition cells, and the new command fits them from our data. Check that it runs on real data, and see what it would store.

## Steps
1. From `C:\Coding\ecothrift-dashboard`, run:
   `venv\Scripts\python.exe manage.py fit_close_model --days 365 > workspace\runner\R-063\365.log 2>&1`
   Then run it again with `--days 90`, writing to `90.log`. **Do not pass `--save`.**
2. Paste both outputs, and say how long each run took.
3. Compare the 365-day output with R-053 (in `archive/results/`):
   - Do the seller ratios agree with R-053, to within 0.005?
   - How many seller × condition cells reach n ≥ 30? The command prints only the sellers; get the cells from `manage.py shell` with `from apps.buying.services.close_model_fit import fit_close_model; fit = fit_close_model(days=365); fit['model']['cells']`. List them.
   - What are the bump n's?
4. If the command errors, give the traceback's last 15 lines and stop.

## Hand back
The two outputs, the timings, the cells table, and **Observations** (3 lines at most): should we `--save` the fit, and is the 90-day or the 365-day window better?
