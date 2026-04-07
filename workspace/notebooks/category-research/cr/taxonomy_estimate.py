"""
Manifest → proposed taxonomy (v1) mapping for Phase 4 estimation.

Loads canonical names from taxonomy_v1.example.json. ``MANIFEST_TO_PROPOSED`` is
built at import from :func:`map_manifest_to_proposed` so the notebook can show
the full mapping for review before distribution tables.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from .paths import category_research_package_root


def _taxonomy_json_path() -> Path:
    return category_research_package_root() / 'taxonomy_v1.example.json'


@lru_cache(maxsize=1)
def proposed_category_names() -> tuple[str, ...]:
    """Nineteen canonical category names in taxonomy_v1 order."""
    raw = _taxonomy_json_path().read_text(encoding='utf-8')
    data: dict[str, Any] = json.loads(raw)
    return tuple(c['name'] for c in data['categories'])


# Short aliases (avoid typos vs JSON)
M = {name: name for name in proposed_category_names()}
KITCHEN = M['Kitchen & dining']
FURNITURE = M['Furniture']
OUTDOOR_PATIO = M['Outdoor & patio furniture']
HOME_DECOR = M['Home décor & lighting']
HOUSEHOLD = M['Household & cleaning']
BEDDING_BATH = M['Bedding & bath']
STORAGE = M['Storage & organization']
TOYS_GAMES = M['Toys & games']
SPORTS_OUT = M['Sports & outdoors']
TOOLS_HW = M['Tools & hardware']
OFFICE_SCHOOL = M['Office & school supplies']
ELECTRONICS = M['Electronics']
BABY_KIDS = M['Baby & kids']
HEALTH_BEAUTY = M['Health, beauty & personal care']
APPAREL = M['Apparel & accessories']
BOOKS_MEDIA = M['Books & media']
PET = M['Pet supplies']
PARTY_SEASONAL = M['Party, seasonal & novelty']
MIXED = M['Mixed lots & uncategorized']


def normalize_manifest_category(value: Any) -> str:
    """Strip; NaN/None → empty string (same bucket as blank manifest)."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ''
    s = str(value).strip()
    return s


# Every distinct manifest label observed in union of extract_bin1/2/3 pickles (2026-04).
# Used to materialize MANIFEST_TO_PROPOSED; unknown labels at runtime still map via map_manifest_to_proposed.
_KNOWN_MANIFEST_LABELS: tuple[str, ...] = (
    '',
    'ACCESSORIES',
    'ACTIVEWEAR',
    'ADULT BEDDING',
    'ARTS_AND_CRAFTS',
    'AUDIO',
    'AUTO RV AND ANTIFREEZE',
    'AUTOMOTIVE TIRES',
    'AUTOMOTIVE_ACCESSORIES',
    'AUTOMOTIVE_FILTERS',
    'AV',
    'Accent Chairs',
    'Accent Furniture',
    'Accessories',
    'Action Figures and Collectibles',
    'Action Figures/Collectibles/Boys Toys - Pantry',
    'Activity & Gear',
    'Air Treatment Appliances',
    'Amps & Effects',
    'Apparel & Leashes',
    'Appliance Parts & Accessories',
    'Appliances',
    'Area Rugs',
    'Art Craft Supplies',
    'Arts & Crafts',
    'Arts, Crafts and Sewing',
    'Artwork',
    'Athletic',
    'Athletic Equipment',
    'Athletic Sports Apparel',
    'Automotive Tools',
    'BABY_ESSENTIALS',
    'BAGS_AND_LUGGAGE',
    'BATHROOM_ACCESSORIES',
    'BATHROOM_FIXTURES',
    'BATHROOM_FURNITURE',
    'BEDDING',
    'BEDROOM_FURNITURE',
    'BEVERAGES',
    'BIKES AND RIDE ONS',
    'BISS',
    'BOOKS',
    'BRAKING',
    'BUILDING_AND_HARDWARE',
    'Baby Bedding',
    'Baby Care',
    'Baby Decor',
    'Baby Product',
    'Baby Wipes',
    'Backpacks',
    'Bakeware',
    'Baking',
    'Bars & Bar Sets',
    'Bath',
    'Bath & Laundry',
    'Bathroom Essentials',
    'Bathroom Furniture',
    'Bathroom/Kitchen Hardware',
    'Beach Gear',
    'Beauty',
    'Beauty Appliances',
    'Beauty Tools',
    'Bedding',
    'Bedroom Furniture',
    'Beds',
    'Blank',
    'Boating',
    'Book',
    'Boys',
    'Boys Basics Accessories and Sleep',
    'Building Materials & Ladders',
    'Business Connected Devices',
    'Business Domestics',
    'CAMERAS',
    'CELL_PHONE_ACCESSORIES',
    'Cabinet & Door Hardware',
    'Cables',
    'Camping Goods',
    'Car Accessories',
    'Car Electronics',
    'Car Seats',
    'Care & Safety',
    "Chef's Apparel",
    "Children's Furniture",
    'Classroom Supplies',
    'Clinical Diagnostics',
    'Commercial Kitchen Items',
    'Computer Components',
    'Computer Peripherals',
    'Construction',
    'Construction - Concrete & Metal Tools',
    'Construction - Power Drills',
    'Construction - Power Saws',
    'Contemporary',
    'Cooking Appliances',
    "Cooks' Tools",
    'Cookware',
    'Coolers',
    'Cosmetics',
    'Costume',
    'Curtains',
    'Cutlery',
    'Cycling',
    'DJ and Lighting',
    'DOORS_AND_WINDOWS',
    'Decorative Accent - Home Accents',
    'Decorative Accent - Wall Accents',
    'Desk Organization & Recordkeeping',
    'Desktop',
    'Diapering',
    'Diapers',
    'Dining Table Sets',
    'Dining Tables',
    'Dinnerware',
    'Dolls Toys',
    'Door & Equipment Hardware',
    'Doors & Shutters',
    'Drinkware',
    'Drives',
    'Drugstore',
    'Drums and Percussion',
    'ENGINE',
    'EQUIPMENT_AND_TOOLS',
    'EXERCISE_AND_FITNESS_EQUIPMENT',
    'EYE_CARE',
    'Education',
    'Education Supplies',
    'Electrical & Heating',
    'End Tables',
    'Entertainment Furniture',
    'Entryway Furniture',
    'Exercise & Fitness',
    'FLOORING_AND_FLOOR_CARE',
    'FRAMES',
    'FURNITURE',
    'FURNITURE AND APPLIANCES',
    'Fans',
    'Farming',
    'Fasteners',
    'Feeding',
    'Fishing',
    'Flatware',
    'Floor & Wall Tile',
    'Flooring',
    'Flow Control & Filtration',
    'Fluid Transfer',
    'Food Prep',
    'Food Service',
    'Food Storage',
    'Fragrance',
    'Furniture',
    'Furniture - Bedroom',
    'Furniture - Home Office',
    'Furniture - Kitchen and Dining',
    'GADGETS AND CUTLERY',
    'GAMING',
    'GARMENT CLOSET AND LAUNDRY',
    'Game Room and Leisure',
    'Games',
    'Gardening',
    'Garment Care',
    'Gifts',
    "Girl's Private Label Active Apparel",
    'Golf',
    'Grilling',
    'Guild',
    'HAIR_CARE',
    'HARDWARE AND TOOLS',
    'HEADPHONES',
    'HEATING_COOLING_AND_AIR_QUALITY',
    'HOLIDAY_APPAREL',
    'HOME ESSENTIALS',
    'HOME IMPROVEMENT',
    'HOME_AUDIO',
    'HOME_DECOR',
    'HOME_ENTERTAINMENT',
    'HOUSEHOLD_ESSENTIALS',
    'Habitats & Supplies',
    'Hair Care',
    'Hair Care & Beauty Appliances',
    'Hair Care and Beauty Appliances',
    'Handtools',
    'Hardware',
    'Hasbro',
    'Headphones',
    'Health & Wellness',
    'Health Care',
    'High/Low',
    'Hobby',
    'Home',
    'Home Decor',
    'Home Environment',
    'Home Improvement',
    'Home Office Furniture',
    'Home Organization',
    'Home Safety',
    'Home Storage',
    'Household Consumables',
    'Hunting, Airsoft and Paintball',
    'INDUSTRIAL_TOOL',
    'INFANT_APPAREL',
    'Ice Makers',
    'Indoor Fireplaces',
    'Industrial Electrical Supplies',
    'Industrial Tools & Instruments',
    'Infant Toys',
    'Infant/Preschool',
    'Inputs',
    'JAN SAN',
    'JEWELRY',
    'Janitorial & Sanitation',
    'Janitorial Supplies',
    'KIDS_APPAREL',
    'KIDS_FURNITURE',
    'KIDS_SHOES',
    'KITCHEN AND BATH',
    'KITCHEN BED AND BATH DECOR OUTDOOR',
    'KITCHEN_AND_DINING',
    'KITCHEN_AND_DINING_FURNITURE',
    'Kitchen',
    'Kitchen Essentials',
    'Kitchen Furniture',
    'LAPTOPS',
    'LIGHTING',
    'LIVING_ROOM_FURNITURE',
    'Lab Equipment & Instruments',
    'Labware, Consumables & Furniture',
    'Lamps',
    'Laptop Accessories',
    'Lawn And Garden',
    'Learning & Technology',
    'Licensed',
    'Light Bulbs',
    'Lighting',
    'Lighting & Fans',
    'Linens',
    'Live Plants & Seeds',
    'Living Room Furniture',
    'Luxury Beauty',
    'Luxury Skin Care',
    'MAJOR_APPLIANCES_KITCHEN',
    'MAKEUP',
    'MATERNITY_APPAREL',
    'MATTRESSES',
    'MEDICATION',
    'MENS_APPAREL',
    'MENS_SHOES',
    'MIXED_APPAREL',
    'MIXED_APPLIANCES',
    'MIXED_AUTOMOTIVE_SUPPLIES',
    'MIXED_BOOKS_MOVIES_AND_MUSIC',
    'MIXED_ELECTRONICS',
    'MIXED_FURNITURE',
    'MIXED_GROCERIES',
    'MIXED_HOME_AND_GARDEN',
    'MIXED_LOTS',
    'MIXED_OFFICE_SUPPLIES_AND_EQUIPMENT',
    'MIXED_SHOES',
    'MIXED_SMALL_APPLIANCES',
    'MIXED_SPORTS_AND_OUTDOORS',
    'MONITORS',
    'MOVIES',
    'MUSIC',
    'MUSICAL_INSTRUMENTS',
    'Mass Cosmetics',
    'Mass Hair Care',
    'Mass Skin Care',
    'Massage/Relaxation',
    'Material Handling',
    'Mattel',
    'Mattresses',
    'Mattresses & Mattress Frames',
    'Mattresses - Utility Bedding',
    'Medical Supplies & Equipment',
    'Memory',
    "Men's Athletic",
    "Men's Grooming",
    "Men's Outerwear",
    "Men's Socks",
    "Men's Underwear",
    'Metalworking',
    'Microwaves',
    'Music',
    'Musical Instruments',
    'Nail',
    'Navigation Electronics',
    'Networking',
    'Novelty/Party Supplies/Costume & Dress Up',
    'Nutrition & Wellness',
    'Nutrition Supplements',
    'OFFICE SUPPLIES',
    'OFFICE_EQUIPMENT',
    'OFFICE_SUPPLIES',
    'ORAL_CARE',
    'OUTDOOR',
    'OUTDOOR_APPLIANCES',
    'OUTDOOR_FURNITURE',
    'OUTDOOR_LIVING_AND_GARDEN',
    'OUTDOOR_POWER_EQUIPMENT',
    'OUTDOOR_SPORTS',
    'Occupational Health & Safety',
    'Office Organization',
    'Oil/Filters',
    'Oral Care',
    'Oral Care Appliances',
    'Other',
    'Other Audio Components',
    'Ottomans',
    'Outdoor',
    'Outdoor & Sports Toys',
    'Outdoor Decor',
    'Outdoor Fireplaces',
    'Outdoor Furniture',
    'Outdoor Living',
    'Outdoor Power',
    'Outdoor Sports Apparel',
    'Outdoor Structures',
    'Outdoors',
    'PANTRY',
    'PARTY_SUPPLIES',
    'PC',
    'PEDIATRIC_CARE',
    'PERSONAL_CARE',
    'PET_FOODS_AND_TREATS',
    'PET_SUPPLIES',
    'PLUMBING',
    'PORTABLE_ELECTRONICS',
    'PRESCHOOL',
    'PRINTERS',
    'Pain Relievers',
    'Painting Supplies',
    'Parts and Accessories',
    'Patio Lounge Chairs',
    'Patio Tables',
    'Personal Care',
    'Personal Care Appliances',
    'Pet',
    'Planters',
    'Plumbing - Core',
    'Plumbing - Vanities',
    'Plumbing Fixtures',
    'Plush',
    'Pneumatics',
    'Pool & Spa Supplies',
    'Power Equipment',
    'Power Tool Accessories',
    'Power Tools',
    'Power Transmission',
    'Powersports & Marine',
    'Professional Medical',
    'Professional Salon & Spa',
    'Professional Skin Care',
    'Puzzles',
    'RUGS',
    'RV Parts & Accessories',
    'Raw Materials',
    'Recliners',
    'Replacement Parts - Undercar',
    'Replacement Parts - Underhood',
    'Ride-Ons',
    'Rough Plumbing',
    'Rugs',
    'SAFETY_WEAR',
    'SEASONAL',
    'SHAVE AND GROOMING',
    'SKIN_CARE',
    'SMALL_APPLIANCES_MIXED',
    'SMART_HOME',
    'SNACKS',
    'SOFTWARE',
    'SPORTS',
    'SPORTS_EQUIPMENT',
    'STEERING_AND_CHASSIS',
    'STORAGE',
    'SWIMWEAR',
    'Seasonal Decor',
    'Seasonal Home Decor',
    'Security & Safety',
    'Serveware',
    'Shaving & Hair Removal',
    'Shipping and Packaging Supplies',
    'Sideboards & Buffets',
    'Skate and Street Sports',
    'Small Electrics',
    'Small Kitchen Appliances',
    'Soaps',
    'Sofas',
    'Sound and Recording',
    'Spas',
    'Special Events',
    'Sports',
    'Storage',
    'Storage & Org - Frequency',
    'Storage & Org - Systems',
    'Storage/Laundry',
    'Strathwood',
    'Street, Surf & Snow',
    'Stringed Instruments',
    'Strollers',
    'Sunglasses',
    'TABLETS',
    'TOYS',
    'TRAVEL GEAR',
    'TVS',
    'Tablet Accessories',
    'Tabletop',
    'Tablets',
    'Tapes, Adhesives, Lubricants & Chemicals',
    'Team Sports',
    'Test & Measurement',
    'Tool Organization & Garage Storage',
    'Tools',
    'Tools & Accessories',
    'Toy',
    'Toys',
    'Trash Cans',
    'Truck Accessories',
    'True Components',
    'UTILITY BEDDING',
    'Upholstery - Core',
    'Upholstery - Niche',
    'VACUUMS',
    'VEHICLES SEASONAL GAMES PUZZLES BUILDING SETS',
    'VITAMINS_AND_SUPPLEMENTS',
    'Vanities',
    'Vanity Mirrors',
    'Vehicles',
    'WATCHES',
    'WEARABLES',
    'WOMENS_APPAREL',
    'WOMENS_SHOES',
    'Wall Art',
    'Water Filtration',
    'Wayfair',
    'Wheel & Tire Accessories',
    'Window',
    'Window Treatments',
    'Winter and Water Sports',
    'Wireless Accessories',
    "Women's Active",
    "Women's Everyday Sportswear",
    'Woodwind and Brass',
    'Woodworking',
    'Youth Bedroom',
)


# Exact manifest_label → (proposed_category, ambiguous). Applied first so regex
# order cannot mis-route (e.g. "Pantry" in a toy label, Bathroom/Kitchen Hardware).
EXPLICIT_MANIFEST_OVERRIDES: dict[str, tuple[str, bool]] = {
    # Health, beauty & personal care (were Mixed or weak matches)
    'Hair Care': (HEALTH_BEAUTY, False),
    'Mass Hair Care': (HEALTH_BEAUTY, False),
    'Mass Skin Care': (HEALTH_BEAUTY, False),
    'Mass Cosmetics': (HEALTH_BEAUTY, False),
    'MAKEUP': (HEALTH_BEAUTY, False),
    'Nail': (HEALTH_BEAUTY, False),
    'Shaving & Hair Removal': (HEALTH_BEAUTY, False),
    'PERSONAL_CARE': (HEALTH_BEAUTY, False),
    'Health & Wellness': (HEALTH_BEAUTY, False),
    'Personal Care': (HEALTH_BEAUTY, False),
    'HAIR_CARE': (HEALTH_BEAUTY, False),
    'ORAL_CARE': (HEALTH_BEAUTY, False),
    'SKIN_CARE': (HEALTH_BEAUTY, False),
    'SHAVE AND GROOMING': (HEALTH_BEAUTY, False),
    'Cosmetics': (HEALTH_BEAUTY, False),
    'Oral Care': (HEALTH_BEAUTY, False),
    # Toys & games
    'Games': (TOYS_GAMES, False),
    'Action Figures/Collectibles/Boys Toys - Pantry': (TOYS_GAMES, False),
    'Hobby': (TOYS_GAMES, True),
    # Household & cleaning — generic “home” labels
    'Home': (HOUSEHOLD, True),
    'Home Environment': (HOUSEHOLD, True),
    'Light Bulbs': (HOUSEHOLD, False),
    'Garment Care': (HOUSEHOLD, False),
    'Indoor Fireplaces': (HOUSEHOLD, True),
    # Home improvement → tools (not Mixed)
    'Home Improvement': (TOOLS_HW, True),
    'HOME IMPROVEMENT': (TOOLS_HW, True),
    'Doors & Shutters': (TOOLS_HW, False),
    'Floor & Wall Tile': (TOOLS_HW, False),
    'Bathroom/Kitchen Hardware': (TOOLS_HW, False),
    'Car Accessories': (TOOLS_HW, False),
    'Vehicles': (TOOLS_HW, True),
    'BRAKING': (TOOLS_HW, False),
    # Electronics
    'Fans': (ELECTRONICS, False),
    'Small Electrics': (ELECTRONICS, False),
    'Desktop': (ELECTRONICS, False),
    'Musical Instruments': (ELECTRONICS, False),
    'MUSICAL_INSTRUMENTS': (ELECTRONICS, False),
    'Sound and Recording': (ELECTRONICS, False),
    'Drums and Percussion': (ELECTRONICS, True),
    'Stringed Instruments': (ELECTRONICS, True),
    'Woodwind and Brass': (ELECTRONICS, True),
    # Sports & outdoors
    'Coolers': (SPORTS_OUT, False),
    'Beach Gear': (SPORTS_OUT, False),
    'OUTDOOR_POWER_EQUIPMENT': (SPORTS_OUT, True),
    # Outdoor & patio furniture / outdoor living
    'OUTDOOR_APPLIANCES': (OUTDOOR_PATIO, True),
    'OUTDOOR_LIVING_AND_GARDEN': (OUTDOOR_PATIO, True),
    'Outdoor Furniture': (OUTDOOR_PATIO, False),
    'OUTDOOR_FURNITURE': (OUTDOOR_PATIO, False),
    # Kitchen & dining
    'Water Filtration': (KITCHEN, False),
    # Party, seasonal & novelty
    'Gifts': (PARTY_SEASONAL, True),
    # Baby & kids
    'Care & Safety': (BABY_KIDS, False),
    'Activity & Gear': (BABY_KIDS, True),
    'Boys': (BABY_KIDS, True),
    'Boys Basics Accessories and Sleep': (BABY_KIDS, False),
    # Home décor & lighting
    'Vanity Mirrors': (HOME_DECOR, False),
    # Mixed manifest noise / true mixed
    'KITCHEN BED AND BATH DECOR OUTDOOR': (MIXED, True),
    'FURNITURE AND APPLIANCES': (MIXED, True),
}


def map_manifest_to_proposed(label: str) -> tuple[str, bool]:
    """
    Map one manifest label (after :func:`normalize_manifest_category`) to
    (proposed_category_name, ambiguous_guess).
    """
    raw = label
    key = raw.strip()
    u = key.upper()

    if not u:
        return (MIXED, False)

    if key in EXPLICIT_MANIFEST_OVERRIDES:
        return EXPLICIT_MANIFEST_OVERRIDES[key]

    # --- Explicit MIXED_* (best guess; flagged) ---
    mixed_explicit: dict[str, tuple[str, bool]] = {
        'MIXED_LOTS': (MIXED, False),
        'MIXED_GROCERIES': (KITCHEN, True),
        'MIXED_APPAREL': (APPAREL, True),
        'MIXED_SHOES': (APPAREL, True),
        'MIXED_FURNITURE': (FURNITURE, True),
        'MIXED_ELECTRONICS': (ELECTRONICS, True),
        'MIXED_SPORTS_AND_OUTDOORS': (SPORTS_OUT, True),
        'MIXED_BOOKS_MOVIES_AND_MUSIC': (BOOKS_MEDIA, True),
        'MIXED_OFFICE_SUPPLIES_AND_EQUIPMENT': (OFFICE_SCHOOL, True),
        'MIXED_SMALL_APPLIANCES': (KITCHEN, True),
        'MIXED_APPLIANCES': (KITCHEN, True),
        'MIXED_AUTOMOTIVE_SUPPLIES': (TOOLS_HW, True),
        'MIXED_HOME_AND_GARDEN': (HOME_DECOR, True),
    }
    if u in mixed_explicit:
        return mixed_explicit[u]

    # Pets (before generic HOME)
    if re.search(
        r'^PET_|^PET\b|APPAREL & LEASHES|PET_FOODS|HABITATS & SUPPLIES',
        u,
    ) or 'PET_' in u:
        return (PET, u.startswith('PET_') or 'MIXED' in u)

    # Books & media (short labels)
    if u in ('BOOKS', 'BOOK', 'MOVIES', 'MUSIC', 'SOFTWARE', 'MOVIE'):
        return (BOOKS_MEDIA, False)

    # Apparel & accessories (before Baby so KIDS_APPAREL / MATERNITY_APPAREL win)
    if re.search(
        r'APPAREL|ACTIVEWEAR|SWIMWEAR|MATERNITY_APPAREL|ATHLETIC SPORTS APPAREL|'
        r"WOMEN'?S|MEN'?S|KIDS_APPAREL|KIDS_SHOES|INFANT_APPAREL|HOLIDAY_APPAREL|"
        r'JEWELRY|WATCHES|SUNGLASSES|BAGS_AND_LUGGAGE|BACKPACK|SOCKS|UNDERWEAR|'
        r'OUTERWEAR|SAFETY_WEAR|CHEF\'?S APPAREL|HEADPHONES|^ACCESSORIES$',
        u,
    ):
        if 'PHONE' in u or 'HEADPHONES' in u:
            return (ELECTRONICS, False)
        return (APPAREL, 'MIXED' in u or 'ATHLETIC' in u)

    # Baby & kids
    if re.search(
        r'BABY|INFANT\b|DIAPER|STROLLER|CAR SEAT|KIDS_FURNITURE|'
        r"PRESCHOOL|CHILDREN'?S FURNITURE|YOUTH BEDROOM|FEEDING|BABY WIPES|"
        r'BABY_|PEDIATRIC_CARE|INFANT/PRESCHOOL|INFANT TOYS',
        u,
    ):
        if 'TOY' in u or 'TOYS' in u or 'DOLL' in u:
            return (TOYS_GAMES, True)
        return (BABY_KIDS, False)

    # Kitchen & dining
    if re.search(
        r'KITCHEN|DINING|COOKWARE|BAKEWARE|DINNERWARE|FLATWARE|CUTLERY|DRINKWARE|'
        r'PANTRY|BEVERAGES|FOOD PREP|FOOD SERVICE|FOOD STORAGE|TABLETOP|SERVEWARE|'
        r'COMMERCIAL KITCHEN|GADGETS|CUTLERY|SMALL KITCHEN|MICROWAV|ICE MAKER|'
        r'COOKING APPLIANCES|COOKWARE|BAKING|BARWARE|CAMPING GOODS',
        u,
    ):
        if 'BATH' in u and 'KITCHEN' not in u and 'DINING' not in u:
            return (BEDDING_BATH, True)
        return (KITCHEN, False)

    if u in (
        'MAJOR_APPLIANCES_KITCHEN',
        'SMALL_APPLIANCES_MIXED',
        'AIR TREATMENT APPLIANCES',
        'APPLIANCES',
    ):
        return (KITCHEN, True)

    # Toys & games
    if re.search(
        r'^TOYS$|^TOY$|TOYS\b|ACTION FIGURE|PLUSH|PUZZLE|DOLL|HASBRO|MATTEL|'
        r'GAME ROOM|BOARD GAMES|VEHICLES SEASONAL GAMES',
        u,
    ):
        return (TOYS_GAMES, False)
    if 'OUTDOOR & SPORTS TOYS' in raw or 'RIDE-ON' in u:
        return (TOYS_GAMES, True)

    # Outdoor & patio furniture
    if re.search(
        r'OUTDOOR_FURNITURE|PATIO|GRILL|OUTDOOR LIVING|LAWN AND GARDEN|'
        r'OUTDOOR POWER|POOL & SPA|OUTDOOR STRUCT|OUTDOOR FIRE|STRATHWOOD|'
        r'GARDENING|PLANTER|LIVE PLANTS',
        u,
    ):
        if 'TOY' in u:
            return (TOYS_GAMES, True)
        return (OUTDOOR_PATIO, 'DECOR' in u)

    # Sports & outdoors
    if re.search(
        r'OUTDOOR_SPORTS|SPORTS_EQUIPMENT|EXERCISE|FITNESS|GOLF|CYCLING|FISHING|'
        r'BOATING|HUNTING|PAINTBALL|CAMPING|SKATE|TEAM SPORTS|ATHLETIC EQUIPMENT|'
        r'WINTER AND WATER|OUTDOORS$|OUTDOOR$|^SPORTS$|BIKES AND|WINTER SPORTS|'
        r'POWERSPORTS|MARINE|SKI|SNOW|SWIM|EXERCISE_AND_FITNESS',
        u,
    ):
        return (SPORTS_OUT, False)

    # Tools & hardware (incl. automotive repair, plumbing supply)
    if re.search(
        r'HARDWARE|TOOLS\b|POWER TOOL|CONSTRUCTION|FASTENER|BUILDING|PLUMBING|'
        r'ELECTRICAL|AUTOMOTIVE|AUTO |TIRE|BRAKE|ENGINE|STEERING|CHASSIS|'
        r'REPLACEMENT PART|OIL/FILTERS|WHEEL & TIRE|TRUCK ACCESSORIES|'
        r'PAINTING SUPPLIES|DOORS_AND|WINDOW\b|FLOORING|ROOF|LADDER|'
        r'INDUSTRIAL|METALWORKING|WOODWORKING|PNEUMATIC|MATERIAL HANDLING|'
        r'TEST & MEASUREMENT|COMMERCIAL KITCHEN',
        u,
    ):
        if 'KITCHEN' in u and 'TOOL' not in u and 'HARDWARE' not in u:
            return (KITCHEN, True)
        return (TOOLS_HW, False)

    # Electronics
    if re.search(
        r'TV|COMPUTER|LAPTOP|TABLET|PHONE|CAMERA|AUDIO|HEADPHONE|ELECTRONIC|'
        r'GAMING\b|MONITOR|PRINTER|NETWORK|SMART_HOME|WEARABLE|CELL_PHONE|'
        r'HOME_AUDIO|HOME_ENTERTAINMENT|PORTABLE_ELECTRONICS|CAR ELECTRONICS|'
        r'NAVIGATION|DJ AND|AV\b|PC\b|TABLETS\b|CABLES|INPUTS|DRIVES|MEMORY|'
        r'WIRELESS|BUSINESS CONNECTED|LEARNING & TECHNOLOGY',
        u,
    ):
        return (ELECTRONICS, False)

    # Home décor & lighting
    if re.search(
        r'HOME_DECOR|DECOR|RUG|CURTAIN|WALL ART|FRAMES|LAMP|LIGHTING|'
        r'SEASONAL.*DECOR|ARTWORK|WINDOW TREATMENT|AREA RUG|ACCENT|'
        r'DECORATIVE ACCENT|SEASONAL HOME|WALL ACCENT|HOME ACCENTS',
        u,
    ):
        return (HOME_DECOR, False)

    # Furniture (non-office, non-outdoor)
    if re.search(
        r'FURNITURE|SOFA|RECLINER|OTTOMAN|DINING TABLE|BEDROOM|LIVING ROOM|'
        r'ENTERTAINMENT FURNITURE|ENTRYWAY|END TABLE|VANITIES|BEDS\b|'
        r'SIDEBOARD|BAR SET|MATTRESS|UPHOLSTERY|ACCENT CHAIR',
        u,
    ):
        if 'KITCHEN AND DINING' in u or 'KITCHEN' in u and 'FURNITURE' in u:
            return (KITCHEN, True)
        return (FURNITURE, False)

    # Office & school
    if re.search(
        r'OFFICE|CLASSROOM|EDUCATION|DESK ORGANIZATION|SCHOOL|OFFICE SUPPLIES|'
        r'LAB EQUIPMENT|LABWARE',
        u,
    ):
        return (OFFICE_SCHOOL, 'LAB' in u)

    # Health, beauty & personal care
    if re.search(
        r'BEAUTY|COSMETIC|SKIN_CARE|HAIR_CARE|ORAL|SHAVE|GROOMING|FRAGRANCE|'
        r'HEALTH CARE|MEDICATION|VITAMIN|NUTRITION|PERSONAL CARE|MASSAGE|'
        r'EYE_CARE|DRUGSTORE|PAIN RELIEVER|PROFESSIONAL SALON|PROFESSIONAL SKIN|'
        r'LUXURY BEAUTY|CLINICAL|PROFESSIONAL MEDICAL|MEDICAL SUPPLIES|'
        r'PEDIATRIC_CARE|SOAP',
        u,
    ):
        return (HEALTH_BEAUTY, False)

    # Bedding & bath
    if re.search(
        r'BEDDING|BATH|LINEN|TOWEL|SHOWER|BATHROOM_ACCESSORIES|UTILITY BEDDING|'
        r'ADULT BEDDING|MATTRESSES|BATHROOM_FIXTURES|BATHROOM_FURNITURE',
        u,
    ):
        return (BEDDING_BATH, False)

    # Household & cleaning
    if re.search(
        r'HOUSEHOLD|CLEANING|JANITORIAL|VACUUM|FLOOR CARE|LAUNDRY|TRASH|'
        r'JAN SAN|AIR TREATMENT|HEATING_COOLING|HOME SAFETY|SECURITY & SAFETY|'
        r'HOME ESSENTIALS|HOUSEHOLD CONSUMABLES|SHIPPING AND PACKAGING',
        u,
    ):
        return (HOUSEHOLD, False)

    # Storage & organization
    if re.search(r'STORAGE|ORGANIZATION|GARMENT CLOSET|TOOL ORGANIZATION', u):
        return (STORAGE, False)

    # Arts & crafts / party (instruments → Electronics via explicit overrides)
    if re.search(
        r'ARTS|CRAFT|SEWING|PARTY|NOVELTY|COSTUME|SEASONAL|SPECIAL EVENTS',
        u,
    ):
        return (PARTY_SEASONAL, False)

    # Books & media (wider)
    if re.search(r'BOOK|MOVIE|MUSIC\b|SOFTWARE', u):
        return (BOOKS_MEDIA, 'MUSIC' in u and 'INSTRUMENT' in u)

    # Fallback known noisy labels
    if u in ('OTHER', 'BLANK', 'HOME', 'OTHER AUDIO COMPONENTS'):
        return (MIXED, True)
    if u == 'WAYFAIR' or u == 'GUILD':
        return (MIXED, True)

    return (MIXED, True)


MANIFEST_TO_PROPOSED: dict[str, tuple[str, bool]] = {
    k: map_manifest_to_proposed(k) for k in _KNOWN_MANIFEST_LABELS
}


def manifest_mapping_audit_table() -> pd.DataFrame:
    """Sorted DataFrame of every known manifest label → proposed category + flag."""
    rows = [
        {'manifest_label': k or '(blank)', 'proposed_category': v[0], 'ambiguous': v[1]}
        for k, v in sorted(MANIFEST_TO_PROPOSED.items(), key=lambda x: (x[0] == '', x[0].lower()))
    ]
    return pd.DataFrame(rows)


def map_manifest_series(series: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Map manifest_category column to proposed names and ambiguous flags."""
    norm = series.map(normalize_manifest_category)
    packed = norm.map(lambda m: map_manifest_to_proposed(str(m) if m is not None else ''))
    props = packed.map(lambda t: t[0])
    ambs = packed.map(lambda t: t[1])
    return props, ambs


def proposed_distribution(df: pd.DataFrame) -> pd.DataFrame:
    """
    Full 19-row summary: item_count and percentage_of_bin for each proposed category.
    Sorted by percentage descending (zeros at bottom).
    """
    if 'manifest_category' not in df.columns:
        raise KeyError('DataFrame must have manifest_category column')
    n = len(df)
    if n == 0:
        base = pd.DataFrame(
            {
                'proposed_category': list(proposed_category_names()),
                'item_count': [0] * 19,
                'percentage_of_bin': [0.0] * 19,
            },
        )
        return base

    norm = df['manifest_category'].map(normalize_manifest_category)
    proposed = norm.map(lambda m: map_manifest_to_proposed(m)[0])
    counts = proposed.value_counts()
    names = proposed_category_names()
    full = pd.Series(0, index=list(names), dtype='int64')
    for k, v in counts.items():
        if k in full.index:
            full.loc[k] = int(v)
        else:
            full.loc[MIXED] = full.loc[MIXED] + int(v)

    pct = 100.0 * full / n
    out = pd.DataFrame(
        {
            'proposed_category': full.index,
            'item_count': full.values,
            'percentage_of_bin': pct.values,
        },
    )
    return out.sort_values('percentage_of_bin', ascending=False).reset_index(drop=True)
