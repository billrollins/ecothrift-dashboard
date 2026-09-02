"""What a section check counts, and which of it is anyone's fault.

The split is the whole design. An auditor walking someone else's aisle sees
two very different things: work the owner should have done, and churn the
owner could not have prevented. Scoring the second would punish whoever was
given the busiest corner of the store, so only the first group reaches the
grade.

Every label is phrased as work the auditor *did*, not an opinion they formed.
"Items I had to face or stand up" is a number you can be held to; "facing is
poor" is an argument.
"""
from __future__ import annotations

# Scored. Only exists if the owner has not walked the section.
GRADED = [
    ('facing_blocking', 'Items blocking or hiding what is behind them'),
    ('facing_upright', 'Items I had to face or stand up'),
    ('facing_grouped', 'Items I had to group back with their like items'),
    ('tag_facing', 'Tags I had to turn to the front'),
    ('reshelf', 'Items I moved back to their own section'),
    ('reprep', 'Items I had to re-prep: cords, empty boxes, opened packaging'),
    ('security', 'High-theft items loose on the floor'),
    ('hangers', 'Empty hangers I pulled'),
]

# Recorded and reported, never scored. Churn and product condition.
RECORDED = [
    ('clean', 'Spots I had to clean: dust, trash on the floor or shelf'),
    ('reprice', 'Items needing a price look: not selling, wrong tag, missing tag'),
    ('tars', 'Items damaged or missing parts'),
]

# Conditions rather than counts. Safety caps the section score.
FLAGS = [
    ('safety', 'Safety issue'),
    ('overstocked', 'Section full or overstocked'),
    ('low_stock', 'Section low or empty'),
]

GRADED_KEYS = [key for key, _ in GRADED]
RECORDED_KEYS = [key for key, _ in RECORDED]
FLAG_KEYS = [key for key, _ in FLAGS]
SAFETY_FLAG = 'safety'
# A section with a safety problem cannot pass, however tidy the rest of it is.
SAFETY_CAP = 50.0


def taxonomy() -> dict:
    """The shape the phone renders and the Grades view labels rows with."""
    return {
        'graded': [{'key': key, 'label': label} for key, label in GRADED],
        'recorded': [{'key': key, 'label': label} for key, label in RECORDED],
        'flags': [{'key': key, 'label': label} for key, label in FLAGS],
        'safety_flag': SAFETY_FLAG,
    }


def label_for(key: str) -> str:
    for group in (GRADED, RECORDED, FLAGS):
        for candidate, label in group:
            if candidate == key:
                return label
    return key


def clean_counts(raw) -> dict[str, int]:
    """Only known categories, only non-negative whole numbers."""
    out: dict[str, int] = {}
    if not isinstance(raw, dict):
        return out
    for key in GRADED_KEYS + RECORDED_KEYS:
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
