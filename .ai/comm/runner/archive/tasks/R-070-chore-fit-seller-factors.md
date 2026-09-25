> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-070 · Chore: run the seller-factor fit on dev (report only) and check it against R-062

- **Type:** chore · **Database:** dev, read-only (no `--save`) · **Time box:** 30 minutes
- **Code:** the main tree as it is (`apps/buying/services/seller_factor.py`, the command `fit_seller_factors`).

## Steps
1. From `C:\Coding\ecothrift-dashboard`, run:
   `venv\Scripts\python.exe manage.py fit_seller_factors > workspace\runner\R-070\fit.log 2>&1`
   **Do not pass `--save`.** Paste the output and say how long it took.
2. Compare with R-062 (`archive/results/`):
   - The command divides by the prediction after shrink (it prints the share kept). R-062 divided by the prediction before shrink, so the command's medians should be R-062's ÷ that share. Do they agree within 0.03 per seller?
   - List any seller whose n differs from R-062, and say why if you can see it.
3. If it errors, give the last 15 lines of the traceback and stop.

## Hand back
The output, the comparison table, and **Observations** (3 lines at most): would you `--save` these factors?
