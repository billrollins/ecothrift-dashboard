# R-006 · recon · Product vectors: what exists from the early R&D

**Why:** Manifest analysis (Phase 4) groups manifest lines into products and matches them to our sales history. The owner says the early vector R&D worked well. We need to find it and see what can be reused.

**Answer these:**

1. **Find it.** Search the repo, `workspace/` (notebooks and data), `.ai/` and `.ai/initiatives/_archived/` for embedding, vector, pgvector, cosine, similarity and nearest. List each hit that matters, with `path:line` and a one-line summary.
2. **How it was done:**
   - Model or provider, and dimensions.
   - Where the vectors are stored: DB table, file, or pgvector extension. Is the `vector` extension installed in the dev DB? (`SELECT * FROM pg_extension`.)
   - What text was embedded.
   - How matching worked, and any recorded results.
3. **Products today:** the `Product` model fields (`path:line`), the count of products, and how many items link to a product.
   - Rough duplicate estimate: count the groups of products with the same lower-cased, trimmed title, and the rows in those groups.
   - Is there a UPC, ASIN or SKU field, and how full is it (%)?
4. **Manifest lines:** which fields on buying `ManifestRow` (B-Stock manifests) could be matched to products: UPC, ASIN, SKU, title, brand, model. Give the fill % on rows with `raw_data` from the API.
5. **What a full run would take:** counts of products, and of distinct manifest titles, to embed. List any existing batch or embedding code that could do it.

**Result:** `results/R-006-product-vectors-rnd.md`. Read-only; no outside calls, and no embedding calls.
