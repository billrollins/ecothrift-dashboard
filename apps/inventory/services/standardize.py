"""
Standardize products (owner, 2026-09-29): every product gets the same fields, written by Spark under hard
rules, as proposals that carry the rules version:
title, tag name, vector text, brand, model number, canon category and subcategory, product specs.

- **Rules:** the taxonomy (`.ai/extended/product-taxonomy.md`: placement, the canon list, rulings, tag
  names), the product standard and spec rules (`apps/inventory/spec_rules.py`, `.ai/extended/product-standard.md`).
- **Run:** `python manage.py standardize_products --batch std-001 --size 10000` takes the next products by sold
  dollars, calls Spark 10 at a time, validates each answer and appends it to
  `workspace/standardize/<batch>.jsonl` (resumable).
- **Vet:** `python manage.py vet_standardize std-001` has Claude judge a random 200 against the same rules; the
  next batch runs only if 95% are right.
- **Load:** `python manage.py standardize_products --load std-001` writes the answers as ProductProposal rows:
  `auto` when valid and high confidence, else `pending` for review. Applying stays the existing
  `apply_profile_proposals` step (in production: a Requests item).
"""
from __future__ import annotations

import json
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection

from apps.inventory import spec_rules

MODEL = 'muse-spark-1.3-contributor'
EFFORT = 'high'     # aud-002 (2026-09-29): Spark high = Opus on core fields (85.6% vs 86.3%) at 1/60 of the cost
PER_CALL = 10
WORKERS = 32
OUT_DIR = Path(settings.BASE_DIR) / 'workspace' / 'standardize'
TAXONOMY = Path(settings.BASE_DIR) / '.ai' / 'extended' / 'product-taxonomy.md'
TAG_MAX, TITLE_MAX = 28, 80
FIELDS = ('display_title', 'short_name', 'vector_text', 'brand', 'model_number', 'category', 'subcategory',
          'key_specs')


def db_safe(fn):
    """Wrap a thread-pool worker so it closes its database connections when it finishes. `llm_complete` logs usage
    through the ORM, so every pooled worker otherwise keeps a connection open for good: 32 workers took 76 of the
    local Postgres's 100 connections on 2026-10-01 and locked every other project on the PC out."""
    import functools

    from django.db import connections

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        finally:
            connections.close_all()
    return wrapper


def _section(md: str, title: str) -> str:
    m = re.search(rf'^## {re.escape(title)}\n(.*?)(?=^## |\Z)', md, re.S | re.M)
    return m.group(1).strip() if m else ''


def canon() -> dict[str, list[str]]:
    """Category -> subcategories, read from the taxonomy's table (the one answer key)."""
    out: dict[str, list[str]] = {}
    for line in _section(TAXONOMY.read_text(encoding='utf-8'), 'Categories and subcategories').splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 2 and cells[0] and cells[0] not in ('Category', '---') and not set(cells[0]) <= {'-'}:
            subs = [] if cells[1].lower() == 'none' else [s.strip() for s in cells[1].split('·') if s.strip()]
            out[cells[0]] = subs
    return out


def rules_version() -> str:
    first = TAXONOMY.read_text(encoding='utf-8').splitlines()[0]
    tax_date = re.search(r'\d{4}-\d{2}-\d{2}', first)
    return f"{spec_rules.RULES_VERSION}+tax:{tax_date[0] if tax_date else 'unknown'}"


def _examples_block() -> str:
    from apps.inventory.standard_examples import EXAMPLES

    return '\n'.join(
        f"- {e['why']}\n  input: {json.dumps(e['input'], ensure_ascii=False)}\n"
        f"  answer: {json.dumps(e['answer'], ensure_ascii=False)}" for e in EXAMPLES)


def system_prompt() -> str:
    tax = TAXONOMY.read_text(encoding='utf-8')
    return f"""You standardize thrift-store products. Every product gets the same fields, under hard rules.

# How to place an item
{_section(tax, 'How to place an item (in order)')}

# Categories and subcategories (use these exact names; the subcategory must be one listed for its category)
{_section(tax, 'Categories and subcategories')}

# Rulings (these win)
{_section(tax, 'Rulings')}

# Tag name (short_name)
{_section(tax, 'Price-tag short name')}

# {spec_rules.prompt_block()}

# Hard rules checklist (check every answer against it)
1. brand = the consumer brand on the box (B1-B5): Nerf not Hasbro; sub-lines to the title (Hanes Premium -> Hanes);
   licenses to franchise (Marvel, Barbie, Jeep); a printed seller name stays and is flagged junk_brand; never a
   retailer exclusive. Canonical casing (DeWalt, BruMate, Tempur-Pedic); keep a mixed-case input as written.
2. display_title: brand + line/model name + what it is + product specs. No colors, finishes, sizes of apparel,
   feature figures, seller codes, condition text.
3. short_name: at most 28 characters, brand first when real, no "with", no colors.
4. key_specs: only the category's keys; every stated defining measurement; nothing else (G9-G14).
5. vector_text: the product, never its item details.
6. Category and subcategory: exact canon names; rulings win; the most specific place a shopper would look.
7. When unsure, confidence "low" (it goes to review), never a guess stated as fact.

# The fields
- display_title: the long-form name for online listings, at most {TITLE_MAX} characters, Title Case, in this order:
  brand (whenever it is known and not Generic), the product line or model name as the seller gives it (Tisdale,
  Bartt, Nitro 46, M18, Pocket 3, Px7 S2e, AirPods 4: never drop it; a shopper searches by it), what it is, then
  the key product specs. A brand's own product name (Kindle, AirPods) keeps its maker as brand (Amazon, Apple). No marketing words, no
  condition text. Never item details: strip a trailing color ("- Gray", "Black", "Ceramic Pink") and apparel
  sizes. Never a seller SKU or long part code (W52003910F, D958635Green, 12AVP2R3739): those go only in
  model_number. Store brands (Room Essentials, Mainstays ...) stay in the title; dropping them is only for
  the short tag name when space is short.
- short_name: the price-tag name, at most {TAG_MAX} characters, per the tag-name rules above. Lead with the brand
  when it is a real, recognizable brand; the line name comes next if it fits.
- vector_text: the words a shopper or a search would use to find exactly this product: brand, type, use,
  material, audience, style, the product specs and 2-4 synonyms. Lowercase, space-separated, no filler words
  (no "the", "for", "with", "of"). Never item details (color, pattern, finish, apparel size) or condition
  words: two items that are the same product must get the same vector text.
- brand: per the brand rules B1-B5 above, correctly cased (DeWalt, NordicTrack, KitchenAid). Keep a mixed-case input brand's casing (TowSmart); convert all-caps to the
  canonical form (DEWALT -> DeWalt); never re-case into a different form or lower-case a capital (Bella
  Housewares). A placeholder brand ("Unbranded") with a recognizable product line in the title (Block Rocker = ION
  Audio) takes that brand. A licensed vehicle, character or line
  name (Jeep, Wrangler, Barbie, Marvel) is not the brand (B3): use the maker's consumer brand (a model prefix like
  HYP is Hyper Toys); if unknown, brand "Generic", and the license goes in franchise or the title.
- Titles carry product specs only, never feature figures (power levels, speeds, settings), the same as G9. A
  unitless or impossible dimension takes the unit that fits the product (a bare "66" futon is 66in).
- model_number: the base model (rule G6), or "". Cut a color or finish suffix: Ad795712Ginger -> Ad795712,
  Pws4121Bl -> Pws4121, Axel Lhf Slate -> Axel Lhf. Use the model the title names (HPR350) when the model field
  is empty; "N/A" and the product type ("HEATED VEST") are not models.
- category, subcategory: the exact canon names.
- key_specs: an object with ONLY the product-spec keys listed for the category, and only those the data states
  (rule G7), but EVERY listed key the data does state (an engine size like 163cc is the capacity; a set's piece
  count is piece_count). The type key (item_type, tool_type ...) is specific enough to price by: "electric
  bike", not "bike"; "rotary laser level", not "laser". A size is the product's own size, never what it fits
  ("for TVs up to 80in" is compatible_with, or nothing). Materials are materials (wood, metal, leather, fabric,
  boucle); "upholstered" is not a material. Every measurement or count in the title that describes the product
  (in, ft, gal, qt, oz, V, W, psi, cc, pc, ct, tier, drawer, seat) goes into a spec. Values short, with units
  (rule G8), lowercase except brand-like names.
- If you recognize the brand and model (a Nakto Skylark is an electric bike; K9 Advantix is a flea and tick
  treatment), use what you know to place and describe it, and say what it is in the title ("K9 Advantix Flea & Tick
  Treatment", not "Dog Treatment"). A vague title from a recognizable brand (Oxo, Blingle Bands) is placed in that
  brand's usual category, flagged vague_title with confidence low, with no invented type or specs; Mixed lots is
  only for what the taxonomy says.
- item_details: an object with any item-detail keys the data states (color, pattern, size for apparel ...).
- confidence: high | medium | low. flags: comma list of vague_title, incomplete, junk_brand, or "".

# Worked examples (each was once done wrong; the answer is how it must be done)
{_examples_block()}

# Input
A JSON list of products: id, title, brand, model, upc, the current category and subcategory (may be wrong),
and optionally a manifest title and the seller's category code (a hint, wrong about 1 time in 16).

# Output
Only a JSON array, one object per input product, in the same order, with keys: id, display_title,
short_name, vector_text, brand, model_number, category, subcategory, key_specs, item_details, confidence,
flags. No prose, no code fences."""


def next_products(limit: int, exclude: set[int]) -> list[dict[str, Any]]:
    """The next products by sold dollars (then items), skipping merged-away ones, ones that already carry the
    standard (a profile with vector text: the catalog load, or intake) and ones already in a batch file."""
    with connection.cursor() as cur:
        cur.execute("""
            SELECT p.id, p.title, p.brand, p.model, p.identifiers, pp.category, pp.subcategory,
                   coalesce(sum(i.sold_for) FILTER (WHERE i.status = 'sold'), 0) AS sold,
                   count(i.id) AS items,
                   max(mr.title) AS manifest_title, max(mr.category) AS manifest_code
            FROM inventory_product p
            LEFT JOIN inventory_productprofile pp ON pp.product_id = p.id
            LEFT JOIN inventory_item i ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON mr.id = i.manifest_row_id
            WHERE pp.merged_into_id IS NULL AND coalesce(pp.vector_text, '') = ''
            GROUP BY p.id, pp.category, pp.subcategory
            HAVING count(i.id) > 0
            ORDER BY sold DESC, items DESC, p.id
            LIMIT %s
        """, [limit + len(exclude)])
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    return [r for r in rows if r['id'] not in exclude][:limit]


def payload(p: dict[str, Any]) -> dict[str, Any]:
    ids = p.get('identifiers') or {}
    if isinstance(ids, str):
        try:
            ids = json.loads(ids)
        except ValueError:
            ids = {}
    d = {'id': p['id'], 'title': (p.get('title') or '')[:300], 'brand': p.get('brand') or ''}
    if p.get('model'):
        d['model'] = p['model']
    if ids.get('upc'):
        d['upc'] = ids['upc']
    if p.get('category'):
        d['current_category'] = p['category']
        d['current_subcategory'] = p.get('subcategory') or ''
    mt = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', p.get('manifest_title') or '')).strip()[:200]
    if mt and mt != d['title']:
        d['manifest_title'] = mt
    if p.get('manifest_code'):
        d['manifest_code'] = p['manifest_code']
    return d


STOP = {'with', 'and', 'for', 'the', 'set', 'pack', 'new', 'inch', 'piece', 'pcs', 'of', 'in'}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r'[a-z0-9]{3,}', str(text).lower()) if w not in STOP}


def matches_input(o: dict[str, Any], given: dict[str, Any]) -> bool:
    """The answer shares real words with the product's own title or brand (catches answers swapped between
    products in one call)."""
    source = _words(given.get('title', '')) | _words(given.get('brand', '')) | _words(given.get('manifest_title', ''))
    answer = _words(o.get('display_title', '')) | _words(o.get('vector_text', '')) | _words(o.get('brand', ''))
    return not source or bool(source & answer)


def validate(o: dict[str, Any], cats: dict[str, list[str]], given: dict[str, Any] | None = None) -> tuple[dict[str, Any], list[str]]:
    """Clean one answer against the hard rules. Returns the cleaned answer and the problems found."""
    problems: list[str] = []
    if given is not None and not matches_input(o, given):
        problems.append('answer does not match the product (swapped?)')
    out = {k: o.get(k) for k in (*FIELDS, 'item_details', 'confidence', 'flags')}
    cat, sub = str(out.get('category') or ''), str(out.get('subcategory') or '')
    if cat not in cats:
        problems.append(f'category not canon: {cat!r}')
    elif cats[cat] and sub not in cats[cat]:
        problems.append(f'subcategory not canon for {cat}: {sub!r}')
    for field, cap in (('short_name', TAG_MAX), ('display_title', TITLE_MAX)):
        text = str(out.get(field) or '').strip()
        if not text:
            problems.append(f'{field} empty')
        elif len(text) > cap:
            problems.append(f'{field} over {cap} characters')
            text = text[:cap].rsplit(' ', 1)[0]
        out[field] = text
    specs = out.get('key_specs') if isinstance(out.get('key_specs'), dict) else {}
    allowed = set(spec_rules.rules_for(cat)['product_specs'])
    dropped = sorted(k for k in specs if k not in allowed)
    if dropped:
        problems.append(f'specs not in the {cat} rules (dropped): {", ".join(dropped)}')
    out['key_specs'] = {k: v for k, v in specs.items() if k in allowed and v not in (None, '', [])}
    out['item_details'] = out['item_details'] if isinstance(out.get('item_details'), dict) else {}
    out['vector_text'] = vector_text(str(out.get('vector_text') or ''), out['key_specs'], out['item_details'])
    if not out['vector_text']:
        problems.append('vector_text empty')
    out['brand'] = _canonical_brand(str(out.get('brand') or '').strip()) or 'Generic'
    out['model_number'] = str(out.get('model_number') or '').strip()
    out['display_title'] = clean_title(out['display_title'], out['model_number'], out['item_details'])
    out['display_title'], out['short_name'] = same_brand_casing(out['brand'], out['display_title'], out['short_name'])
    if 'junk_brand' in str(out.get('flags') or '') and out['brand'] not in ('', 'Generic'):
        out['short_name'] = re.sub(rf'^\s*{re.escape(out["brand"])}\s+', '', out['short_name'], flags=re.I).strip()
    out['confidence'] = str(out.get('confidence') or '').lower()
    out['flags'] = str(out.get('flags') or '')
    return out, problems


_ALIASES: dict | None = None


def _canonical_brand(brand: str) -> str:
    """The brand as our BrandAlias table spells it (DEWALT -> DeWalt); junk aliases become Generic."""
    global _ALIASES
    if not brand or brand == 'Generic':
        return brand
    from apps.inventory.models import BrandAlias
    from apps.inventory.services.product_profile import normalize_brand

    if _ALIASES is None:
        try:
            _ALIASES = {a.alias: a for a in BrandAlias.objects.all()}
        except Exception:  # noqa: BLE001 - no database (a unit test): keep the brand as written
            return brand
    # B4: a printed junk seller name is kept as printed (flagged); aliases only fix the spelling of real brands.
    row = _ALIASES.get(normalize_brand(brand))
    if row is None or row.is_junk or not row.brand:
        return brand
    # A mixed-case brand is kept as written (TowSmart); the alias spelling only fixes all-caps or all-lower input.
    letters = [c for c in brand if c.isalpha()]
    if letters and not (all(c.isupper() for c in letters) or all(c.islower() for c in letters)):
        return brand
    return row.brand


def same_brand_casing(brand: str, title: str, tag: str) -> tuple[str, str]:
    """The brand is written one way everywhere: its spelling in the title and tag follows the brand field."""
    if not brand or brand == 'Generic':
        return title, tag
    pat = re.compile(rf'(?<![\w-]){re.escape(brand)}(?![\w-])', re.I)
    return pat.sub(brand, title), pat.sub(brand, tag)


def clean_title(title: str, model: str, details: dict) -> str:
    """Hard rules on the long title: a model code (5+ characters with a digit) lives only in model_number,
    and item details (color, pattern ...) never appear."""
    t = title
    if len(model) >= 5 and re.search(r'\d', model):
        t = re.sub(re.escape(model), ' ', t, flags=re.I)
    for v in details.values():
        v = str(v).strip()
        if v and len(v) >= 3:
            t = re.sub(rf'(?<![\w-]){re.escape(v)}(?![\w-])', ' ', t, flags=re.I)
    return re.sub(r'\s+', ' ', re.sub(r'\s+,', ',', t)).strip(' -,/')


def vector_text(text: str, specs: dict, details: dict) -> str:
    """Deterministic hard rule on top of the model's words: every product-spec value is in, every item-detail
    value (color, pattern, apparel size ...) is out, so the same product always embeds the same way."""
    words = re.sub(r'[^a-z0-9./ ]+', ' ', text.lower()).split()
    drop: set[str] = set()
    for v in details.values():
        drop.update(re.sub(r'[^a-z0-9./ ]+', ' ', str(v).lower()).split())
    keep = [w for w in words if w not in drop]
    for v in specs.values():
        for w in re.sub(r'[^a-z0-9./ ]+', ' ', str(v).lower()).split():
            if w not in keep:
                keep.append(w)
    return ' '.join(dict.fromkeys(keep))


def _parse(text: str) -> list[dict]:
    t = re.sub(r'^```(?:json)?|```$', '', text.strip(), flags=re.M).strip()
    return json.loads(t[t.find('['):t.rfind(']') + 1])


def group_key(p: dict[str, Any]) -> str | None:
    """Products with the same normalized title and brand get one answer (the Sep 23 backfill's grouping).
    A vague title (under 3 words) is never grouped."""
    from apps.inventory.services.catalog_merge import VAGUE_TITLE_WORDS, normalize_title
    from apps.inventory.services.product_profile import normalize_brand

    title = normalize_title(p.get('title'))
    if len(title.split()) < VAGUE_TITLE_WORDS:
        return None
    return f"{normalize_brand(p.get('brand'))}|{title}"


def run_batch(batch: str, size: int, *, log=print, effort: str | None = None, per_call: int | None = None,
              grouped: bool = False) -> dict[str, int]:
    """Standardize the next `size` products into workspace/standardize/<batch>.jsonl (resumable).
    `grouped`: one answer per title group, written for every product in it (field `group_rep`)."""
    from apps.core.services.llm_router import llm_complete

    effort, per_call = effort or EFFORT, per_call or PER_CALL

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f'{batch}.jsonl'
    done_all = done_ids()
    done_here = {json.loads(l)['id'] for l in out_path.open(encoding='utf-8')} if out_path.exists() else set()
    todo = next_products(size - len(done_here), done_all)
    members: dict[int, list[dict]] = {}
    if grouped:
        reps, by_key = [], {}
        for p in todo:
            k = group_key(p)
            if k and k in by_key:
                members[by_key[k]['id']].append(p)
            else:
                reps.append(p)
                members[p['id']] = [p]
                if k:
                    by_key[k] = p
        todo = reps
    cats, system, version = canon(), system_prompt(), rules_version()
    lock, stats = threading.Lock(), {'calls': 0, 'rows': 0, 'errors': 0, 'invalid': 0, 'in': 0, 'out': 0}

    retry: list[dict] = []

    def one(chunk: list[dict], last_try: bool = False) -> None:
        items = [payload(p) for p in chunk]
        res = None
        for _ in range(3):
            try:
                res = llm_complete(model_id=MODEL, system=system, user=json.dumps(items, ensure_ascii=False),
                                   max_tokens=16000, effort=effort, timeout=240, log_source='standardize_products',
                                   log_detail=f'{batch}/{effort}/{per_call}')
                answers = {str(a.get('id')): a for a in _parse(res.text) if isinstance(a, dict)}
                break
            except Exception:  # noqa: BLE001 - a bad call is retried, then counted
                answers = None
                time.sleep(5)
        with lock:
            stats['calls'] += 1
            if answers is None:
                stats['errors'] += 1
                return
            stats['in'] += res.input_tokens
            stats['out'] += res.output_tokens
            with out_path.open('a', encoding='utf-8') as f:
                for p in chunk:
                    a = answers.get(str(p['id']))
                    empty = not a or not str(a.get('display_title') or '').strip() or not a.get('category')
                    if empty and not last_try:
                        retry.append(p)  # asked again below, a few at a time
                        continue
                    if not a:
                        continue
                    clean, problems = validate(a, cats, payload(p))
                    for m in members.get(p['id']) or [p]:
                        stats['rows'] += 1
                        stats['invalid'] += bool(problems)
                        f.write(json.dumps({'id': m['id'], 'input': payload(m), **clean, 'problems': problems,
                                            'sold': float(m['sold'] or 0), 'items': m['items'],
                                            'group_rep': p['id'] if m['id'] != p['id'] else None,
                                            'source': f'ai:{MODEL}', 'rules_version': version, 'effort': effort},
                                           ensure_ascii=False, default=str) + '\n')
            if stats['calls'] % 50 == 0:
                log(f"  {stats['rows']:,} rows, {stats['errors']} failed calls, {stats['invalid']} with problems")

    chunks = [todo[i:i + per_call] for i in range(0, len(todo), per_call)]
    started = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(db_safe(one), chunks))
    stats['retried'] = len(retry)
    if retry:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            list(ex.map(db_safe(lambda c: one(c, last_try=True)), [retry[i:i + 3] for i in range(0, len(retry), 3)]))
    stats['seconds'] = round(time.time() - started)
    return stats


def done_ids() -> set[int]:
    """Products already standardized in any batch file."""
    ids: set[int] = set()
    for f in OUT_DIR.glob('*.jsonl') if OUT_DIR.exists() else []:
        with f.open(encoding='utf-8') as fh:
            ids.update(json.loads(line)['id'] for line in fh if line.strip())
    return ids


def sample(batch: str, n: int = 200, seed: int = 0) -> list[dict]:
    rows = [json.loads(l) for l in (OUT_DIR / f'{batch}.jsonl').open(encoding='utf-8') if l.strip()]
    random.Random(seed).shuffle(rows)
    return rows[:n]


# --- vetting ------------------------------------------------------------------------------------------

# Two-stage vet (owner, 2026-09-29): Gemini judges the sample; Claude sees only what Gemini calls wrong,
# confirms or clears each, and proposes rule changes (rulings, spec rules, prompt rules) for the next version.
JUDGE = 'gemini-3.8-flash'
ESCALATE_TO = 'claude-sonnet-5-5'  # Opus cost $1.44 per escalation on std-003; Sonnet is half
PASS_SHARE = 0.95
# The pass bar counts only these (owner, 2026-09-29, option A): they drive dedupe and pricing. Wording issues in
# titles and tags are still reported.
CORE = ('category', 'subcategory', 'brand', 'key_specs')
VET_CHUNK = 25


def _judge_prompt() -> str:
    return system_prompt().split('# Input')[0] + """
# Your job now
You are the reviewer, not the writer. Judge each answer against the rules above and its input.
List every issue, each with a severity:
- "wrong": it would mislead a shopper or break dedupe: a wrong category or subcategory, a wrong or missing
  brand, a wrong or missing spec that defines the product (type, size, capacity, count, power), an item detail
  (color, apparel size, condition) inside the title or vector text, a seller code in the title.
- "polish": wording that is acceptable but could be better.
Reply with only a JSON array, one object per answer, same order:
{"id": <id>, "issues": [{"field": "<field>", "severity": "wrong|polish", "fix": "<correct value>"}]}
An answer with nothing to fix has "issues": []."""


def _escalate_prompt() -> str:
    return system_prompt().split('# Input')[0] + """
# Your job now
A first reviewer flagged these answers as wrong. For each one, decide whether the flag is right, and give the
correct values. Then look across all of them and propose rule changes that would prevent the confirmed errors
next time: a taxonomy ruling ("<item> goes to <category> > <subcategory>, not <other>"), a spec-rule change, or a
prompt rule. Only propose a rule that a confirmed error supports.
Reply with only a JSON object:
{"items": [{"id": <id>, "confirmed": true|false, "fields": ["category", ...], "fix": "<correct values>"}],
 "rule_proposals": [{"kind": "ruling|spec_rule|prompt_rule", "text": "<the rule>", "because": [<ids>]}]}"""


def _judge(batch: str, rows: list[dict], *, log) -> dict[str, dict]:
    from apps.core.services.llm_router import llm_complete

    system, verdicts = _judge_prompt(), {}
    for i in range(0, len(rows), VET_CHUNK):
        chunk = rows[i:i + VET_CHUNK]
        shown = [{'id': r['id'], 'input': r['input'],
                  'answer': {k: r.get(k) for k in (*FIELDS, 'item_details', 'confidence', 'flags')}} for r in chunk]
        for attempt in range(3):  # a malformed reply is asked again; a chunk that never parses is skipped
            try:
                res = llm_complete(model_id=JUDGE, system=system, user=json.dumps(shown, ensure_ascii=False, default=str),
                                   max_tokens=16000, timeout=300, effort='low', log_source='vet_standardize',
                                   log_detail=f'{batch}/judge')
                for v in _parse(res.text):
                    if isinstance(v, dict):
                        verdicts[str(v.get('id'))] = v
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 2:
                    log(f'  chunk {i // VET_CHUNK + 1} skipped: {str(exc)[:80]}')
        log(f'  judged {min(i + VET_CHUNK, len(rows))}/{len(rows)} ({JUDGE})')
    return verdicts


def _escalate(batch: str, flagged: list[dict], verdicts: dict[str, dict], *, log) -> dict | None:
    """Claude confirms or clears Gemini's flags and proposes rule changes. None when the call fails."""
    from apps.core.services.llm_router import llm_complete

    if not flagged:
        return {'items': [], 'rule_proposals': []}
    shown = [{'id': r['id'], 'input': r['input'],
              'answer': {k: r.get(k) for k in (*FIELDS, 'item_details', 'confidence', 'flags')},
              'flagged': [i for i in verdicts[str(r['id'])].get('issues') or [] if i.get('severity') == 'wrong']}
             for r in flagged]
    raw = ''
    for attempt in range(2):
        try:
            res = llm_complete(model_id=ESCALATE_TO, system=_escalate_prompt(),
                               user=json.dumps(shown, ensure_ascii=False, default=str), max_tokens=32000, timeout=400,
                               effort='medium', log_source='vet_standardize', log_detail=f'{batch}/escalate')
            raw = res.text or ''
            t = re.sub(r'^```(?:json)?|```$', '', raw.strip(), flags=re.M).strip()
            out = json.loads(t[t.find('{'):t.rfind('}') + 1])
            log(f'  escalated {len(flagged)} to {ESCALATE_TO}')
            return out
        except Exception as exc:  # noqa: BLE001 - no credits, outage, bad reply: retry once, then the judge alone
            err = str(exc)[:80]
    (OUT_DIR / f'{batch}.escalate-raw.txt').write_text(raw or '(empty reply)', encoding='utf-8')
    log(f'  escalation failed ({err}); using the judge alone; raw reply in {batch}.escalate-raw.txt')
    return None


def vet(batch: str, n: int = 200, *, log=print) -> dict[str, Any]:
    """Gemini judges a random `n`; Claude confirms what Gemini calls wrong on the core fields and proposes rules.
    The batch passes at 95% with no confirmed core error (or empty answer)."""
    rows = sample(batch, n)
    verdicts = _judge(batch, rows, log=log)
    by_id = {str(r['id']): r for r in rows}
    judged = [verdicts[str(r['id'])] for r in rows if str(r['id']) in verdicts]
    empty = {str(r['id']) for r in rows if not r.get('display_title')}

    def core_wrong(v):
        return any(i.get('severity') == 'wrong' and i.get('field') in CORE for i in v.get('issues') or [])

    wrong_any = [v for v in judged if any(i.get('severity') == 'wrong' for i in v.get('issues') or [])]
    flagged = [by_id[str(v.get('id'))] for v in judged if core_wrong(v) and str(v.get('id')) not in empty]
    esc = _escalate(batch, flagged, verdicts, log=log)
    if esc is None:
        confirmed = {str(r['id']) for r in flagged}
        escalated = False
    else:
        confirmed = {str(x.get('id')) for x in esc.get('items') or [] if x.get('confirmed')}
        escalated = True
    wrong_ids = confirmed | (empty & set(verdicts))
    fields: dict[str, int] = {}
    for x in (esc or {}).get('items') or []:
        if x.get('confirmed'):
            for f in x.get('fields') or []:
                fields[f] = fields.get(f, 0) + 1
    share = 1 - len(wrong_ids) / max(len(judged), 1)
    report = {
        'batch': batch, 'judge': JUDGE, 'escalated_to': ESCALATE_TO if escalated else None,
        'sampled': len(rows), 'judged': len(judged),
        'flagged_by_judge': len(flagged), 'confirmed_wrong': len(confirmed), 'empty_answers': len(empty),
        'right': len(judged) - len(wrong_ids), 'share_right': round(share, 3),
        'judge_wrong_any_field': len(wrong_any),
        'wrong_by_field': dict(sorted(fields.items(), key=lambda kv: -kv[1])),
        'pass_rule': 'no confirmed core error (category, subcategory, brand, key_specs) and no empty answer',
        'passed': len(judged) >= 0.9 * len(rows) and share >= PASS_SHARE,
        'confirmed': [x for x in (esc or {}).get('items') or [] if x.get('confirmed')],
        'rule_proposals': (esc or {}).get('rule_proposals') or [],
    }
    (OUT_DIR / f'{batch}.vet.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    return report


# --- loading as proposals ----------------------------------------------------------------------------

def load(batch: str) -> dict[str, int]:
    """Write the batch's answers as ProductProposal rows (idempotent per batch).
    `auto` = no problems and high confidence; everything else `pending` for review."""
    from decimal import Decimal

    from django.db import transaction

    from apps.inventory.models import Product, ProductProposal

    from apps.inventory.services import std_review

    rows = [json.loads(l) for l in (OUT_DIR / f'{batch}.jsonl').open(encoding='utf-8') if l.strip()]
    accepted = std_review.accepted_ids() if std_review.REVIEW.exists() else set()  # second-pass review (std_review)
    if std_review.ESCALATED.exists():  # Sonnet's rewrites replace Spark's answer for the products Spark's check flagged
        esc = {x['id']: x for x in (json.loads(l) for l in std_review.ESCALATED.open(encoding='utf-8') if l.strip())}
        rows = [esc.get(r['id'], r) for r in rows]
    existing = set(Product.objects.filter(pk__in=[r['id'] for r in rows]).values_list('pk', flat=True))
    counts = {'products': 0, 'auto': 0, 'pending': 0, 'missing_products': 0}
    objs = []
    for r in rows:
        if r['id'] not in existing:
            counts['missing_products'] += 1
            continue
        confident = not r.get('problems') and r.get('confidence') == 'high'
        reviewed_ok = r['id'] in accepted and not std_review.hard_problem(r)
        status = ProductProposal.STATUS_AUTO if confident or reviewed_ok else ProductProposal.STATUS_PENDING
        counts['products'] += 1
        counts['auto' if status == ProductProposal.STATUS_AUTO else 'pending'] += 1
        for field in FIELDS:
            value = r.get(field)
            if value in (None, '', {}):
                continue
            objs.append(ProductProposal(
                product_id=r['id'], field=field, value=value, source=r['source'], confidence=r.get('confidence', ''),
                dollars=Decimal(str(round(r.get('sold') or 0, 2))), status=status, batch=batch,
                rules_version=r['rules_version'],
                second_opinion={'problems': r.get('problems') or [], 'item_details': r.get('item_details') or {},
                                'flags': r.get('flags') or ''},
            ))
    with transaction.atomic():
        ProductProposal.objects.filter(batch=batch).delete()
        ProductProposal.objects.bulk_create(objs, batch_size=2000)
    counts['proposals'] = len(objs)
    return counts
