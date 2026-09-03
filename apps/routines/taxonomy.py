"""What a section check counts, and which of it is anyone's fault.

The walk is ordered groups. Each group is a problem and a solution: fix in
place, flag it, just do it, or put it on a cart. Only some of that reaches
the grade.

Graded groups are the owner's job: facing, reshelf, reprep, security. PR and
TARS are recorded so the carts can be seen, never scored. Flags stay flags.
Just-do rows (dirty, trash, hangers) are a reminder on the phone and are
never stored.
"""
from __future__ import annotations

SOLUTION_FIX_IN_PLACE = 'fix_in_place'
SOLUTION_FLAG = 'flag'
SOLUTION_JUST_DO = 'just_do'
SOLUTION_PR_CART = 'pr_cart'
SOLUTION_REPREP_CART = 'reprep_cart'
SOLUTION_RESHELF_CART = 'reshelf_cart'
SOLUTION_SECURITY = 'security'
SOLUTION_TARS_CART = 'tars_cart'

GROUPS = [
    {
        'key': 'facing',
        'solution': SOLUTION_FIX_IN_PLACE,
        'label': 'Facing + tag',
        'label_es': 'Frente y etiqueta',
        'items': [
            {
                'key': 'facing_blocking',
                'label': 'Blocking or hiding items behind',
                'label_es': 'Bloqueando o tapando lo de atras',
            },
            {
                'key': 'facing_upright',
                'label': 'Not faced or upright',
                'label_es': 'Sin frentear o caido',
            },
            {
                'key': 'facing_grouped',
                'label': 'Not grouped with like items',
                'label_es': 'Sin agrupar con los iguales',
            },
            {
                'key': 'tag_facing',
                'label': 'Tag not front-facing',
                'label_es': 'Etiqueta no de frente',
            },
        ],
    },
    {
        'key': 'flags',
        'solution': SOLUTION_FLAG,
        'label': 'Flags',
        'label_es': 'Banderas',
        'items': [
            {
                'key': 'safety',
                'label': 'Safety issue, cannot fix alone',
                'label_es': 'Problema de seguridad, no se puede arreglar solo',
            },
            {
                'key': 'overstocked',
                'label': 'Section full or overstocked',
                'label_es': 'Seccion llena o sobreabastecida',
            },
            {
                'key': 'low_stock',
                'label': 'Section low or empty',
                'label_es': 'Seccion baja o vacia',
            },
        ],
    },
    {
        'key': 'just_do',
        'solution': SOLUTION_JUST_DO,
        'label': 'Just do',
        'label_es': 'Solo hazlo',
        'items': [
            {
                'key': 'clean_dirty',
                'label': 'Dirty or dusty but sellable',
                'label_es': 'Sucio o polvoriento pero se vende',
            },
            {
                'key': 'clean_trash',
                'label': 'Trash on floor or shelf',
                'label_es': 'Basura en el piso o anaquel',
            },
            {
                'key': 'hangers',
                'label': 'Empty hangers on rack',
                'label_es': 'Ganchos vacios en el rack',
            },
        ],
    },
    {
        'key': 'pr_cart',
        'solution': SOLUTION_PR_CART,
        'label': 'PR cart',
        'label_es': 'Carrito de precios',
        'items': [
            {
                'key': 'reprice_discount',
                'label': 'Discount, not selling',
                'label_es': 'Descuento, no se vende',
            },
            {
                'key': 'reprice_too_high',
                'label': 'Priced too high',
                'label_es': 'Precio muy alto',
            },
            {
                'key': 'reprice_too_low',
                'label': 'Priced too low',
                'label_es': 'Precio muy bajo',
            },
            {
                'key': 'reprice_tag_incorrect',
                'label': 'Tag incorrect',
                'label_es': 'Etiqueta incorrecta',
            },
            {
                'key': 'reprice_tag_missing',
                'label': 'Tag missing',
                'label_es': 'Falta etiqueta',
            },
        ],
    },
    {
        'key': 'reprep',
        'solution': SOLUTION_REPREP_CART,
        'label': 'RePrep cart',
        'label_es': 'Carrito de re-prep',
        'items': [
            {
                'key': 'reprep_box',
                'label': 'Box with no photo or display item',
                'label_es': 'Caja sin foto o sin muestra',
            },
            {
                'key': 'reprep_cords',
                'label': 'Cords not wrapped or twist-tied',
                'label_es': 'Cables sin amarrar',
            },
            {
                'key': 'reprep_opened',
                'label': 'Item opened or repackaged',
                'label_es': 'Articulo abierto o reempacado',
            },
        ],
    },
    {
        'key': 'reshelf',
        'solution': SOLUTION_RESHELF_CART,
        'label': 'Reshelf cart',
        'label_es': 'Carrito de reubicar',
        'items': [
            {
                'key': 'reshelf',
                'label': 'Item in wrong section',
                'label_es': 'Articulo en seccion equivocada',
            },
        ],
    },
    {
        'key': 'security',
        'solution': SOLUTION_SECURITY,
        'label': 'Security',
        'label_es': 'Seguridad',
        'items': [
            {
                'key': 'security',
                'label': 'High-theft item loose on floor',
                'label_es': 'Articulo de alto robo suelto en el piso',
            },
        ],
    },
    {
        'key': 'tars',
        'solution': SOLUTION_TARS_CART,
        'label': 'TARS cart',
        'label_es': 'Carrito TARS',
        'items': [
            {
                'key': 'tars_damaged',
                'label': 'Item damaged',
                'label_es': 'Articulo danado',
            },
            {
                'key': 'tars_parts',
                'label': 'Missing parts',
                'label_es': 'Faltan piezas',
            },
        ],
    },
]

GRADED_GROUP_KEYS = ('facing', 'reshelf', 'reprep', 'security')
RECORDED_GROUP_KEYS = ('pr_cart', 'tars')
FLAG_GROUP_KEY = 'flags'
JUST_DO_GROUP_KEY = 'just_do'

SAFETY_FLAG = 'safety'
# A section with a safety problem cannot pass, however tidy the rest of it is.
SAFETY_CAP = 50.0

GROUPS_BY_KEY = {group['key']: group for group in GROUPS}


def _item_rows(group_keys) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for key in group_keys:
        group = GROUPS_BY_KEY[key]
        for item in group['items']:
            rows.append((item['key'], item['label']))
    return rows


# Derived lists so Grades and older callers still have a flat shape.
GRADED = [(key, GROUPS_BY_KEY[key]['label']) for key in GRADED_GROUP_KEYS]
RECORDED = [(key, GROUPS_BY_KEY[key]['label']) for key in RECORDED_GROUP_KEYS]
FLAGS = _item_rows((FLAG_GROUP_KEY,))

GRADED_KEYS = [key for key, _label in GRADED]
RECORDED_KEYS = [key for key, _label in RECORDED]
FLAG_KEYS = [key for key, _label in FLAGS]

COUNTABLE_KEYS = [
    item['key']
    for group in GROUPS
    if group['key'] not in (FLAG_GROUP_KEY, JUST_DO_GROUP_KEY)
    for item in group['items']
]

ITEM_TO_GROUP = {
    item['key']: group['key']
    for group in GROUPS
    for item in group['items']
}


def taxonomy() -> dict:
    """The shape the phone renders and the Grades view labels rows with."""
    return {
        'groups': [
            {
                'key': group['key'],
                'solution': group['solution'],
                'label': group['label'],
                'label_es': group['label_es'],
                'items': list(group['items']),
            }
            for group in GROUPS
        ],
        'graded': [
            {
                'key': key,
                'label': GROUPS_BY_KEY[key]['label'],
                'label_es': GROUPS_BY_KEY[key]['label_es'],
            }
            for key in GRADED_GROUP_KEYS
        ],
        'recorded': [
            {
                'key': key,
                'label': GROUPS_BY_KEY[key]['label'],
                'label_es': GROUPS_BY_KEY[key]['label_es'],
            }
            for key in RECORDED_GROUP_KEYS
        ],
        'flags': [
            {'key': key, 'label': label, 'label_es': item['label_es']}
            for (key, label), item in zip(
                FLAGS,
                GROUPS_BY_KEY[FLAG_GROUP_KEY]['items'],
            )
        ],
        'safety_flag': SAFETY_FLAG,
    }


def label_for(key: str) -> str:
    if key in GROUPS_BY_KEY:
        return GROUPS_BY_KEY[key]['label']
    for group in GROUPS:
        for item in group['items']:
            if item['key'] == key:
                return item['label']
    return key


def group_sum(counts: dict, group_key: str) -> int:
    group = GROUPS_BY_KEY.get(group_key)
    if not group:
        return int(counts.get(group_key) or 0)
    return sum(int(counts.get(item['key']) or 0) for item in group['items'])


def rollup_counts(counts: dict) -> dict[str, int]:
    """Item counts folded into group keys. Just-do and flags are dropped."""
    raw = counts if isinstance(counts, dict) else {}
    out: dict[str, int] = {}
    for group in GROUPS:
        if group['key'] in (FLAG_GROUP_KEY, JUST_DO_GROUP_KEY):
            continue
        total = group_sum(raw, group['key'])
        # Already-rolled group keys (from an older report) still count.
        if group['key'] in raw and group['key'] not in COUNTABLE_KEYS:
            try:
                total += int(raw.get(group['key']) or 0)
            except (TypeError, ValueError):
                pass
        if total:
            out[group['key']] = total
    return out


def clean_counts(raw) -> dict[str, int]:
    """Only countable item keys, only non-negative whole numbers."""
    out: dict[str, int] = {}
    if not isinstance(raw, dict):
        return out
    for key in COUNTABLE_KEYS:
        try:
            value = int(raw.get(key) or 0)
        except (TypeError, ValueError):
            value = 0
        out[key] = max(value, 0)
    return out


def clean_flags(raw) -> list[str]:
    if not isinstance(raw, (list, tuple)):
        return []
    return [key for key in FLAG_KEYS if key in raw]
