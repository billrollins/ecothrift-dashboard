# Runner queue — ecothrift-dashboard

Per [`.ai/protocols/runner.md`](../../protocols/runner.md). The coder adds rows; the runner changes only **Status**. Oldest first. Finished tasks move to [`archive/`](archive/index.md).

Each task file starts with a **Start here** header, so you can drop that one file into chat.

| ID | Type | Status | Title | Task | Result |
|---|---|---|---|---|---|
| R-016 | recon | queued | Every B-Stock category code we have seen, and where it lands | [task](tasks/R-016-bstock-category-codes.md) | [result](results/R-016-bstock-category-codes.md) |
| R-017 | recon | queued | What is inside Mixed lots (titles and brands) | [task](tasks/R-017-mixed-title-patterns.md) | [result](results/R-017-mixed-title-patterns.md) |
| R-018 | recon | queued | Can our Postgres hold vectors? | [task](tasks/R-018-pgvector-heroku.md) | [result](results/R-018-pgvector-heroku.md) |
