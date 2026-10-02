"""
Spec rules: which details make a different **product** (they change the price) and which are **item** details
(they don't: the item keeps them for accounting and still maps to the one product).

These are hard rules: the standardize run and the dedupe call both read them, so the same product gets
the same decision every day. They change only by a new RULES_VERSION, recorded on every proposal
(`ProductProposal.rules_version`), so any group of products can be reopened and re-split under a newer
version, reversibly. The human-readable copy is `.ai/extended/product-standard.md`; keep both in step.

Owner direction (2026-09-29): standardize everything, then dedupe; product specs are the details that
matter to price; item specs are the ones that don't; rules per category and type, evolving but fixed per
version, so we never merge and explode the same products in circles.
"""
from __future__ import annotations

RULES_VERSION = 'spec-v6'  # v2: G4, G9, G10; v3: G11-G13; v4: examples, G14; v5: brand policies B1-B5; v6: cat5-001/002 vets

# Apply to every category, before the category's own rules.
# Brand policies (owner, 2026-09-29). These decide the brand field; they beat anything else.
BRAND_RULES = [
    'B1. brand = the consumer brand printed on the box, the name a shopper knows it by: Nerf, Funko, Lego, Hanes, '
    'Threshold, Goo Jit Zu, KitchenAid. Not the parent company (Nerf, not Hasbro; Goo Jit Zu, not Moose Toys).',
    'B2. A sub-line, series or collaboration is not the brand; it goes in the title: "Hanes Premium" -> brand Hanes, '
    'title keeps Premium; "Threshold designed with Studio McGee" -> brand Threshold, title keeps Studio McGee; '
    '"Marvel Legends" -> title.',
    'B3. A license (Marvel, Star Wars, Disney, Barbie, Jeep, National Geographic, Pokemon) is never the brand. It goes in '
    'the franchise spec (toys) or the title. The brand is then the maker\'s consumer brand if known (Nerf, Funko, '
    'Hot Wheels), else Generic. franchise = the top-level IP only (Marvel, not Marvel Legends or The Marvels; Star Wars, '
    'not Star Wars Black Series); the product line goes in the title.',
    'B4. A marketplace-only seller name printed on the product (IMossad, AYKLCZUU, Treamon) is kept as the brand exactly '
    'as printed, and flagged junk_brand. Never replace a printed brand with Generic. Generic is only for no brand at '
    'all or a placeholder ("Unbranded", "N/A"). Junk brands never go on the short tag name.',
    'B6. Known makers for licensed toy lines: Gundam/Gunpla -> Bandai; Monster Jam -> Spin Master; Hot Wheels, Barbie '
    'dolls -> Mattel\'s Hot Wheels / Barbie are brands (not licenses); Disney Junior SuperKitties -> Just Play; Pokemon '
    'cards -> Pokemon (The Pokemon Company); Star Wars Black Series, Marvel Legends -> Hasbro; Funko Pop -> Funko. When '
    'the brand is Generic because only a license is known, the license must be in the title and the franchise.',
    'B5. A retailer or exclusive note ("Walmart Exclusive", "Target Exclusive", "Amazon Basics bundle") is never a spec, '
    'never in the title, never in the vector text.',
]

GLOBAL_RULES = [
    'G1. Brand and model number are product fields, never specs.',
    'G2. Condition (new, used, open box, missing pieces, damaged) is always an item detail, never a product spec.',
    'G3. Color, pattern and finish are item details unless the category lists them as a product spec.',
    'G4. Pack size and count ("6pk", "50ct", "set of 4") are product specs everywhere: a 6-pack and a 12-pack '
    'are different products.',
    'G5. Brands follow B1-B5 above. A product with a junk brand (B4) is identified by its type plus its product specs.',
    'G6. Model numbers that differ only by a color or region suffix are the same model: keep the base model, '
    'put the full ones in aliases.',
    'G7. Never invent a spec. Leave a spec out when the title and data do not state it.',
    'G8. Units: in, ft, oz, fl oz, qt, gal, lb, W, V, mAh, GB, TB; numbers without thousands separators.',
    'G9. A number goes into a key only when it measures what the key names: size is the product\'s own dimensions '
    'or size grade; capacity is volume, load or output; count is sellable units in the pack; piece_count is '
    'separate pieces in a set. Feature figures (speeds, settings, power levels, suction, sheet capacity, key '
    'counts) and included accessories (a travel cup, sidewalls, tips) stay out of specs.',
    'G10. The number of cubes, drawers, tiers, jars, compartments or slots that defines a storage piece or rack '
    'is its size ("8-cube", "3-drawer", "20-jar"), not piece_count. Never repeat one number in two keys.',
    'G11. count, piece_count and thread_count are bare integers ("100", "2", "400"), never "100ct" or "2pc".',
    'G12. A material is a material (wood, metal, plastic, glass, cotton, leather, fabric). Form or construction '
    'words (wire, knit, woven, upholstered, rattan-look) are not: wire means metal.',
    'G13. A finish or color word (brass, chrome, gold, matte black, walnut finish) is an item detail, never the '
    'material, the title or the vector text.',
    'G14. Use the most specific material the title states (MDF, not wood; stainless steel, not metal), and never '
    'drop a stated material (a steel lopper, wooden arms). A type value must be specific enough to price by '
    '("above ground swimming pool", "outdoor rug", not "pool", "rug"), but it repeats the title\'s noun: never upgrade '
    'it to a different, more valuable type ("air conditioner fan" stays that, not "portable air conditioner").',
    'G15. size holds only a measurement or a size grade (Twin, S/M/L, 27in, 8.45 fl oz, 3-shelf, 5-tier). Audience '
    'words (adult), type modifiers (mini goes into the type: "mini waffle maker") and system labels (SAE/MM) are not '
    'sizes. Shelves, tiers and drawers that define a piece are size (G10). If no listed key fits a stated measurement, '
    'leave it out of key_specs and keep it in the title.',
    'G16. Identical items sold together ("2pc" chaise lounges, a pair of chairs) are a count; piece_count is only for '
    'different pieces in a set. "Finish" words (Teak Finish) go to item_details.finish, never color.',
]

# category -> product_specs (keys, in the order a shopper cares), item_specs (keys kept on the item), notes.
# Keys are snake_case and shared across categories where they mean the same thing.
CATEGORY_RULES: dict[str, dict] = {
    'Electronics': {
        'product_specs': ['device_type', 'storage', 'capacity_mah', 'wattage', 'screen_size', 'connector',
                          'compatible_with', 'generation'],
        'item_specs': ['color', 'serial_number', 'accessories_included'],
        'notes': 'Storage and generation make different products (iPad 64GB vs 256GB). Color never does.',
    },
    'Appliances': {
        'product_specs': ['appliance_type', 'capacity', 'wattage', 'size', 'fuel_or_power', 'cordless'],
        'item_specs': ['color', 'serial_number'],
        'notes': 'Corded and cordless versions are different products.',
    },
    'Kitchen & dining': {
        'product_specs': ['item_type', 'capacity', 'size', 'piece_count', 'material', 'wattage'],
        'item_specs': ['color', 'pattern'],
        'notes': 'A 10-piece and a 12-piece set are different products; the same set in two colors is one product.',
    },
    'Toys & games': {
        'product_specs': ['toy_type', 'franchise', 'character', 'piece_count', 'scale_or_size', 'age_grade',
                          'edition'],
        'item_specs': ['color', 'completeness'],
        'notes': 'Each character or figure in a line is its own product (a Spider-Man and a Hulk figure are two '
                 'products). Set number defines a building set.',
    },
    'Tools & hardware': {
        'product_specs': ['tool_type', 'power_source', 'voltage', 'size', 'capacity', 'rating', 'piece_count',
                          'tool_only_or_kit'],
        'item_specs': ['color', 'serial_number'],
        'notes': 'Tool-only and kit (with battery) are different products. Battery voltage is a product spec. '
                 'rating = the defining output (3800 psi 2.6 gpm, 1800 W, 20 gal tank).',
    },
    'Furniture': {
        'product_specs': ['furniture_type', 'size', 'material', 'seats', 'piece_count', 'assembly'],
        'item_specs': ['color', 'finish'],
        'notes': 'Size (Twin/Full/Queen/King, dimensions) makes different products. Finish color does not.',
    },
    'Outdoor & patio furniture': {
        'product_specs': ['furniture_type', 'size', 'material', 'piece_count', 'seats'],
        'item_specs': ['color', 'cushion_color'],
        'notes': 'Set piece count makes different products.',
    },
    'Home décor & lighting': {
        'product_specs': ['decor_type', 'size', 'material', 'bulb_type', 'piece_count'],
        'item_specs': ['color', 'pattern'],
        'notes': 'Rugs and curtains: size is a product spec. Pattern and color are item details.',
    },
    'Bedding & bath': {
        'product_specs': ['bedding_type', 'bed_size', 'size', 'material', 'piece_count', 'thread_count'],
        'item_specs': ['color', 'pattern'],
        'notes': 'Bed size (Twin, Full, Queen, King) always makes a different product; size is for non-bed items '
                 '(a 50x60in throw, a bath rug).',
    },
    'Apparel & accessories': {
        'product_specs': ['garment_type', 'gender_or_age', 'material'],
        'item_specs': ['size', 'color', 'pattern'],
        'notes': 'Size and color are item details: one product per style. Shoes: the size is an item detail too.',
    },
    'Health, beauty & personal care': {
        'product_specs': ['product_type', 'size', 'count', 'scent_or_shade'],
        'item_specs': ['expiration'],
        'notes': 'Scent or shade is a product spec (it is what the shopper picks).',
    },
    'Household & cleaning': {
        'product_specs': ['product_type', 'size', 'capacity', 'count', 'scent'],
        'item_specs': [],
        'notes': '',
    },
    'Sports & outdoors': {
        'product_specs': ['item_type', 'size', 'capacity', 'sport', 'piece_count'],
        'item_specs': ['color'],
        'notes': 'Tents and coolers: capacity (persons, quarts) makes different products.',
    },
    'Pet supplies': {
        'product_specs': ['item_type', 'animal', 'size', 'capacity', 'count', 'flavor'],
        'item_specs': ['color'],
        'notes': 'Pet size (S/M/L) is a product spec for beds, crates and collars.',
    },
    'Baby & kids': {
        'product_specs': ['item_type', 'size', 'count', 'age_grade'],
        'item_specs': ['color', 'pattern'],
        'notes': 'Diapers: size and count are product specs.',
    },
    'Office & school supplies': {
        'product_specs': ['item_type', 'count', 'size'],
        'item_specs': ['color'],
        'notes': '',
    },
    'Party, seasonal & novelty': {
        'product_specs': ['item_type', 'holiday_or_theme', 'size', 'count'],
        'item_specs': ['color'],
        'notes': 'The holiday or theme is a product spec (a Christmas and a Halloween item are different products).',
    },
    'Storage & organization': {
        'product_specs': ['item_type', 'size', 'capacity', 'count', 'material'],
        'item_specs': ['color'],
        'notes': '',
    },
    'Lawn & garden': {
        'product_specs': ['item_type', 'power_source', 'size', 'capacity', 'voltage'],
        'item_specs': ['color'],
        'notes': 'Gas, corded and battery versions are different products.',
    },
    'Automotive': {
        'product_specs': ['item_type', 'size', 'volume', 'compatible_with'],
        'item_specs': [],
        'notes': '',
    },
    'Arts & crafts': {
        'product_specs': ['item_type', 'count', 'size', 'material'],
        'item_specs': ['color'],
        'notes': 'Multi-color packs are one product; a single color of paint or yarn is an item detail.',
    },
    'Books & media': {
        'product_specs': ['media_type', 'format', 'platform', 'edition'],
        'item_specs': [],
        'notes': 'Each title is a product. Format (hardcover, paperback, DVD, Blu-ray) and game platform are '
                 'product specs.',
    },
    'Mixed lots & uncategorized': {
        'product_specs': [],
        'item_specs': [],
        'notes': 'Only a real mixed lot or a vague title (see the taxonomy).',
    },
}


def rules_for(category: str) -> dict:
    """The category's rules (empty lists for an unknown category). G4: `count` (pack size) is allowed in every
    category, even where the list doesn't name it."""
    r = CATEGORY_RULES.get(category) or {'product_specs': [], 'item_specs': [], 'notes': ''}
    specs = r['product_specs'] if 'count' in r['product_specs'] or not r['product_specs'] else [*r['product_specs'], 'count']
    return {**r, 'product_specs': specs}


def prompt_block() -> str:
    """The rules as text for a model prompt (global rules, then one line per category)."""
    lines = [f'Brand rules ({RULES_VERSION}; these win):', *BRAND_RULES, '', 'Spec rules:', *GLOBAL_RULES, '',
             'Per category (product specs | item details | note):']
    for cat, r in CATEGORY_RULES.items():
        r = rules_for(cat)
        lines.append(f"- {cat}: {', '.join(r['product_specs']) or '-'} | {', '.join(r['item_specs']) or '-'}"
                     + (f" | {r['notes']}" if r['notes'] else ''))
    return '\n'.join(lines)
