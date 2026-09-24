> **Start here (runner, shift mode).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md`, section **Shift mode**. You run until an `end` row appears in `queue.md`. There is no clock stop. Never stop because the queue is empty.

# Runner shift

## The loop
1. Re-read [`queue.md`](queue.md) **every time**. The coder adds and edits tasks all night.
2. Take the lowest `queued` ID, and open **only that** task file. Run it, archive it, and start again at step 1.
3. Skip `hold` rows. They are slots the coder hasn't filled yet.
4. **Nothing queued?** Do one idle chunk (below), about 20 minutes, then go back to step 1.
5. **Stop** only at a row marked `end`. Keep going otherwise, however long it takes.
6. **Never end your reply between tasks.** Ending the reply ends the shift: nobody restarts you, and the queue sits for hours (it happened on 2026-09-24 after R-060). After archiving a task, your next action is always a tool call that re-reads `queue.md`. Write a summary to the result file, not to the chat.

## Idle work (only when nothing is queued)

Each idle chunk writes to its own file and picks up where the last chunk stopped. The rules are the same as for any task: read-only database, no outside calls, no product code.

**I-1 · Second-opinion labels.** This needs R-021 to be done. If it isn't, skip to I-2.
- Take the next 25 rows of `workspace/gold/candidates.csv` that aren't in `workspace/gold/runner_labels.csv` yet.
- For each row, write `product_id`, `category`, `subcategory`, `short_name`, `confidence` (high, medium or low) and a `note`.
- Follow `.ai/extended/product-taxonomy.md` exactly: the placement steps, the rulings and the short-name rules.
- For a `vague title`, flag it; don't guess.
- Append to `runner_labels.csv`, with columns in that order.
- **Taxonomy questions:** when the taxonomy doesn't settle a case, add a line to `workspace/gold/taxonomy_questions.md` with the product id, the two candidate places and why. The coder turns these into rulings.

**I-2 · More near-duplicate pairs.** This needs R-022 to be done. If it isn't, skip to I-3.
- Take 500 more product titles with seed 24, then 25, and so on. Record the last seed used in the file's first line.
- Find their near pairs the same way as R-022.
- Append to `workspace/runner/R-022/near_pairs_more.csv`, marking each pair **same**, **variant** or **different**.

**I-3 · Mixed titles by hand.**
- Take 25 random sold "Mixed lots" titles: seed 100, then 101, and so on.
- Place each with the taxonomy.
- Append to `workspace/gold/mixed_labels.csv` with columns `item_title`, `category`, `subcategory`, `confidence`, `note`.
- Taxonomy questions go to the same file as in I-1.

If all three are blocked, wait 5 minutes and re-read `queue.md`. Keep looping; never end the shift yourself.
