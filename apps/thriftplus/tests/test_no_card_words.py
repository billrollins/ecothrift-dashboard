"""Owner 2026-10-14: "there is no mention of CARD anywhere." There is no Thrift+ membership card: a member shows the
member QR in the Thrift+ app or gives their phone number. No Thrift+ register, receipt, email or server message says
"card". Internal names stay (the ``Card`` model, ``card_code``, error codes like ``CARD_UNKNOWN``), and payment-card
words (the POS Card tender, CardX) are allowed."""
from __future__ import annotations

import ast
import re
from pathlib import Path

from django.test import SimpleTestCase

ROOT = Path(__file__).resolve().parents[3]
CARD = re.compile(r'\bcards?\b', re.IGNORECASE)
PAYMENT = re.compile(r'cash or card|CardX|card surcharge|card type|credit card|debit card', re.IGNORECASE)

# Whole files: everything they say goes to the register, a receipt, an email or the member.
FILES = [
    'apps/thriftplus/services/register.py',
    'apps/thriftplus/services/returns.py',
    'apps/thriftplus/services/members.py',
    'apps/thriftplus/services/emails.py',
    'apps/thriftplus/services/scanner.py',
    'apps/thriftplus/services/overview.py',
    'apps/thriftplus/services/trip.py',
    'apps/thriftplus/services/ledger.py',
]
# In views.py, the register's and returns' answers (Dash's card batches are the Dash agent's, 2026-10-14).
VIEW_CLASSES = ('RegisterViewSet', 'ReturnsViewSet', 'AccountViewSet', 'PersonViewSet')


def _docstrings(tree: ast.AST) -> set[int]:
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                out.add(id(first.value))
    return out


def _words(tree: ast.AST, docs: set[int]) -> list[tuple[int, str]]:
    """Strings people read: literals with a space in them (not keys like 'card'), docstrings left out. An f-string is
    read whole, its values as {}."""
    out, parts = [], set()
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):
            text = ''.join(v.value if isinstance(v, ast.Constant) else '{}' for v in node.values)
            parts.update(id(v) for v in node.values)
            out.append((node.lineno, text))
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docs | parts:
            out.append((node.lineno, node.value))
    return [(line, text) for line, text in out if ' ' in text.strip()]


def card_hits(text: str, *, classes: tuple[str, ...] | None = None, name: str = '') -> list[str]:
    tree = ast.parse(text)
    docs = _docstrings(tree)
    roots = [tree] if classes is None else [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name in classes]
    hits = []
    for root in roots:
        for line, value in _words(root, docs):
            if CARD.search(PAYMENT.sub('', value)):
                hits.append(f'{name}:{line}: {value[:90]}')
    return hits


class NoCardWordsTests(SimpleTestCase):
    def test_thrift_plus_server_messages_never_say_card(self):
        hits = []
        for rel in FILES:
            hits += card_hits((ROOT / rel).read_text(encoding='utf-8'), name=rel)
        views = (ROOT / 'apps/thriftplus/views.py').read_text(encoding='utf-8')
        hits += card_hits(views, classes=VIEW_CLASSES, name='views.py')
        self.assertEqual(hits, [])

    def test_the_register_errors_say_membership_member_and_phone(self):
        text = (ROOT / 'apps/thriftplus/services/register.py').read_text(encoding='utf-8')
        self.assertIn('This membership is not active.', text)
        self.assertIn('This is a practice member. Use the training register.', text)
        self.assertIn("Scan the member's QR or find them by phone first.", text)

    def test_the_check_catches_a_card_and_lets_payment_cards_and_names_through(self):
        sample = (
            "def f():\n"
            "    '''A docstring about the card model.'''\n"
            "    a = 'This card is not active.'\n"
            "    b = 'Take it by cash or card.'\n"
            "    c = select_related('card')\n"
            "    d = 'CARD_UNKNOWN'\n"
            "    e = f'Card {x} is dead.'\n"
        )
        hits = card_hits(sample, name='x')
        self.assertEqual(len(hits), 2, hits)
        self.assertIn('This card is not active.', hits[0] + hits[1])
