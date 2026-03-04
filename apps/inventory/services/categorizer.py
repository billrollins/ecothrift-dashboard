"""
Category classifier for inventory items.

Given a title, brand, and model string, returns the best matching
inventory.Category record and a confidence score.

THREE-TIER APPROACH (in order of preference):
  1. Rule-based keyword matching — instant, no dependencies, explainable
  2. ML classifier (TF-IDF + Logistic Regression) — trained on historical data
     when enough labeled items exist. Requires scikit-learn (requirements-ml.txt).
  3. LLM fallback (Claude) — for ambiguous items when ML confidence is low.
     Uses the existing ANTHROPIC_API_KEY from settings.

Usage:
    from apps.inventory.services.categorizer import classify_item

    result = classify_item(title="Keurig K-Elite Coffee Maker", brand="Keurig", model="K-Elite")
    # => CategoryResult(category_id=12, category_name="Small Kitchen Appliances",
    #                   parent_name="Appliances", confidence=0.95, method="rules")
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CategoryResult:
    category_id: Optional[int]
    category_name: str
    parent_name: Optional[str]
    confidence: float
    method: str  # 'rules' | 'ml' | 'llm' | 'default'


# ── Rule-based keyword map ─────────────────────────────────────────────────────
# Each entry: (pattern_list, category_name, parent_name)
# Patterns are matched against the normalized combined text: "{title} {brand} {model}".
# Order matters — first match wins, so put more specific rules first.

KEYWORD_RULES: list[tuple[list[str], str, str]] = [
    # Electronics > Laptops & Computers
    (['laptop', 'notebook', 'chromebook', 'macbook', 'thinkpad', 'ideapad',
      'inspiron', 'pavilion', r'\bpc\b', 'desktop computer', 'all-in-one computer'],
     'Laptops & Computers', 'Electronics'),

    # Electronics > Tablets
    (['ipad', r'\btablet\b', 'kindle fire', 'galaxy tab', 'surface pro', 'surface go'],
     'Tablets', 'Electronics'),

    # Electronics > Smartphones
    (['iphone', 'galaxy s', 'galaxy a', 'pixel phone', r'\bsmartphone\b',
      'android phone', 'cell phone', 'mobile phone'],
     'Smartphones', 'Electronics'),

    # Electronics > TVs & Monitors
    (["smart tv", "qled", "oled tv", r'\btv\b', 'television', 'monitor',
      'flat screen', '4k tv', 'roku tv', 'fire tv'],
     'TVs & Monitors', 'Electronics'),

    # Electronics > Audio & Headphones
    (['headphone', 'earphone', 'earbud', 'airpod', 'soundbar', 'bluetooth speaker',
      'speaker system', 'subwoofer', 'amplifier', 'receiver', 'turntable'],
     'Audio & Headphones', 'Electronics'),

    # Electronics > Gaming & Consoles
    (['playstation', 'xbox', 'nintendo', r'\bwii\b', 'ps4', 'ps5', 'switch',
      'gaming console', 'game controller', 'video game'],
     'Gaming & Consoles', 'Electronics'),

    # Electronics > Smart Home & Networking
    (['echo dot', 'alexa', 'google nest', 'smart plug', 'smart bulb', 'ring doorbell',
      r'\brouter\b', 'wifi extender', 'smart thermostat', 'security camera'],
     'Smart Home & Networking', 'Electronics'),

    # Electronics > Cameras
    (['camera', 'dslr', 'mirrorless', 'camcorder', 'gopro', 'drone', 'lens'],
     'Cameras & Photography', 'Electronics'),

    # Appliances > Small Kitchen
    (['coffee maker', 'keurig', 'nespresso', 'air fryer', 'instant pot',
      'ninja', 'blender', 'toaster', 'microwave', 'rice cooker', 'waffle maker',
      'electric kettle', 'juicer', 'food processor', 'stand mixer', 'hand mixer',
      'panini press', 'sandwich maker'],
     'Small Kitchen Appliances', 'Appliances'),

    # Appliances > Large Kitchen
    (['refrigerator', r'\bfridge\b', 'dishwasher', 'oven', 'range', 'stove',
      'freezer', 'washing machine', 'dryer', 'washer'],
     'Large Kitchen Appliances', 'Appliances'),

    # Appliances > Personal Care
    (['hair dryer', 'curling iron', 'flat iron', 'electric shaver', 'electric razor',
      'beard trimmer', 'epilator', 'electric toothbrush', 'waterpik'],
     'Personal Care Appliances', 'Appliances'),

    # Tools > Power Tools
    (['drill', 'circular saw', r'\bsaw\b', 'jigsaw', 'sander', 'grinder',
      'impact driver', 'nail gun', 'air compressor', 'power tool', 'dewalt',
      'milwaukee tool', r'\bmakita\b', r'\bbosch\b tool'],
     'Power Tools', 'Tools & Hardware'),

    # Tools > Hand Tools
    (['wrench', 'screwdriver', 'hammer', 'plier', 'socket set', 'hex key',
      'tape measure', 'level', 'hand tool'],
     'Hand Tools', 'Tools & Hardware'),

    # Tools > Outdoor & Garden
    (['lawn mower', 'leaf blower', 'hedge trimmer', 'weed eater', 'chainsaw',
      'pressure washer', 'garden tool', 'sprinkler'],
     'Outdoor & Garden Tools', 'Tools & Hardware'),

    # Home > Cookware
    (['cookware', 'skillet', 'frying pan', r'\bpot\b', 'saucepan', 'dutch oven',
      'bakeware', 'baking sheet', 'cast iron', 'teflon', 'nonstick pan'],
     'Cookware & Bakeware', 'Home & Kitchen'),

    # Home > Bedding & Bath
    (['comforter', 'duvet', 'bedsheet', 'pillow', 'mattress', 'towel', 'bath mat'],
     'Bedding & Bath', 'Home & Kitchen'),

    # Home > Furniture
    ([r'\bchair\b', r'\bdesk\b', r'\bsofa\b', r'\bcouch\b', r'\bdresser\b',
      r'\bbookcase\b', r'\bshelf\b', 'office chair', 'standing desk'],
     'Furniture', 'Home & Kitchen'),

    # Sports > Exercise
    (['treadmill', 'exercise bike', 'elliptical', 'dumbbell', 'barbell',
      'weight bench', 'yoga mat', 'resistance band', 'kettlebell'],
     'Exercise & Fitness Equipment', 'Sports & Outdoors'),

    # Sports > Cycling
    ([r'\bbike\b', r'\bbicycle\b', 'cycling', 'mountain bike', 'road bike',
      'bike helmet', 'bike lock'],
     'Cycling', 'Sports & Outdoors'),

    # Sports > Camping
    (['tent', 'sleeping bag', 'camping', 'backpack', 'hiking', 'lantern',
      'cooler', 'canteen'],
     'Camping & Hiking', 'Sports & Outdoors'),

    # Toys > Board Games
    (['board game', 'card game', r'\bpuzzle\b', 'chess', 'monopoly', 'scrabble'],
     'Board Games & Puzzles', 'Toys & Games'),

    # Toys > Building & STEM
    (['lego', 'duplo', 'lincoln logs', 'k\'nex', r'\bstem\b kit',
      'building blocks', 'erector set'],
     'Building & STEM Toys', 'Toys & Games'),

    # Health & Beauty
    (['supplement', 'vitamin', 'protein powder', 'blood pressure monitor',
      'thermometer', 'first aid', 'cpap', 'tens unit'],
     'Health & Beauty', 'Health & Beauty'),

    # Automotive
    (['car charger', 'dash cam', 'jump starter', 'tire inflator',
      'car vacuum', 'seat cover', 'floor mat car'],
     'Car Electronics & Accessories', 'Automotive'),

    # Office
    (['printer', 'scanner', 'shredder', 'laminator', 'label maker',
      'office chair', 'desk organizer'],
     'Office & School', 'Office & School'),

    # Pet
    (['dog bed', 'dog crate', 'cat tree', 'pet carrier', 'pet feeder',
      'fish tank', 'aquarium', 'bird cage'],
     'Pet Supplies', 'Pet Supplies'),
]


def _normalize_text(*parts: Optional[str]) -> str:
    """Combine and lowercase text parts for matching."""
    combined = ' '.join(p for p in parts if p)
    return combined.lower().strip()


def _rule_match(text: str) -> Optional[tuple[str, str]]:
    """Return (category_name, parent_name) for the first matching rule, or None."""
    for patterns, category, parent in KEYWORD_RULES:
        for pattern in patterns:
            if re.search(pattern, text):
                return category, parent
    return None


def _ml_classify(text: str) -> Optional[tuple[str, str, float]]:
    """
    Classify using a trained TF-IDF + Logistic Regression model.
    Returns (category_name, parent_name, confidence) or None if model unavailable.
    """
    try:
        import joblib
        from pathlib import Path
        model_path = Path(__file__).parent.parent.parent.parent / 'workspace' / 'models' / 'category_model.joblib'
        if not model_path.exists():
            return None
        clf, label_encoder = joblib.load(model_path)
        proba = clf.predict_proba([text])[0]
        best_idx = proba.argmax()
        confidence = float(proba[best_idx])
        label = label_encoder.inverse_transform([best_idx])[0]
        # label is "Parent > Subcategory" format
        if ' > ' in label:
            parent, category = label.split(' > ', 1)
        else:
            parent, category = None, label
        return category, parent, confidence
    except ImportError:
        logger.debug('scikit-learn / joblib not installed; ML classifier unavailable.')
        return None
    except Exception as exc:
        logger.warning('ML classifier error: %s', exc)
        return None


def _llm_classify(title: str, brand: Optional[str], model: Optional[str]) -> Optional[tuple[str, str]]:
    """
    Use Claude to classify ambiguous items.
    Only called when both rule-based and ML methods fail or have low confidence.
    """
    try:
        import anthropic
        from django.conf import settings

        api_key = getattr(settings, 'ANTHROPIC_API_KEY', None)
        if not api_key:
            return None

        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            f'You are a thrift store inventory classifier. '
            f'Classify this item into ONE of these categories:\n'
            f'{_get_category_list_text()}\n\n'
            f'Item: {title}'
        )
        if brand:
            prompt += f'\nBrand: {brand}'
        if model:
            prompt += f'\nModel: {model}'
        prompt += (
            '\n\nReply with ONLY the category path in the format: "Parent > Subcategory". '
            'No explanation.'
        )
        message = client.messages.create(
            model='claude-3-haiku-20240307',
            max_tokens=50,
            messages=[{'role': 'user', 'content': prompt}],
        )
        result = message.content[0].text.strip()
        if ' > ' in result:
            parent, category = result.split(' > ', 1)
            return category.strip(), parent.strip()
    except Exception as exc:
        logger.warning('LLM classifier error: %s', exc)
    return None


def _get_category_list_text() -> str:
    lines = []
    for _, category, parent in KEYWORD_RULES:
        lines.append(f'  {parent} > {category}')
    # Deduplicate and sort
    seen = set()
    unique = []
    for line in lines:
        if line not in seen:
            seen.add(line)
            unique.append(line)
    return '\n'.join(unique)


def _get_or_create_db_category(category_name: str, parent_name: Optional[str]):
    """
    Look up the Category model record by name, creating parent and child if needed.
    Returns (Category instance, created).
    """
    from apps.inventory.models import Category

    parent = None
    if parent_name:
        parent, _ = Category.objects.get_or_create(
            name=parent_name,
            defaults={'parent': None},
        )

    category, created = Category.objects.get_or_create(
        name=category_name,
        defaults={'parent': parent},
    )
    if not created and category.parent is None and parent is not None:
        category.parent = parent
        category.save(update_fields=['parent'])

    return category, created


def classify_item(
    title: str,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    use_llm_fallback: bool = True,
    min_ml_confidence: float = 0.6,
) -> CategoryResult:
    """
    Classify an item into a Category.

    Args:
        title:              Item title / description.
        brand:              Brand name.
        model:              Model number or name.
        use_llm_fallback:   Call Claude if rules and ML both fail/low confidence.
        min_ml_confidence:  ML confidence threshold below which LLM fallback triggers.

    Returns:
        CategoryResult with category_id set if the Category exists in the DB,
        or category_id=None if the DB hasn't been seeded yet (safe to call before seeding).
    """
    text = _normalize_text(title, brand, model)

    # Tier 1: Rule-based
    match = _rule_match(text)
    if match:
        category_name, parent_name = match
        try:
            cat, _ = _get_or_create_db_category(category_name, parent_name)
            return CategoryResult(
                category_id=cat.pk,
                category_name=cat.name,
                parent_name=parent_name,
                confidence=1.0,
                method='rules',
            )
        except Exception:
            # DB not yet seeded — return result without ID
            return CategoryResult(
                category_id=None,
                category_name=category_name,
                parent_name=parent_name,
                confidence=1.0,
                method='rules',
            )

    # Tier 2: ML classifier
    ml_result = _ml_classify(text)
    if ml_result:
        category_name, parent_name, confidence = ml_result
        if confidence >= min_ml_confidence:
            try:
                cat, _ = _get_or_create_db_category(category_name, parent_name or 'Miscellaneous')
                return CategoryResult(
                    category_id=cat.pk,
                    category_name=cat.name,
                    parent_name=parent_name,
                    confidence=confidence,
                    method='ml',
                )
            except Exception:
                return CategoryResult(
                    category_id=None,
                    category_name=category_name,
                    parent_name=parent_name,
                    confidence=confidence,
                    method='ml',
                )

    # Tier 3: LLM fallback
    if use_llm_fallback:
        llm_result = _llm_classify(title, brand, model)
        if llm_result:
            category_name, parent_name = llm_result
            try:
                cat, _ = _get_or_create_db_category(category_name, parent_name)
                return CategoryResult(
                    category_id=cat.pk,
                    category_name=cat.name,
                    parent_name=parent_name,
                    confidence=0.7,
                    method='llm',
                )
            except Exception:
                return CategoryResult(
                    category_id=None,
                    category_name=category_name,
                    parent_name=parent_name,
                    confidence=0.7,
                    method='llm',
                )

    # Default: Miscellaneous
    try:
        cat, _ = _get_or_create_db_category('General Merchandise', 'Miscellaneous')
        return CategoryResult(
            category_id=cat.pk,
            category_name='General Merchandise',
            parent_name='Miscellaneous',
            confidence=0.0,
            method='default',
        )
    except Exception:
        return CategoryResult(
            category_id=None,
            category_name='General Merchandise',
            parent_name='Miscellaneous',
            confidence=0.0,
            method='default',
        )
