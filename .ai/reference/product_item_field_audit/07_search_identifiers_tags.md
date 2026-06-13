# 07 — Search, Identifiers, And Tags

**Purpose:** define Product identifier storage and v1 Product search without adding a Product search string by default.

## Identifier Ownership

### ManifestRow

`ManifestRow.identifiers` stores source ID/tracking-like values from manifests.

Examples:

- `upc`
- `asin`
- `sku`
- `item_number`
- `mpn`
- `ean`
- `gtin`
- `lot_id`
- `pallet_id`
- `lpn`
- other vendor/source IDs

Rules:

- Source identifiers are not AI-adjusted in preprocessing.
- Source identifiers do not become internal Item location.
- Tracking-like source fields live in the same bucket unless a future schema proves a split is needed.

### Product

`Product.identifiers` stores Product-relevant identifiers used for search, matching, and display.

Examples:

- `upc`
- `asin`
- `mpn`
- `ean`
- `gtin`
- vendor item number where stable enough to identify Product

Rules:

- Existing `Product.upc` migrates to `Product.identifiers['upc']`.
- Product creation from processing may prefill identifiers from `ManifestRow.identifiers`.
- Staff can edit Product identifiers.
- Product identifiers are Product identity/search data, not Item lifecycle data.

## Normalization

Add one backend helper for identifier normalization.

Target behavior:

- Normalize keys to lowercase snake case.
- Trim string values.
- Strip common formatting from UPC/EAN/GTIN if existing behavior already does so.
- Preserve leading zeroes for barcode-like identifiers.
- Drop empty values.
- Avoid duplicate values under the same key.

Use this helper in:

- Product data migration.
- Product matching.
- Product create/update serializers.
- Product search.
- Manifest standardization if it needs key normalization.

## Product Tags

Product tags are search aids, not canonical identity.

Target:

- Store as JSON/list.
- AI can suggest tags.
- Staff can edit tags.
- Search can match tags.
- Tags should not replace category, identifiers, title, brand, or model.

Suggested normalization:

- Lowercase.
- Trim.
- Prefer stable slug-ish strings for internal matching.
- UI can display prettier labels if needed.

## Product Search V1

Search UX:

- One simple search bar.
- API parameter remains `search`.
- Split input on whitespace.
- AND across tokens.
- For each token, OR across searchable fields.

Searchable sources:

- `product_number`
- `title`
- `brand`
- `model`
- `category`
- `identifiers` JSON values
- `tags`

Example:

Search `sony remote 12345` means:

- token `sony` matches one searchable source,
- token `remote` matches one searchable source,
- token `12345` matches one searchable source,
- all three tokens must match the same Product row somewhere across the searchable sources.

## Index Strategy

Initial indexes:

- B-tree or trigram/functional indexes for `product_number`, `title`, `brand`, `model`, `category` depending on current DB support.
- JSON/GIN-style indexes for identifiers and tags where supported.

Do not add a denormalized `Product.search_string` in the first implementation.

Add denormalized search only if:

- token-AND search is measurably too slow on realistic data,
- indexes cannot solve the problem cleanly,
- and the implementation includes a deterministic rebuild/update path.

## Matching Strategy

Product matching order:

1. Exact normalized identifier match, especially UPC/ASIN/MPN/EAN/GTIN.
2. Exact normalized `title + brand + model + category`.
3. Fuzzy/score match if existing matching already supports it.
4. Create new Product if no acceptable match.

Rules:

- Matching must not consider Product price.
- Matching must not depend on flat `Product.upc`.
- Matching should include enough detail in snapshots for staff review.

## API Shapes

Product write:

```json
{
  "title": "Sony Remote",
  "brand": "Sony",
  "model": "RM-YD103",
  "category": "electronics",
  "identifiers": {
    "upc": "012345678905"
  },
  "tags": ["remote", "tv-accessory"]
}
```

Product read can include convenience display:

```json
{
  "id": 123,
  "product_number": "PRD-00123",
  "title": "Sony Remote",
  "brand": "Sony",
  "identifiers": {
    "upc": "012345678905"
  },
  "primary_identifier": "UPC 012345678905"
}
```

The canonical storage remains `identifiers`.

## Done Criteria

- Product matching works by migrated UPC through identifiers.
- Product search works by title, brand, model, category, product number, identifiers, and tags.
- Flat Product UPC is not required by backend or frontend.
- Product tags exist only as Product search/display aids.
- No Product search string exists unless a measured performance pass justifies adding one.
