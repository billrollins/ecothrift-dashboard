"""
Add item (owner, 2026-10-22): add something we sell that came from no purchase order (a Misfit), from Find item.
Built like Processing's check-in, and on the same code: the item is checked in on the year's Misfit order
(`services/misfit.py`) through `processing_add_item` + `processing_row_check_in`, so the retail check, labels and
restoration jobs are the ones Processing uses.

1. **Find the product** (`find`): one box. A scanned tag, product number, barcode or part number answers first; then
   the words, on `Product.search_text` (trigram index), spaces ignored like Inventory search ("barstool" finds
   "Bar Stool"). Each row has the photo, short name, typical price and times
   sold. Vectors are not used here: turning typed words into a vector needs the model, which the web server never
   loads. They are used for price comps (below) when the product has one.
2. **Not found: make the product.** Copy a near match and edit it, or AI fill (`ai_draft`): a rough title and an
   optional photo; the AI drafts title, brand, model, category and subcategory (the taxonomy's exact names) and a
   retail estimate; the person confirms. Through the AI router, logged as `inventory.add_item_ai`.
3. **Check in** (`check_in`): quantity, condition, where it goes (Floor, Back stock, Restoration), the price
   (`suggest_price`: what this product, or similar ones, sold for), the retail through the retail check. Restoration
   needs estimates: the work, hours or parts cost, and the value after.
4. Tags print like Processing's (`printed_items_preview`). Items are source `misfit`, with who and when.
"""
from __future__ import annotations

import base64
import json
import logging
import math
import re
import time
from decimal import Decimal
from statistics import median
from typing import Any

from django.contrib.postgres.search import TrigramWordSimilarity
from django.db import connection, transaction
from django.db.models import Count, Q, Value
from django.db.models.functions import StrIndex
from django.utils import timezone

from apps.inventory.models import Item, ItemCheckIn, Product, ProductProfile

logger = logging.getLogger(__name__)

AI_FEATURE = 'inventory.add_item_ai'
AI_PURPOSE = 'SUGGEST_PRODUCT'
RESULTS = 20
CANDIDATES = 300            # text matches ranked in full; a broader word is ordered by where it sits in the title
ID_KEYS = ('upc', 'ean', 'gtin', 'sku', 'mpn', 'item_number', 'asin')
BARCODE_KEYS = ('upc', 'ean', 'gtin')
DESTINATIONS = {'floor': 'on_shelf', 'back_stock': 'back_storage', 'restoration': 'restoration'}
OWN_SALES_ENOUGH = 2        # a product's own sales price it once it has this many; else similar products do
TITLE_MAX, SHORT_MAX = 120, 28
AI_IMAGE_EDGE = 1024


class AddItemError(ValueError):
    pass


def _words(q: str) -> list[str]:
    return [w for w in re.split(r'\s+', (q or '').lower().strip()) if w][:8]


def _url(field) -> str | None:
    try:
        return field.url if field else None
    except Exception:  # noqa: BLE001 - storage without a URL (tests)
        return None


# ── 1. Find ─────────────────────────────────────────────────────────────────

def _barcode_variants(q: str) -> set[str]:
    digits = re.sub(r'[\s-]', '', q)
    if not digits.isdigit() or len(digits) < 6:
        return set()
    core = digits.lstrip('0') or digits
    return {digits, core, core.zfill(12), core.zfill(13), core.zfill(14)}


def _exact(q: str) -> list[tuple[int, str, str]]:
    """(product id, match kind, matched tag) for identifiers typed or scanned whole."""
    q = q.strip()
    if not q or ' ' in q:
        return []
    out: list[tuple[int, str, str]] = []
    for sku, pid in Item.objects.filter(sku__in={q, q.upper()}).values_list('sku', 'product_id')[:1]:
        out.append((pid, 'tag', sku))
    for pid in Product.objects.filter(product_number__in={q, q.upper()}).values_list('pk', flat=True)[:1]:
        out.append((pid, 'product_number', ''))
    cond = Q()
    variants = _barcode_variants(q)
    for key in ID_KEYS:
        for value in (variants if key in BARCODE_KEYS else {q}):
            cond |= Q(identifiers__contains={key: value})
    for pid, ids in Product.objects.filter(cond, is_active=True).values_list('pk', 'identifiers')[:10]:
        ids = ids if isinstance(ids, dict) else {}
        kind = 'barcode' if any(str(ids.get(k) or '') in variants for k in BARCODE_KEYS) else 'part_number'
        out.append((pid, kind, ''))
    if len(q) >= 3 and re.search(r'\d', q):
        # A model number has a digit ("toy" is a word, even when some product's model says Toy).
        model_hits =Product.objects.filter(is_active=True, search_text__contains=q.lower(), model__iexact=q)
        out.extend((pid, 'model', '') for pid in model_hits.values_list('pk', flat=True)[:10])
    seen: set[int] = set()
    return [h for h in out if not (h[0] in seen or seen.add(h[0]))]


def _counts(ids: list[int]) -> dict[int, dict[str, int]]:
    rows = Item.objects.filter(product_id__in=ids).values('product_id').annotate(
        items=Count('id'), on_shelf=Count('id', filter=Q(status='on_shelf')),
        sold=Count('id', filter=Q(sold_at__isnull=False)),
    )
    return {r['product_id']: r for r in rows}


def _medians(ids: list[int]) -> dict[int, dict[str, Decimal | None]]:
    """Typical sold price, shelf price and retail per product (medians, so one odd sale does not move it)."""
    if not ids:
        return {}
    sql = """
        SELECT product_id,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY sold_for) FILTER (WHERE sold_at IS NOT NULL AND sold_for > 0),
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FILTER (WHERE status = 'on_shelf' AND price > 0),
               percentile_cont(0.5) WITHIN GROUP (ORDER BY retail) FILTER (WHERE retail > 0)
        FROM inventory_item WHERE product_id = ANY(%s) GROUP BY product_id
    """
    with connection.cursor() as cur:
        cur.execute(sql, [list(ids)])
        rows = cur.fetchall()

    def money(v):
        return Decimal(str(v)).quantize(Decimal('0.01')) if v is not None else None

    return {pid: {'sold': money(s), 'shelf': money(p), 'retail': money(r)} for pid, s, p, r in rows}


def _photos(products: list[Product]) -> dict[int, str]:
    """The product's own photo, else a Social Studio photo of one of its items."""
    out = {p.pk: url for p in products if (url := _url(p.photo_thumb) or _url(p.photo))}
    missing = [p.pk for p in products if p.pk not in out]
    if missing:
        from django.core.files.storage import default_storage

        from apps.marketing.models import SocialPhoto

        rows = (SocialPhoto.objects.filter(item__product_id__in=missing, is_archived=False)
                .order_by('-uploaded_at').values_list('item__product_id', 'thumbnail', 'image')[:200])
        for pid, thumb, image in rows:
            if pid not in out and (thumb or image):
                try:
                    out[pid] = default_storage.url(thumb or image)
                except Exception:  # noqa: BLE001 - storage without a URL (tests)
                    pass
    return out


_SUBJECT_END = re.compile(r'\s(?:for|with|compatible with|fits)\s')


def _score(p: Product, words: list[str], counts: dict) -> float:
    """Words in what the product is count most ("Beater for KitchenAid Mixer" is a beater), the whole phrase more,
    a name close to what was typed more; then its brand; then how often it sold and what is on the shelf."""
    profile = getattr(p, 'profile', None)
    title = ((profile.display_title if profile and profile.display_title else p.title) or '').lower()
    subject = _SUBJECT_END.split(title, maxsplit=1)[0]
    phrase = ' '.join(words)
    score = 4.0 if subject.startswith(phrase) else 3.0 if phrase in subject else 1.0 if phrase in title else 0.0
    # Spaces ignored, as the search does: "barstool" is in "bar stool".
    subject_ns, title_ns = subject.replace(' ', ''), title.replace(' ', '')
    score += sum(2.0 if w in subject_ns else 0.5 if w in title_ns else 0.0 for w in words) / max(1, len(words))
    score += len(phrase) / max(len(subject), len(phrase), 1)
    brand = ((profile.brand if profile and profile.brand else p.brand) or '').lower()
    if brand and brand != 'generic' and (brand in words or phrase.startswith(brand)):
        score += 1.0
    c = counts.get(p.pk) or {}
    return score + 0.6 * math.log1p(c.get('sold') or 0) + 0.2 * math.log1p(c.get('on_shelf') or 0)


def _row(p: Product, *, counts: dict, medians: dict, photos: dict, match: str, matched_sku: str = '') -> dict:
    profile = getattr(p, 'profile', None)
    c, m = counts.get(p.pk) or {}, medians.get(p.pk) or {}
    return {
        'product_id': p.pk,
        'product_number': p.product_number or '',
        'title': (profile.display_title if profile and profile.display_title else p.title),
        'short_name': profile.short_name if profile else '',
        'brand': (profile.brand if profile and profile.brand else p.brand) or '',
        'model': p.model or '',
        'category': profile.category if profile and profile.category else (p.category.name if p.category_id else ''),
        'subcategory': profile.subcategory if profile else '',
        'photo_url': photos.get(p.pk),
        'typical_price': m.get('sold') or m.get('shelf'),
        'typical_price_from': 'sold' if m.get('sold') is not None else 'shelf' if m.get('shelf') is not None else '',
        'typical_retail': m.get('retail'),
        'sold': c.get('sold') or 0,
        'on_shelf': c.get('on_shelf') or 0,
        'items': c.get('items') or 0,
        'match': match,
        'matched_sku': matched_sku,
    }


def _products(ids: list[int]) -> dict[int, Product]:
    qs = Product.objects.filter(pk__in=ids).select_related('profile', 'category').defer('search_text')
    return {p.pk: p for p in qs}


def find(q: str, *, limit: int = RESULTS) -> dict[str, Any]:
    """Products for the Add item box: exact identifiers first, then words, then the closest spellings."""
    started = time.perf_counter()
    q = (q or '').strip()[:200]
    words = _words(q)
    exact = _exact(q)
    exact_ids = [pid for pid, _k, _s in exact]

    text_ids: list[int] = []
    fuzzy = False
    long_words = [w for w in words if len(w) >= 3]
    # A scanned tag, barcode or product number is the answer; a model or part number also shows what mentions it.
    if long_words and not any(kind in ('tag', 'barcode', 'product_number') for _p, kind, _s in exact):
        # Only words of 3+ letters reach the trigram index; shorter ones are checked on the candidates.
        from apps.inventory.services.inventory_search import matching_words

        qs = matching_words(Product.objects.filter(is_active=True).exclude(pk__in=exact_ids), long_words)
        rows = list(qs.annotate(pos=StrIndex('search_spaceless', Value(long_words[0])))
                    .order_by('pos', '-pk').values_list('pk', 'search_spaceless')[:CANDIDATES])
        short = [w for w in words if len(w) < 3]
        text_ids = [pk for pk, text in rows if all(w in (text or '') for w in short)]
        if not text_ids and not exact_ids and len(q) >= 4:
            close = (Product.objects.filter(is_active=True, search_text__trigram_word_similar=q)
                     .annotate(sim=TrigramWordSimilarity(q, 'search_text')).order_by('-sim', '-pk'))
            text_ids, fuzzy = list(close.values_list('pk', flat=True)[:limit]), True

    counts = _counts(exact_ids + text_ids)
    products = _products(exact_ids + text_ids)
    ranked = [products[pk] for pk in text_ids if pk in products]
    if not fuzzy:
        ranked.sort(key=lambda p: (-_score(p, words, counts), -p.pk))
    ranked = ranked[:max(0, limit - len(exact))]
    shown = [products[pk] for pk in exact_ids if pk in products] + ranked
    medians = _medians([p.pk for p in shown])
    photos = _photos(shown)
    kinds = {pid: (kind, sku) for pid, kind, sku in exact}
    results = [
        _row(p, counts=counts, medians=medians, photos=photos,
             match=kinds.get(p.pk, ('close' if fuzzy else 'text', ''))[0], matched_sku=kinds.get(p.pk, ('', ''))[1])
        for p in shown
    ]
    return {'q': q, 'results': results, 'fuzzy': fuzzy, 'took_ms': round((time.perf_counter() - started) * 1000)}


# ── 3. Price from what similar items sold for ──────────────────────────────
#
# Similar items (Dash Updates #104; replaces a title-words match that priced a $499 stand mixer from $14 mixer mats
# and $200 earbuds from $10 no-name ones). A comp is a sold item that is
#   1. the same kind of thing: the same taxonomy category, and the same subcategory when that has enough sales;
#   2. at a similar retail: the item's own retail from half to double this one's (``RETAIL_BAND``); and
#   3. among the nearest by meaning: by the product's stored vector when it has one (exact cosine over the band's
#      products, a few hundred rows at most, so no model loads; only those close to the nearest one), else by the
#      title's trigram similarity (a new product has no vector yet).
# The suggestion is the comps' median share of retail (sold for / retail) times this retail: the band is wide, and
# the share carries across it. Fewer than ``MIN_COMP_ITEMS`` sales from ``MIN_COMP_PRODUCTS`` products, or no retail
# to make a band from, and there is no suggestion (``missing`` says why): nothing is better than a wrong number.

RETAIL_BAND = (Decimal('0.5'), Decimal('2'))
COMP_PRODUCTS = 8           # the nearest products kept as comps
MIN_COMP_ITEMS = 3          # sold items the suggestion needs, from at least
MIN_COMP_PRODUCTS = 2       # this many products
MEANING_FLOOR = 0.6         # cosine similarity a comp needs when ranked by vector, and it must be within
MEANING_WINDOW = 0.1        # this of the nearest one (stand mixers sit at 0.86-0.91; the bread maker after, 0.75)
TITLE_FLOOR = 0.15          # trigram similarity a comp needs when ranked by title


def _sold_prices(ids: list[int], cap: int = 200) -> list[Decimal]:
    return list(Item.objects.filter(product_id__in=ids, sold_at__isnull=False, sold_for__gt=0)
                .order_by('-sold_at').values_list('sold_for', flat=True)[:cap])


def _cents(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal('0.01'))


def _band_pool(retail: Decimal, category: str, subcategory: str, exclude: int | None) -> dict[int, dict[str, Any]]:
    """Sold items in the category (and subcategory) whose own retail is in the band, grouped by product."""
    lo, hi = retail * RETAIL_BAND[0], retail * RETAIL_BAND[1]
    sql = """
        SELECT i.product_id, count(*),
               percentile_cont(0.5) WITHIN GROUP (ORDER BY i.sold_for),
               percentile_cont(0.5) WITHIN GROUP (ORDER BY i.retail),
               array_agg(i.sold_for / i.retail)
        FROM inventory_item i JOIN inventory_productprofile pp ON pp.product_id = i.product_id
        WHERE i.sold_at IS NOT NULL AND i.sold_for > 0 AND i.retail BETWEEN %s AND %s
          AND pp.category = %s AND (%s = '' OR pp.subcategory = %s) AND i.product_id <> %s
        GROUP BY i.product_id
    """
    with connection.cursor() as cur:
        cur.execute(sql, [lo, hi, category, subcategory, subcategory, exclude or 0])
        return {pid: {'sold': n, 'typical_price': _cents(s), 'typical_retail': _cents(r), 'shares': list(shares)}
                for pid, n, s, r, shares in cur.fetchall()}


def _nearest(product: Product | None, title: str, ids: list[int]) -> tuple[list[int], str]:
    """The pool's products nearest this one, best first: by stored vector when it has one, else by title."""
    if not ids:
        return [], ''
    if product is not None:
        from apps.inventory.services.product_vectors import MODEL_NAME

        with connection.cursor() as cur:
            cur.execute("""
                SELECT o.product_id, 1 - (o.embedding <=> s.embedding) AS sim
                FROM inventory_productvector o
                JOIN inventory_productvector s ON s.product_id = %s AND s.model_name = %s
                WHERE o.model_name = %s AND o.product_id = ANY(%s)
                ORDER BY sim DESC
            """, [product.pk, MODEL_NAME, MODEL_NAME, ids])
            rows = [(pid, sim) for pid, sim in cur.fetchall() if sim is not None and sim >= MEANING_FLOOR]
            near = [pid for pid, sim in rows if sim >= rows[0][1] - MEANING_WINDOW] if rows else []
        if near:
            return near, 'vector'
    title = (title or (product.title if product else '')).strip()
    if len(title) < 3:
        return [], ''
    with connection.cursor() as cur:
        cur.execute('SELECT id, similarity(title, %s) AS sim FROM inventory_product WHERE id = ANY(%s) '
                    'ORDER BY sim DESC, id DESC', [title, ids])
        return [pid for pid, sim in cur.fetchall() if sim >= TITLE_FLOOR], 'title'


def _similar_items(product: Product | None, title: str, category: str, subcategory: str,
                   retail: Decimal) -> tuple[list[int], dict[int, dict[str, Any]], str]:
    """The comp products (nearest first), the band's sales by product, and how they were ranked."""
    exclude = product.pk if product is not None else None
    if subcategory:
        pool = _band_pool(retail, category, subcategory, exclude)
        ids, method = _nearest(product, title, list(pool))
        if sum(pool[pid]['sold'] for pid in ids[:COMP_PRODUCTS]) >= MIN_COMP_ITEMS:
            return ids[:COMP_PRODUCTS], pool, method
    pool = _band_pool(retail, category, '', exclude)       # no subcategory, or too few sales in it: the category
    ids, method = _nearest(product, title, list(pool))
    return ids[:COMP_PRODUCTS], pool, method


def suggest_price(*, product_id: int | None = None, title: str = '', category: str = '', subcategory: str = '',
                  retail=None) -> dict[str, Any]:
    """A shelf price from what this product sold for, or from what items like it, at a similar retail, sold for."""
    product = Product.objects.filter(pk=product_id).select_related('profile').first() if product_id else None
    profile = getattr(product, 'profile', None) if product is not None else None
    if profile is not None and not category:
        category, subcategory = profile.category or '', profile.subcategory or ''
    own = _sold_prices([product.pk]) if product is not None else []
    out: dict[str, Any] = {'price': None, 'basis': '', 'sold_count': 0, 'comps': [], 'method': '',
                           'retail_used': None, 'share_of_retail': None, 'missing': ''}
    if len(own) >= OWN_SALES_ENOUGH:
        out.update(price=_cents(median(own)), basis='this product', sold_count=len(own), method='own')
        return out
    try:
        retail = _cents(retail) if retail not in (None, '') else None
    except ArithmeticError:   # an unreadable retail is no retail
        retail = None
    if (retail is None or retail <= 0) and product is not None:
        retail = (_medians([product.pk]).get(product.pk) or {}).get('retail')   # what its items carry
    if retail is None or retail <= 0:
        out['missing'] = 'retail'
    elif not category or category.startswith('Mixed'):
        out['missing'] = 'category'
    else:
        ids, pool, method = _similar_items(product, title, category, subcategory, retail)
        shares = [float(s) for pid in ids for s in pool[pid]['shares']]
        if len(shares) >= MIN_COMP_ITEMS and len(ids) >= MIN_COMP_PRODUCTS:
            share = Decimal(str(median(shares)))
            names = {p.pk: p for p in Product.objects.filter(pk__in=ids).select_related('profile').defer('search_text')}
            out['comps'] = [
                {'product_id': pk,
                 'title': (names[pk].profile.display_title if hasattr(names[pk], 'profile')
                           and names[pk].profile.display_title else names[pk].title),
                 'sold': pool[pk]['sold'], 'typical_price': pool[pk]['typical_price'],
                 'typical_retail': pool[pk]['typical_retail']}
                for pk in ids if pk in names
            ]
            out.update(price=_cents(retail * share), basis='similar items', sold_count=len(shares), method=method,
                       retail_used=retail, share_of_retail=round(float(share) * 100))
            return out
        out['missing'] = 'match'
    if own:
        out.update(price=own[0], basis='this product', sold_count=len(own), method='own')
    return out


# ── 2b. AI fill ─────────────────────────────────────────────────────────────

def taxonomy() -> dict[str, list[str]]:
    from apps.inventory.services import standardize as std

    return std.canon()


AI_DRAFT_INTRO = ('From a rough title (and a photo when there is one), draft the product the way the store\'s catalog '
                  'writes it. Call the tool `draft_product`.')


def _ai_system_prompt(cats: dict[str, list[str]], intro: str = AI_DRAFT_INTRO) -> str:
    from apps.inventory.services import standardize as std

    tax = std.TAXONOMY.read_text(encoding='utf-8')
    return f"""You help a thrift store add one product it has in hand. {intro}

# How to place an item
{std._section(tax, 'How to place an item (in order)')}

# Categories and subcategories (use these exact names; the subcategory must be one listed for its category)
{std._section(tax, 'Categories and subcategories')}

# Rulings (these win)
{std._section(tax, 'Rulings')}

# The fields
- title: brand (when known and not Generic), the product line or model name, what it is, then key product specs.
  Title Case, at most {TITLE_MAX} characters. No colors, condition words or marketing words.
- short_name: the price-tag name, at most {SHORT_MAX} characters, brand first when it is a real brand.
- brand: the consumer brand on the box, correctly cased; "Generic" when there is none. Never invent one.
- model: the base model number when the title or photo shows one, else "".
- category, subcategory: the exact names above.
- retail_estimate: what this product sells for new in a US store today, in dollars (a number), or 0 when you
  cannot tell.
- confidence: high, medium or low. Low when the title is vague and the photo does not settle it."""


def _ai_tool(cats: dict[str, list[str]]) -> dict:
    return {
        'name': 'draft_product',
        'description': 'The drafted product.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string'},
                'short_name': {'type': 'string'},
                'brand': {'type': 'string'},
                'model': {'type': 'string'},
                'category': {'type': 'string', 'enum': sorted(cats)},
                'subcategory': {'type': 'string'},
                'retail_estimate': {'type': 'number'},
                'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']},
            },
            'required': ['title', 'brand', 'category', 'subcategory', 'confidence'],
        },
    }


def _clean_draft(raw: dict, cats: dict[str, list[str]]) -> tuple[dict, list[str]]:
    problems: list[str] = []
    category = str(raw.get('category') or '').strip()
    if category not in cats:
        problems.append('Pick a category.')
        category = ''
    subcategory = str(raw.get('subcategory') or '').strip()
    if subcategory not in cats.get(category, []):
        if cats.get(category):
            problems.append('Pick a subcategory.')
        subcategory = ''
    try:
        retail = Decimal(str(raw.get('retail_estimate'))).quantize(Decimal('0.01'))
        retail = retail if Decimal('0') < retail < Decimal('100000') else None
    except Exception:  # noqa: BLE001 - null or not a number
        retail = None
    confidence = str(raw.get('confidence') or '').strip().lower()
    return {
        'title': str(raw.get('title') or '').strip()[:TITLE_MAX],
        'short_name': str(raw.get('short_name') or '').strip()[:SHORT_MAX],
        'brand': str(raw.get('brand') or '').strip()[:200] or 'Generic',
        'model': str(raw.get('model') or '').strip()[:200],
        'category': category,
        'subcategory': subcategory,
        'retail_estimate': retail,
        'confidence': confidence if confidence in ('high', 'medium', 'low') else 'low',
    }, problems


def ai_image_block(raw: bytes) -> dict:
    """A photo as an image block for the router (1024 px JPEG)."""
    from apps.inventory.services.receiving_photos import _open_image, _resize_max_edge, encode_jpeg

    img = _resize_max_edge(_open_image(raw), AI_IMAGE_EDGE)
    data = base64.b64encode(encode_jpeg(img, quality=85)).decode('ascii')
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': data}}


def ai_draft(title: str, *, image: dict | None = None) -> dict[str, Any]:
    """The AI's draft of a new product from a rough title and an optional photo. The person confirms it."""
    from apps.core.ai_config import ai_effort, ai_model
    from apps.core.services.ai_usage_log import log_ai_usage
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

    title = (title or '').strip()[:300]
    if not title and image is None:
        raise AddItemError('Type a rough title or add a photo.')
    cats = taxonomy()
    content: list[dict] = [{'type': 'text', 'text': json.dumps({'rough_title': title or '(none: see the photo)'})}]
    if image is not None:
        content.append(image)
    model_id = ai_model(AI_PURPOSE)
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model_id, system=_ai_system_prompt(cats), messages=[{'role': 'user', 'content': content}],
            tools=[_ai_tool(cats)], tool_name='draft_product', max_tokens=1024, effort=ai_effort(AI_PURPOSE),
            timeout=60.0, log_source=AI_FEATURE, log_purpose=AI_PURPOSE,
            log_detail='Add item AI fill' + (' with photo' if image is not None else ''),
        )
    except (LLMAPIError, LLMConfigError) as exc:
        log_ai_usage(AI_FEATURE, model_id, purpose=AI_PURPOSE, duration_ms=int((time.monotonic() - started) * 1000),
                     detail='Add item AI fill', success=False, error=str(exc)[:500])
        raise AddItemError('The AI could not draft this one. Try again, or fill it in by hand.') from exc
    raw = result.tool_input
    if raw is None:
        from apps.inventory.services.category_taxonomy import extract_json_object

        try:
            raw = extract_json_object(result.text or '')
        except Exception:  # noqa: BLE001 - nothing usable came back
            raise AddItemError('The AI answer was not usable. Try again, or fill it in by hand.')
    draft, problems = _clean_draft(raw, cats)
    return {'draft': draft, 'problems': problems, 'model': result.model_used}


# ── 2c. Clean up with AI (Dash Updates #96, owner 2026-11-11) ───────────────
# "Dump anything": one big box of whatever the person knows (a pasted web page, a model number, a sentence), any
# photos, and any boxes already filled. One call fills the rest. A box the person filled always wins: the AI only
# fills what is empty, and a list (identifiers, specifications) only gets the keys the person left out.

CLEAN_UP_DETAIL = 'Add item: Clean up with AI'
CLEAN_UP_TEXT_MAX = 12000         # a pasted product page is cut here; the start carries the facts
CLEAN_UP_PHOTOS_MAX = 4
# Settings > AI picks the model for SUGGEST_PRODUCT. With none picked, the house volume model (Spark Contributor,
# which reads photos through the router's OpenAI-style image blocks) does it, not the .env fallback.
CLEAN_UP_DEFAULT_MODEL = 'muse-spark-1.3-contributor'
CLEAN_UP_DEFAULT_EFFORT = 'low'
CONDITIONS = ('new', 'like_new', 'very_good', 'good', 'fair')
TEXT_FIELDS = ('title', 'short_name', 'brand', 'model', 'category', 'subcategory', 'upc', 'condition')
MONEY_FIELDS = ('price', 'retail_estimate')
DICT_FIELDS = ('identifiers', 'specifications')
CLEAN_UP_FIELDS = TEXT_FIELDS + MONEY_FIELDS + DICT_FIELDS + ('tags',)


def clean_up_model() -> tuple[str, str]:
    """(model id, effort) for Clean up with AI: Settings > AI when a model is picked there, else Spark Contributor."""
    from apps.core.ai_config import ai_effort, ai_model, settings_model

    model_id = ai_model(AI_PURPOSE)
    if model_id == settings_model(AI_PURPOSE):     # nothing picked in Settings > AI
        return CLEAN_UP_DEFAULT_MODEL, CLEAN_UP_DEFAULT_EFFORT
    effort = ai_effort(AI_PURPOSE)
    return model_id, effort


def _clean_up_prompt(cats: dict[str, list[str]]) -> str:
    return _ai_system_prompt(cats, intro=(
        'A staff member dumped what they know about it: maybe a pasted web page, a model number, a sentence, a list, '
        'and maybe photos. Some boxes may already be filled (`already_filled`): treat those as true and make the rest '
        'agree with them. Draft the product the way the store\'s catalog writes it. Call the tool `clean_up_product`.'
    )) + f"""
- condition: one of {', '.join(CONDITIONS)}, only when the words or photos say it (sealed or new in box is new;
  "open box" is like_new); else "".
- tags: up to 8 short lowercase search words a shopper might type that are not already in the title.
- identifiers: only ones written in the dump or readable in a photo (upc, ean, mpn, sku, asin, item_number). Never
  invent a number.
- upc: the 12 or 13 digit barcode number when one is written or readable, else "".
- specifications: up to 8 short facts that matter to a buyer (size, capacity, wattage, material, color, what is in
  the box), as name: value. Only what the dump or photos show.
- price: what a thrift store asks for it used and in the condition given, in dollars, or 0 when you cannot tell.
  Our store usually starts near half of retail for good condition."""


def _clean_up_tool(cats: dict[str, list[str]]) -> dict:
    tool = _ai_tool(cats)
    props = dict(tool['input_schema']['properties'])
    props.update({
        'upc': {'type': 'string'},
        'condition': {'type': 'string', 'enum': [*CONDITIONS, '']},
        'tags': {'type': 'array', 'items': {'type': 'string'}},
        'identifiers': {'type': 'object', 'additionalProperties': {'type': 'string'}},
        'specifications': {'type': 'object', 'additionalProperties': {'type': 'string'}},
        'price': {'type': 'number'},
    })
    return {'name': 'clean_up_product', 'description': 'The cleaned-up product.',
            'input_schema': {**tool['input_schema'], 'properties': props}}


def _text(value, limit: int = 300) -> str:
    return str(value or '').strip()[:limit] if not isinstance(value, (dict, list)) else ''


def _amount(value) -> Decimal | None:
    try:
        amount = Decimal(str(value).replace('$', '').replace(',', '').strip()).quantize(Decimal('0.01'))
    except Exception:  # noqa: BLE001 - null or not a number
        return None
    return amount if Decimal('0') < amount < Decimal('100000') else None


def _pairs(value, *, limit: int = 12) -> dict[str, str]:
    """A name: value object, cleaned (blank names and values dropped, short strings)."""
    if not isinstance(value, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in value.items():
        key, val = _text(k, 60), _text(v, 200)
        if key and val and not isinstance(v, (dict, list)):
            out[key] = val
        if len(out) >= limit:
            break
    return out


def _tag_list(value) -> list[str]:
    raw = value.split(',') if isinstance(value, str) else value if isinstance(value, list) else []
    out: list[str] = []
    for t in raw:
        tag = _text(t, 40).lower()
        if tag and tag not in out:
            out.append(tag)
    return out[:12]


def _typed_values(typed: dict) -> dict[str, Any]:
    """What the person already filled, cleaned. Empty boxes are left out."""
    typed = typed if isinstance(typed, dict) else {}
    out: dict[str, Any] = {}
    for f in TEXT_FIELDS:
        v = _text(typed.get(f))
        if v:
            out[f] = v
    for f in MONEY_FIELDS:
        v = _amount(typed.get(f)) if typed.get(f) not in (None, '') else None
        if v is not None:
            out[f] = v
    for f in DICT_FIELDS:
        v = _pairs(typed.get(f))
        if v:
            out[f] = v
    tags = _tag_list(typed.get('tags'))
    if tags:
        out['tags'] = tags
    return out


def _ai_values(raw: dict, cats: dict[str, list[str]], typed: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """The AI's answer, cleaned to our rules. A category the person typed decides which subcategories are allowed."""
    category = _text(raw.get('category'), 100)
    category = category if category in cats else ''
    allowed_in = typed.get('category') if typed.get('category') in cats else category
    subcategory = _text(raw.get('subcategory'), 100)
    subcategory = subcategory if subcategory in cats.get(allowed_in, []) else ''
    condition = _text(raw.get('condition'), 20).lower()
    upc = re.sub(r'\D', '', _text(raw.get('upc'), 20))
    brand = _text(raw.get('brand'), 200)
    confidence = _text(raw.get('confidence'), 10).lower()
    return {
        'title': _text(raw.get('title'), TITLE_MAX),
        'short_name': _text(raw.get('short_name'), SHORT_MAX),
        'brand': brand if brand.lower() != 'generic' else 'Generic',
        'model': _text(raw.get('model'), 200),
        'category': category,
        'subcategory': subcategory,
        'upc': upc if len(upc) in (12, 13) else '',
        'condition': condition if condition in CONDITIONS else '',
        'price': _amount(raw.get('price')),
        'retail_estimate': _amount(raw.get('retail_estimate')),
        'identifiers': _pairs(raw.get('identifiers')),
        'specifications': _pairs(raw.get('specifications')),
        'tags': _tag_list(raw.get('tags'))[:8],
    }, confidence if confidence in ('high', 'medium', 'low') else 'low'


def merge_clean_up(typed: dict[str, Any], ai: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """The person's boxes win. The AI fills an empty box; a name: value list only gets the names left out.
    Returns the merged values and the fields the AI filled (or added to)."""
    merged: dict[str, Any] = {}
    filled: list[str] = []
    for f in CLEAN_UP_FIELDS:
        mine, theirs = typed.get(f), ai.get(f)
        if f in DICT_FIELDS:
            mine = dict(mine or {})
            extra = {k: v for k, v in (theirs or {}).items() if k.lower() not in {m.lower() for m in mine}}
            merged[f] = {**mine, **extra}
            if extra:
                filled.append(f)
        elif mine not in (None, '', [], {}):
            merged[f] = mine
        elif theirs not in (None, '', [], {}):
            merged[f] = theirs
            filled.append(f)
        else:
            merged[f] = [] if f == 'tags' else None if f in MONEY_FIELDS else ''
    return merged, filled


def clean_up(text: str, typed: dict | None = None, *, images: list[dict] | None = None) -> dict[str, Any]:
    """Clean up with AI: the big box, the photos and the filled boxes in; every box out, the person's untouched.
    Raises AddItemError with plain words (nothing to go on, or the AI failed): the form is never changed then."""
    from apps.core.services.ai_usage_log import log_ai_usage
    from apps.core.services.llm_router import LLMAPIError, LLMConfigError, llm_complete

    text = (text or '').strip()[:CLEAN_UP_TEXT_MAX]
    images = list(images or [])[:CLEAN_UP_PHOTOS_MAX]
    mine = _typed_values(typed or {})
    if not text and not images and not mine:
        raise AddItemError('Give the AI something to go on: type or paste anything you know about it, or add a photo.')
    cats = taxonomy()
    content: list[dict] = [{'type': 'text', 'text': json.dumps({
        'anything_you_know': text or '(nothing typed: see the photos and the filled boxes)',
        'already_filled': {k: (str(v) if isinstance(v, Decimal) else v) for k, v in mine.items()},
        'photos': len(images),
    }, ensure_ascii=False)}]
    content.extend(images)
    model_id, effort = clean_up_model()
    detail = f'{CLEAN_UP_DETAIL} ({len(images)} photo{"" if len(images) == 1 else "s"}, {len(text)} chars)'
    started = time.monotonic()
    try:
        result = llm_complete(
            model_id=model_id, system=_clean_up_prompt(cats), messages=[{'role': 'user', 'content': content}],
            tools=[_clean_up_tool(cats)], tool_name='clean_up_product', max_tokens=1500, effort=effort,
            timeout=60.0, log_source=AI_FEATURE, log_purpose=AI_PURPOSE, log_detail=detail,
        )
    except (LLMAPIError, LLMConfigError) as exc:
        log_ai_usage(AI_FEATURE, model_id, purpose=AI_PURPOSE, duration_ms=int((time.monotonic() - started) * 1000),
                     detail=detail, success=False, error=str(exc)[:500])
        raise AddItemError('The AI could not clean this one up right now. Your boxes are as you left them: '
                           'try again, or fill them in by hand.') from exc
    raw = result.tool_input
    if raw is None:
        from apps.inventory.services.category_taxonomy import extract_json_object

        try:
            raw = extract_json_object(result.text or '')
        except Exception:  # noqa: BLE001 - nothing usable came back
            raise AddItemError('The AI answer was not usable. Your boxes are as you left them: try again, '
                               'or fill them in by hand.')
    ai, confidence = _ai_values(raw if isinstance(raw, dict) else {}, cats, mine)
    merged, filled = merge_clean_up(mine, ai)
    if merged['subcategory'] and merged['subcategory'] not in cats.get(merged['category'], []):
        if 'subcategory' in filled:
            filled.remove('subcategory')
        merged['subcategory'] = ''

    # The price to start: the AI's (it knows the product) when it gives one. Our sales of "similar items" are matched
    # by title words and can be far off (a $200 pair of earbuds got $11 from cheap ones), so they fill in only when
    # the AI cannot tell. The check-in step still shows that sales figure beside the price, with "Use it".
    price_from = 'typed' if 'price' in mine else 'the AI' if merged['price'] is not None else ''
    if 'price' not in mine and merged['price'] is None:
        try:
            ours = suggest_price(title=merged['title'] or text[:120], category=merged['category'],
                                     subcategory=merged['subcategory'], retail=merged['retail_estimate'])
        except Exception:  # noqa: BLE001 - the price lookup never fails the clean-up
            logger.exception('Add item clean-up: price lookup failed')
            ours = {'price': None}
        if ours.get('price'):
            merged['price'] = ours['price']
            price_from = f"our sales of {ours.get('basis') or 'similar items'}"
            filled.append('price')

    problems: list[str] = []
    if not merged['category']:
        problems.append('Pick a category.')
    elif cats.get(merged['category']) and not merged['subcategory']:
        problems.append('Pick a subcategory.')
    if not merged['title']:
        problems.append('Give it a title.')
    return {'values': merged, 'filled': filled, 'ai': ai, 'problems': problems, 'confidence': confidence,
            'price_from': price_from, 'model': result.model_used}


# ── Make the product (copy similar, AI fill, or typed) ─────────────────────

def _new_product(spec: dict, *, user) -> tuple[Product, dict]:
    """Make (or find, when the same product already exists) the confirmed new product. Returns the product and what
    to remember about where it came from."""
    from apps.inventory.services.manual_item import find_or_create_product_for_manual_item
    from apps.inventory.services.product_profile import set_field

    cats = taxonomy()
    title = str(spec.get('title') or '').strip()[:300]
    if not title:
        raise AddItemError('The new product needs a title.')
    category = str(spec.get('category') or '').strip()
    if category not in cats:
        raise AddItemError('Pick a category from the list.')
    subcategory = str(spec.get('subcategory') or '').strip()
    if subcategory and subcategory not in cats[category]:
        raise AddItemError(f'"{subcategory}" is not a subcategory of {category}.')
    if not subcategory and cats[category]:
        raise AddItemError('Pick a subcategory.')
    brand = str(spec.get('brand') or '').strip()[:200] or 'Generic'
    model = str(spec.get('model') or '').strip()[:200]
    fields = {'display_title': title[:TITLE_MAX], 'brand': brand, 'model_number': model, 'category': category,
              'subcategory': subcategory, 'short_name': str(spec.get('short_name') or '').strip()[:SHORT_MAX]}
    retail_estimate = _money(spec.get('retail_estimate'), 'retail estimate')
    if retail_estimate:
        fields['retail_estimate'] = retail_estimate

    started = timezone.now()
    product = find_or_create_product_for_manual_item(
        title=title, brand=brand, category=category, model=model, upc=str(spec.get('upc') or '').strip(),
    )
    created = product.created_at is not None and product.created_at >= started
    ai = spec.get('ai') if isinstance(spec.get('ai'), dict) else {}
    ai_model_used = str(ai.get('model') or '').strip()[:80]
    ai_values = ai.get('draft') if isinstance(ai.get('draft'), dict) else {}
    ai_keys = {'display_title': 'title', 'brand': 'brand', 'model_number': 'model', 'category': 'category',
               'subcategory': 'subcategory', 'short_name': 'short_name', 'retail_estimate': 'retail_estimate'}
    profile, _ = ProductProfile.objects.get_or_create(product=product)
    for field, value in fields.items():
        if value in ('', None) or (not created and getattr(profile, field) not in ('', None)):
            continue    # a product that already existed keeps what it has; only its blanks are filled
        drafted = ai_values.get(ai_keys[field])
        if field == 'retail_estimate' and drafted not in (None, ''):
            drafted = _money(drafted, 'retail estimate')    # 60, 60.0 and "60.00" are the same figure
        same_as_ai = bool(ai_model_used) and drafted not in (None, '') and str(drafted) == str(value)
        set_field(product, field, value, profile=profile, source=f'ai:{ai_model_used}' if same_as_ai else 'human',
                  confidence=str(ai_values.get('confidence') or '') if same_as_ai else 'confirmed')
    # Clean up with AI (#96): tags, identifiers and specifications go on the product; an existing product only gets
    # what it lacks (a tag it does not have, a name it has no value for).
    extra_fields: list[str] = []
    tags = _tag_list(spec.get('tags'))
    if tags:
        have = list(product.tags or []) if isinstance(product.tags, list) else []
        product.tags = have + [t for t in tags if t not in have]
        extra_fields.append('tags')
    for f in DICT_FIELDS:
        pairs = _pairs(spec.get(f), limit=20)
        if pairs:
            have = dict(getattr(product, f) or {}) if isinstance(getattr(product, f), dict) else {}
            setattr(product, f, {**pairs, **have})
            extra_fields.append(f)
    if extra_fields:
        product.save(update_fields=[*extra_fields, 'updated_at'])
    origin = {'product': 'new' if created else 'matched', 'how': str(spec.get('how') or 'typed')[:20]}
    source_text = str(spec.get('source_text') or '').strip()[:20000]
    if source_text:
        origin['source_text'] = source_text      # "Anything you know about it", kept as typed (on the check-in record)
    if spec.get('copied_from'):
        origin['copied_from'] = int(spec['copied_from'])
    if ai_model_used:
        origin['ai_model'] = ai_model_used
    return product, origin


def save_product_photo(product: Product, upload) -> None:
    """Keep the photo on the product (2048 px and a 480 px thumbnail), when it has none."""
    import uuid

    from django.core.files.base import ContentFile

    from apps.inventory.services.receiving_photos import prepare_high_res_and_thumb

    if product.photo:
        return
    upload.seek(0)
    high, thumb = prepare_high_res_and_thumb(upload.read())
    stem = uuid.uuid4().hex
    product.photo.save(f'{stem}.jpg', ContentFile(high), save=False)
    product.photo_thumb.save(f'{stem}_thumb.jpg', ContentFile(thumb), save=False)
    product.save(update_fields=['photo', 'photo_thumb', 'updated_at'])


# ── 3. Check in ─────────────────────────────────────────────────────────────

def _money(value, label: str, *, required: bool = False) -> Decimal | None:
    from apps.inventory.processing_ops import parse_decimal

    if value in (None, ''):
        if required:
            raise AddItemError(f'Enter the {label}.')
        return None
    amount = parse_decimal(value)
    if amount is None or amount < 0:
        raise AddItemError(f'The {label} must be a dollar amount.')
    return amount.quantize(Decimal('0.01'))


def restoration_estimate(raw: Any) -> dict[str, Any]:
    """Restoration needs the request (owner, 2026-10-28): what it needs and the done price; as-is prices fill in.
    The rule is Processing's (`services/restoration_request.py`); here it answers as an AddItemError."""
    from apps.inventory.services.restoration_request import RestorationRequestError, restoration_request as checked

    try:
        return checked(raw)
    except RestorationRequestError as e:
        raise AddItemError(str(e)) from e


def save_extra_photos(product: Product, uploads: list) -> list[str]:
    """Photos beyond the product's one: saved (2048 px) beside the product photos. Returns their storage names."""
    import uuid

    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    from apps.inventory.services.receiving_photos import prepare_high_res_and_thumb

    kept: list[str] = []
    for upload in uploads[:CLEAN_UP_PHOTOS_MAX * 2]:
        try:
            upload.seek(0)
            high, _thumb = prepare_high_res_and_thumb(upload.read())
            kept.append(default_storage.save(f'inventory/products/add-item/{product.pk}-{uuid.uuid4().hex}.jpg',
                                             ContentFile(high)))
        except Exception:  # noqa: BLE001 - one bad photo never stops the rest or the check-in
            logger.exception('Add item: extra photo for %s not saved', product.pk)
    return kept


def check_in(user, data: dict, *, photo=None, photos=None) -> dict[str, Any]:
    """Check in Misfit items: the product (picked, or made here), then Processing's own check-in on the Misfit order.
    Raises RetailCheckNeeded (answer and send again) and AddItemError. Nothing is saved unless it all works."""
    from apps.inventory.processing_ops import (
        _parse_check_in_quantity,
        processing_add_item,
        processing_row_check_in,
    )
    from apps.inventory.services.misfit import misfit_order

    destination = str(data.get('destination') or 'floor').strip()
    if destination not in DESTINATIONS:
        raise AddItemError('Pick where it goes: Floor, Back stock or Restoration.')
    quantity = _parse_check_in_quantity(data.get('quantity'))
    price = _money(data.get('price'), 'price', required=True)
    retail = _money(data.get('retail'), 'retail')
    estimate = None
    if destination == 'restoration':
        estimate = restoration_estimate(data.get('restoration'))
    notes = str(data.get('notes') or '').strip()[:2000]

    with transaction.atomic():
        origin: dict[str, Any] = {'product': 'existing'}
        if data.get('product_id') not in (None, ''):
            product = Product.objects.filter(pk=int(data['product_id'])).select_related('category').first()
            if product is None:
                raise AddItemError('That product is gone. Search again.')
        elif isinstance(data.get('new_product'), dict):
            product, origin = _new_product(data['new_product'], user=user)
        else:
            raise AddItemError('Pick a product, or make a new one.')
        order = misfit_order()
        payload = {
            'quantity': quantity,
            'condition': data.get('condition') or 'good',
            'dispatch': DESTINATIONS[destination],
            'price': str(price),
            'retail': str(retail) if retail is not None else None,
            'retail_source': str(data.get('retail_source') or '').strip(),
            'retail_check': str(data.get('retail_check') or '').strip(),
            'notes': notes,
            'restoration': estimate,
            'product_mode': 'existing',
            'product_id': product.pk,
            'title': product.title,
            'brand': product.brand or '',
            'model': product.model or '',
            'category': product.category.name if product.category_id else '',
        }
        row_id = processing_add_item(user, order, payload)['processing_row_id']
        result = processing_row_check_in(user, order, row_id, payload)
        check_in_id = result.get('item_check_in_id')
        if check_in_id:
            snapshot_origin = {**origin, 'destination': destination}
            ItemCheckIn.objects.filter(pk=check_in_id).update(
                defaults_snapshot=_merged_snapshot(check_in_id, {'add_item': snapshot_origin}))

    uploads = [p for p in ([photo] if photo is not None else []) + list(photos or []) if p is not None]
    if uploads:
        try:
            save_product_photo(product, uploads[0])
        except Exception:  # noqa: BLE001 - a photo problem never undoes a check-in
            logger.exception('Add item: product photo for %s not saved', product.pk)
    if len(uploads) > 1 and check_in_id:
        # The product has one photo; the others are kept and listed on the check-in record (#96), never thrown away.
        kept = save_extra_photos(product, uploads[1:])
        if kept:
            ItemCheckIn.objects.filter(pk=check_in_id).update(defaults_snapshot=_merged_snapshot(
                check_in_id, {'add_item': {**snapshot_origin, 'more_photos': kept}}))
    return {
        'product_id': product.pk,
        'purchase_order_id': order.pk,
        'order_number': order.order_number,
        'created_count': result['created_count'],
        'created_item_ids': [i['id'] for i in result.get('items', [])],
        'skus': [i['sku'] for i in result.get('items', [])],
        'item_check_in_id': check_in_id,
        'restoration_job_id': result.get('restoration_job_id'),
        'printed_items_preview': result.get('printed_items_preview') or [],
    }


def _merged_snapshot(check_in_id: int, extra: dict) -> dict:
    current = ItemCheckIn.objects.filter(pk=check_in_id).values_list('defaults_snapshot', flat=True).first() or {}
    return {**(current if isinstance(current, dict) else {}), **extra}
