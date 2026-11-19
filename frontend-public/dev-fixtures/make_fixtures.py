"""Make the phone site's dev fixtures (home.json, stock.json) from the round-3 mockup's data (dev only, not shipped).

    python frontend-public/dev-fixtures/make_fixtures.py <round3 folder>

The round-3 mockup lives in the main checkout's workspace/app-mockups/round3 (kit/stock.js, kit/finds.js: real rows read
from Dash on 2026-11-19). The output has the exact shape of apps/storefront's feeds (BRIEF-BE.md), category indexes in
the order of apps/buying/taxonomy_v1.py.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# apps/buying/taxonomy_v1.py TAXONOMY_V1_CATEGORY_NAMES order, as the ids of apps/storefront/services/rules.py.
CAT_IDS = ['kitchen', 'furniture', 'patio', 'decor', 'household', 'bedbath', 'storage', 'toys', 'sports', 'tools', 'office',
           'electronics', 'baby', 'health', 'apparel', 'media', 'pet', 'party', 'garden', 'appliances', 'crafts', 'auto',
           'other']


def grab(src: str, pattern: str):
    m = re.search(pattern, src, re.S)
    if not m:
        raise SystemExit(f'not found: {pattern}')
    return json.loads(m.group(1))


def main() -> None:
    r3 = Path(sys.argv[1])
    stock = (r3 / 'kit' / 'stock.js').read_text(encoding='utf-8')
    finds_js = (r3 / 'kit' / 'finds.js').read_text(encoding='utf-8')
    mock_cats = grab(stock, r'ECO\.cats = (\[.*?\]);')
    rows_in = grab(stock, r'var I = (\[\[.*?\]\]);')
    rows_co = grab(stock, r'var C = (\[\[.*?\]\]);')
    by_id = {c['id']: c for c in mock_cats}
    idx = {cid: i for i, cid in enumerate(CAT_IDS)}
    names = {c['id']: c['name'] for c in mock_cats}
    cats = [{'id': cid, 'name': names[cid], 'pieces': by_id[cid]['pieces']} for cid in CAT_IDS]

    def cat_of(mock_index: int) -> int:
        return idx[mock_cats[mock_index]['id']]

    instore = []
    for tag, name, ci, price, retail, tb, units in rows_in:
        instore.append([int(tag), name, cat_of(ci), price, retail or 0, tb, units, tag if units == 1 else ''])
    instore.sort(key=lambda r: (0, -(r[4] - r[3])) if r[4] else (1, -r[5], -r[3]))

    trucks = [
        {'id': 501, 'name': 'Wayfair', 'pallets': 24, 'pieces': 0, 'listed': False},
        {'id': 502, 'name': 'Walmart', 'pallets': 21, 'pieces': sum(r[5] for r in rows_co), 'listed': True},
    ]
    coming = [[int(rid[1:]), name, cat_of(ci), retail or 0, qty, 1] for rid, name, ci, _price, retail, qty in rows_co]
    coming.sort(key=lambda r: (-r[3], r[0]))

    # Best finds: the mockup's own list, matched to the shelf rows by tag number.
    finds_src = re.search(r'ECO\.finds = \[(.*?)\];', finds_js, re.S).group(1)
    finds = []
    for m in re.finditer(r"\{ tag: '(\d+)', name: '([^']*)', brand: '[^']*', retail: ([\d.]+), price: ([\d.]+), tb: ([\d.]+), dept: '(\w+)'", finds_src):
        tag, name, retail, price, tb, dept = m.groups()
        finds.append({'pid': int(tag), 'name': name, 'cat': dept, 'price': float(price), 'retail': float(retail),
                      'tb': float(tb), 'units': 1, 'tag': tag, 'photo': None})

    as_of = '2026-11-19T12:00:00-06:00'
    stock_body = {'v': 'fixture-stock', 'as_of': as_of, 'cats': cats, 'trucks': trucks, 'instore': instore, 'coming': coming}
    ranked = sorted((c for c in cats if c['id'] != 'other'), key=lambda c: -c['pieces'])
    home_body = {
        'v': 'fixture-home', 'as_of': as_of, 'day': 'normal',
        'shelf': {'pieces': sum(c['pieces'] for c in cats), 'products': len(instore), 'categories': len(cats)},
        'hours': {
            'timezone': 'America/Chicago', 'open': '09:00', 'close': '18:00', 'closed_weekdays': [6],
            'label': '9 AM - 6 PM, Monday - Saturday · Closed Sunday', 'regular_label': '9 AM - 6 PM, Monday - Saturday · Closed Sunday',
            'resume_label': '', 'overrides': [],
            'today': {'is_override': False, 'label': '', 'closed': False, 'open': '09:00', 'close': '18:00'},
        },
        'thrift_plus_open': True,
        'finds': finds,
        'coming': {
            'trucks': trucks,
            'items': [{'id': r[0], 'name': r[1], 'cat': CAT_IDS[r[2]], 'retail': r[3], 'qty': r[4], 'truck': trucks[r[5]]['id']}
                      for r in coming[:12]],
        },
        'top_cats': [c['id'] for c in ranked[:6]],
    }
    (HERE / 'stock.json').write_text(json.dumps(stock_body, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (HERE / 'home.json').write_text(json.dumps(home_body, ensure_ascii=False, indent=1), encoding='utf-8')
    print('instore', len(instore), 'coming', len(coming), 'finds', len(finds))


if __name__ == '__main__':
    main()
