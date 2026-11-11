"""
Finding the product for a manifest row in Processing (Dash Updates #98, D29; Bill 2026-11-11: "SUPER slow and
clunky ... should pre-fetch likely products ... search intelligently: product vectors OR smart search like
tags/ids/titles").

Two calls, both answered in well under half a second on the full catalog:

- **Likely products** (`likely`) for a row, fetched the moment the row opens: an exact code match first (UPC, SKU,
  item number, product number), then the row's own brand and title, then products close in meaning to the best of
  those (the stored vector's nearest neighbours, the fast bare query the price coach uses).
- **Find** (`find`) for typed words: codes first, then every product holding all the words, then products holding
  all but one word (so a missing or extra word never empties the list), ranked in Python on a few hundred
  candidates; close in meaning fills the rest; closest spelling only when nothing else is found.

The words are matched on `Product.search_text` (title, brand, model, product number, UPC and the product standard:
tag name, category, aliases), with its trigram indexes; spaces don't matter ("barstool" finds "Bar Stool").
Text is embedded only when this process already holds the model, so a search never waits for a model to load.
"""
from __future__ import annotations

import math
import re
import time
from itertools import combinations
from typing import Any, Iterable

from django.db.models import Avg, Count, Max, Q, Value
from django.db.models.functions import StrIndex

from apps.inventory.models import Item, Product, ProcessingRow
from apps.inventory.services.inventory_search import matching_words

LIMIT = 20
LIKELY_LIMIT = 8
CANDIDATES = 300          # rows taken from the database for ranking (all words)
SUBSET_EACH = 80          # rows per "all but one word" search
NEAR_COUNT = 8            # neighbours by meaning
NEAR_FLOOR = 0.80         # how close in meaning counts
MAX_WORDS = 8

WHY_CODE = 'Same code'
WHY_ALL = 'All words'
WHY_MOST = 'Most words'
WHY_NEAR = 'Close in meaning'
WHY_SPELLING = 'Close spelling'

# Little words are in nearly every product line, so they find nothing; they are left out unless they are all there is.
STOP_WORDS = {'a', 'an', 'the', 'and', 'or', 'of', 'with', 'for', 'to', 'in', 'on', 'by', 'at', 'x'}
MAX_SUBSET_QUERIES = 16

_PUNCT = re.compile(r'["\'“”‘’,;:()\[\]{}!?*]+')


# --- the words ------------------------------------------------------------------------------------------------------


def words_of(q: str) -> list[str]:
    """Lowercased words, punctuation taken off, at most MAX_WORDS; duplicates once."""
    out: list[str] = []
    for w in _PUNCT.sub(' ', (q or '').lower()).split():
        w = w.strip('.-/&+')
        if w and w not in out:
            out.append(w)
    kept = [w for w in out if w not in STOP_WORDS and len(w) > 1]
    return (kept or out)[:MAX_WORDS]


def looks_like_code(word: str) -> bool:
    """A UPC, SKU, item or product number: one token of 5+ characters with a digit in it."""
    return len(word) >= 5 and any(c.isdigit() for c in word) and ' ' not in word


def word_weights(words: list[str], lines: list[str]) -> dict[str, float]:
    """A rare word says more than a common one: "drum" over "toy". Weighed on the candidates themselves (1 to about 3)."""
    n = len(lines)
    if not n:
        return {w: 1.0 for w in words}
    return {w: 1.0 + math.log((n + 1) / (1 + sum(1 for line in lines if w in line))) for w in words}


def _in_order(words: list[str], text: str) -> bool:
    """Every word in the text, one after the other ("trash table" in "Trash to Table")."""
    at = 0
    for w in words:
        at = text.find(w, at)
        if at < 0:
            return False
        at += len(w)
    return True


def score(words: list[str], title: str, brand: str, search_text: str, weights: dict[str, float] | None = None) -> float:
    """How well a product answers the words. Pure, so the ranking is tested on its own.

    Every word found counts most, a rare word more than a common one; words in the title count again; the words
    together in the title, a title that starts with the first word and the brand named in the words add a little;
    a shorter title wins a tie.
    """
    if not words:
        return 0.0
    weights = weights or {}
    t = (title or '').lower()
    t_flat = t.replace(' ', '')
    all_flat = (search_text or '').lower().replace(' ', '') + t_flat
    found = sum(weights.get(w, 1.0) for w in words if w in all_flat)
    in_title = sum(weights.get(w, 1.0) for w in words if w in t_flat)
    s = found * 3.0 + in_title * 1.5
    phrase = ' '.join(words)
    if len(words) > 1 and _in_order(words, t):
        s += 3.0
    if t.startswith(words[0]):
        s += 1.0
    b = (brand or '').lower().strip()
    if b and b in phrase:
        s += 1.0
    s -= min(len(t), 200) / 400.0
    return s


# --- the queries ----------------------------------------------------------------------------------------------------


def _active():
    return Product.objects.filter(is_active=True)


def code_hits(tokens: Iterable[str]) -> list[int]:
    """Products whose code is exactly one of these tokens (UPC, SKU, item number, product number), or an item's SKU."""
    out: list[int] = []
    for token in tokens:
        tok = token.strip().lower()
        if not looks_like_code(tok):
            continue
        rows = _active().filter(search_text__contains=tok).values_list('pk', 'product_number', 'identifiers')[:25]
        for pk, number, idents in rows:
            values = {str(v).strip().lower() for v in (idents or {}).values() if v not in (None, '')}
            if tok == (number or '').lower() or tok in values:
                if pk not in out:
                    out.append(pk)
        # Item SKUs are stored in capitals (ITM0227173): an exact match uses the unique index.
        sku_pid = Item.objects.filter(sku=tok.upper(), product__is_active=True).values_list('product_id', flat=True).first()
        if sku_pid and sku_pid not in out:
            out.append(sku_pid)
    return out


def _candidates(words: list[str], take: int) -> list[tuple[int, str, str, str]]:
    qs = matching_words(_active(), words).annotate(pos=StrIndex('search_spaceless', Value(words[0])))
    return list(qs.order_by('pos').values_list('pk', 'title', 'brand', 'search_text')[:take])


def word_hits(words: list[str], want: int) -> list[tuple[int, str]]:
    """[(product id, why)] ranked: all the words first, then all but one word."""
    if not words:
        return []
    found: dict[int, tuple[str, str, str]] = {}
    for pk, title, brand, text in _candidates(words, CANDIDATES):
        found[pk] = (title, brand, text)
    # Too few: all but one word, then (four words or more) all but two, so a missing or extra word never empties it.
    queries = 0
    for drop in (1, 2):
        if len(found) >= want or len(words) < (2 if drop == 1 else 4):
            break
        for sub in combinations(words, len(words) - drop):
            if queries >= MAX_SUBSET_QUERIES:
                break
            queries += 1
            for pk, title, brand, text in _candidates(list(sub), SUBSET_EACH):
                found.setdefault(pk, (title, brand, text))
    flat_all = {pk: ((v[2] or '') + (v[0] or '')).lower().replace(' ', '') for pk, v in found.items()}
    weights = word_weights(words, list(flat_all.values()))
    ranked = sorted(found.items(), key=lambda kv: -score(words, kv[1][0], kv[1][1], kv[1][2], weights))
    return [(pk, WHY_ALL if all(w in flat_all[pk] for w in words) else WHY_MOST) for pk, _ in ranked]


def _model_ready() -> bool:
    try:
        from apps.inventory.services.product_vectors import _model
        return _model.cache_info().currsize > 0
    except Exception:
        return False


def near_hits(*, product_id: int | None = None, text: str | None = None, count: int = NEAR_COUNT) -> list[int]:
    """Products close in meaning: from a product's stored vector (fast), or from text when the model is loaded."""
    try:
        from pgvector.django import CosineDistance

        from apps.inventory.models import ProductVector
        from apps.inventory.services.product_vectors import MODEL_NAME, embed_texts

        vec = None
        if product_id is not None:
            own = ProductVector.objects.filter(product_id=product_id, model_name=MODEL_NAME).first()
            vec = own.embedding if own is not None else None
        elif text and _model_ready():
            vec = embed_texts([text[:300]])[0]
        if vec is None:
            return []
        # The bare nearest-first query walks the HNSW index; the model name is checked on what comes back.
        rows = (ProductVector.objects.annotate(distance=CosineDistance('embedding', vec))
                .order_by('distance').values_list('product_id', 'model_name', 'distance')[:count + 10])
        ids = [pid for pid, model, d in rows
               if model == MODEL_NAME and pid != product_id and 1 - float(d) >= NEAR_FLOOR]
        active = set(_active().filter(pk__in=ids).values_list('pk', flat=True))
        return [pid for pid in ids if pid in active][:count]
    except Exception:  # no vectors or no pgvector: nothing close in meaning
        return []


def spelling_hits(q: str, count: int = LIMIT) -> list[int]:
    return list(_active().filter(search_text__trigram_word_similar=q.lower()).values_list('pk', flat=True)[:count])


# --- what each result shows ----------------------------------------------------------------------------------------


def _money(v) -> str | None:
    return None if v is None else f'{v:.2f}'


def describe(ordered: list[tuple[int, str]], attached: set[int] | None = None) -> list[dict[str, Any]]:
    """Enough on each product to choose it: names, codes, category, and how it has gone in the store."""
    attached = attached or set()
    ids = [pk for pk, _ in ordered]
    if not ids:
        return []
    products = Product.objects.select_related('category').in_bulk(ids)
    stats = {
        r['product_id']: r for r in Item.objects.filter(product_id__in=ids).values('product_id').annotate(
            items=Count('pk'),
            on_shelf=Count('pk', filter=Q(status='on_shelf')),
            sold=Count('pk', filter=Q(sold_for__gt=0)),
            avg_sold=Avg('sold_for', filter=Q(sold_for__gt=0)),
            last_price=Max('price'),
        )
    }
    out = []
    for pk, why in ordered:
        p = products.get(pk)
        if p is None:
            continue
        s = stats.get(pk, {})
        idents = p.identifiers or {}
        out.append({
            'id': p.pk,
            'product_number': p.product_number,
            'title': p.title,
            'brand': p.brand,
            'model': p.model,
            'upc': str(idents.get('upc') or ''),
            'category': p.category.name if p.category_id else '',
            'items': s.get('items') or 0,
            'on_shelf': s.get('on_shelf') or 0,
            'sold': s.get('sold') or 0,
            'avg_sold': _money(s.get('avg_sold')),
            'last_price': _money(s.get('last_price')),
            'why': why,
            'on_this_row': pk in attached,
        })
    return out


def _add(into: list[tuple[int, str]], ids: Iterable[int], why: str, skip: set[int], limit: int) -> None:
    have = {pk for pk, _ in into}
    for pk in ids:
        if len(into) >= limit:
            return
        if pk in have or pk in skip:
            continue
        into.append((pk, why))
        have.add(pk)


# --- the two calls -------------------------------------------------------------------------------------------------


def find(q: str, *, limit: int = LIMIT, attached: Iterable[int] = ()) -> dict[str, Any]:
    """Typed words or a scanned code -> ranked products. Products already on the row are kept and marked, so a
    code that finds only them says so instead of finding nothing."""
    started = time.perf_counter()
    from apps.inventory.services.scan_code import sku_from_scan

    q = sku_from_scan((q or '').strip())[:200]
    words = words_of(q)
    on_row = set(attached)
    skip_set: set[int] = set()
    ordered: list[tuple[int, str]] = []
    _add(ordered, code_hits(words), WHY_CODE, skip_set, limit)
    # A code that was found is not also searched as a word.
    plain = [w for w in words if not (looks_like_code(w) and ordered)]
    hits = word_hits(plain, limit)
    _add(ordered, [pk for pk, _ in hits], '', skip_set, limit)
    whys = dict(hits)
    ordered = [(pk, why or whys.get(pk, WHY_MOST)) for pk, why in ordered]
    if len(ordered) < limit and ordered:
        _add(ordered, near_hits(product_id=ordered[0][0]), WHY_NEAR, skip_set, limit)
    elif not ordered and q:
        _add(ordered, near_hits(text=q), WHY_NEAR, skip_set, limit)
        # A code that matches nothing stays nothing: numbers that look alike are not alike.
        if not ordered and not (len(words) == 1 and looks_like_code(words[0])):
            _add(ordered, spelling_hits(q, limit), WHY_SPELLING, skip_set, limit)
    return {'q': q, 'results': describe(ordered, on_row), 'took_ms': round((time.perf_counter() - started) * 1000)}


def row_words(row: ProcessingRow) -> list[str]:
    """The row's brand and the start of its title: what a person would type."""
    title_words = words_of(row.title or '')[:5]
    brand_words = [w for w in words_of(row.brand or '') if w not in title_words]
    return (brand_words + title_words)[:6]


def likely(row: ProcessingRow, *, limit: int = LIKELY_LIMIT) -> dict[str, Any]:
    """The products this row most likely is, closest first. Products already on the row are left out."""
    started = time.perf_counter()
    skip = {int(k) for k in (row.product_links or {}).keys() if str(k).isdigit()}
    ordered: list[tuple[int, str]] = []
    codes = [str(v) for v in (row.identifiers or {}).values() if v not in (None, '')]
    by_code = code_hits(codes)
    _add(ordered, by_code, WHY_CODE, skip, limit)
    words = row_words(row)
    hits = word_hits(words, limit + len(skip)) if words else []
    _add(ordered, [pk for pk, _ in hits], '', skip, limit)
    whys = dict(hits)
    ordered = [(pk, why or whys.get(pk, WHY_MOST)) for pk, why in ordered]
    # Close in meaning to the best match, even when that product is already on the row; the first that has a vector.
    seeds = [row.matched_product_id] + by_code + [pk for pk, _ in hits[:3]]
    tried: set[int] = set()
    for seed in seeds:
        if len(ordered) >= limit:
            break
        if seed is None or seed in tried:
            continue
        tried.add(seed)
        near = near_hits(product_id=seed)
        if near:
            _add(ordered, near, WHY_NEAR, skip, limit)
            break
    # Still short: the row's first words (the brand, mostly), ranked by all the row's words.
    if len(ordered) < limit and len(words) > 2:
        found = [(pk, t, b, x) for pk, t, b, x in _candidates(words[:2], CANDIDATES)]
        found.sort(key=lambda r: -score(words, r[1], r[2], r[3]))
        _add(ordered, [pk for pk, *_ in found], WHY_MOST, skip, limit)
    return {'results': describe(ordered), 'took_ms': round((time.perf_counter() - started) * 1000)}
