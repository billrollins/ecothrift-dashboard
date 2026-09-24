> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-060 · Recon: how right are the manifest hazards, and which new ones are worth adding

- **Type:** recon · **Database:** dev, read-only · **Time box:** 60 minutes
- **Needs:** R-055 done, so `buying.ManifestRow.hazards` is filled. If R-055 is not done, run it first.
- **Why:** the auction page counts hazards, and a lot's verdict says "2 hazards to check". A hazard that is often wrong turns that into noise. The rules are in `apps/buying/services/manifest_analysis.py`: `HAZARDS`, the `*_RE` regexes, and `line_hazards`.

## Questions

1. **Precision per hazard.** For each code in `HAZARDS` that appears in `ManifestRow.hazards`, take 25 random rows (seed 60). Mark each row **right** (the hazard is real for this line), **wrong**, or **unsure**, and show row title | condition | qty | unit retail | hazards. Give the count of each mark per code. For `high_value`, `bulk_line`, `high_volume`, `slow` and `stocked`, "right" means the rule did what it says (these are thresholds, not keywords). For those, just report the spread: the median and p90 of the unit retail, the quantity, or the days.
2. **The misses behind the wrong ones.** For each keyword hazard (`part`, `incomplete`, `fragile`), list the words or patterns that caused the **wrong** marks (for example "mirror" in "mirrored finish"). Also list 5 titles that should have been flagged but were not, if you see any while sampling.
3. **Candidate new hazards.** Count the rows and auctions matching each pattern below (case-insensitive, on title and condition), and give 5 sample titles each:
   - `battery`: `\blithium\b|\bli-?ion\b|\bbattery pack\b|\bpower ?bank\b`;
   - `aerosol_flammable`: `\baerosol\b|\bspray paint\b|\bpropane\b|\bbutane\b|\bflammable\b|\blighter fluid\b`;
   - `liquid`: `\b(oz|fl ?oz|ml|liter|gallon)\b` with a quantity of 6 or more on the line;
   - `mattress_furniture`: `\bmattress\b|\bsofa\b|\bcouch\b|\bsectional\b|\bdresser\b` (big and slow to handle);
   - `recall_words`: `\brecall(ed)?\b`.
4. **Share of retail.** For the 3 candidates with the most rows, the median share of an auction's retail they make up in the auctions they touch.

## Hand back

- The table for question 1 with the right / wrong / unsure counts.
- The list of patterns for question 2.
- The table for questions 3–4.
- **Observations** (5 lines at most): which rules you would tighten, and which new hazards are worth adding.
