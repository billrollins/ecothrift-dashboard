"""Thrift+ receipt block (10-12 policy) on the ESC/POS, plain-text and PNG renderers.

Run from printserver/: ``python -m unittest test_receipt_thrift_plus``.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from services import receipt_printer as rp

FIXTURES = Path(__file__).resolve().parent / "fixtures"

# V2: words a receipt never prints (the legal "not a warranty" lines are not on receipts). "Rewards" as a name is
# retired (V8), but B12's "Thrift+ rewards" (lower case) is the legal disclosure every member receipt carries.
BANNED = re.compile(r"InstantBucks|\bcover\b|Return \$|store credit|warranty|\bearn|(?-i:Rewards)", re.IGNORECASE)
# Owner 2026-10-14: there is no Thrift+ card. The Thrift+ block never says "card" (payment card rows may).
CARD = re.compile(r"\bcards?\b", re.IGNORECASE)
B12 = "ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value. Terms: ecothrift.us/terms"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def _escpos_text(data: dict) -> str:
    raw = rp.format_receipt(data).replace(rp.INIT, b"")
    raw = re.sub(rb"\x1b[!aEdM-][\x00-\xff]", b"", raw)
    raw = re.sub(rb"\x1d[BV][\x00-\xff]", b"", raw)
    return raw.decode("cp437")


def _both(data: dict) -> list[str]:
    return [rp.format_receipt_text(data), _escpos_text(data)]


class MemberReceiptTests(unittest.TestCase):
    def setUp(self):
        self.data = _fixture("receipt_thriftplus_member")

    def test_member_block_prints_the_10_12_lines(self):
        for text in _both(self.data):
            self.assertIn("THRIFT+ MEMBER Pat\n", text)
            self.assertIn("ThriftBucks collected 20.00, use by Nov 19", text)
            self.assertRegex(text, r"Thrift\+ credit used +\$40\.00")
            self.assertIn("Your ThriftBucks 20.00, use by Nov 19", text)
            self.assertRegex(text, r"Thrift\+ credit +\$0\.00")
            self.assertIn("80% back as", text)

    def test_every_member_receipt_carries_the_b12_line_word_for_word(self):
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_training"):
            for text in _both(_fixture(name)):
                flat = " ".join(ln.strip() for ln in text.splitlines())
                self.assertIn(B12, flat)
        self.assertEqual(rp.THRIFT_PLUS_TERMS_LINE, B12)
        lines = rp._wrap_chars(B12)
        self.assertTrue(all(len(ln) <= rp.W for ln in lines))
        self.assertTrue(any(ln.startswith("30 days") for ln in lines))  # "30 days" never splits on the tape

    def test_no_card_and_no_last_4_in_the_thrift_plus_block(self):
        """Owner 2026-10-14: no Thrift+ card. The first name, or nothing; a card_last4 sent by mistake is ignored."""
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_training", "receipt_thriftplus_guest"):
            data = _fixture(name)
            data["thrift_plus"] = {**data["thrift_plus"], "card_last4": "4821"}
            rows = " ".join(label for label, _amount, _bold in rp._thrift_plus_rows(data))
            self.assertIsNone(CARD.search(rows), rows)
            self.assertNotIn("4821", rows)
        paid_by_card = {**self.data, "payment_method": "card", "card_type": "debit", "card_amount": 8.15}
        self.assertIn("Card (", rp.format_receipt_text(paid_by_card))  # payment card rows are unchanged

    def test_a_member_receipt_with_no_name_prints_the_words_alone(self):
        data = {**self.data, "thrift_plus": {**self.data["thrift_plus"], "member": ""}}
        for text in _both(data):
            self.assertIn("THRIFT+ MEMBER\n", text)
            self.assertIn("3-day return", text)  # still a member receipt: its marks and its policy line
            self.assertNotIn("No refunds", text)

    def test_thriftbucks_used_sits_above_subtotal_with_no_dollar_sign(self):
        for text in _both(self.data):
            lines = text.splitlines()
            used = next(i for i, ln in enumerate(lines) if ln.startswith("ThriftBucks used"))
            self.assertTrue(lines[used + 1].startswith("Subtotal"))
            self.assertRegex(lines[used], r"ThriftBucks used +35\.00$")
            self.assertNotIn("$", lines[used])

    def test_each_member_line_carries_its_mark(self):
        for text in _both(self.data):
            lines = text.splitlines()
            lamp = next(i for i, ln in enumerate(lines) if ln.startswith("Floor lamp"))
            fan = next(i for i, ln in enumerate(lines) if ln.startswith("Box fan"))
            self.assertEqual(lines[lamp + 1].strip(), "3-day return")
            self.assertEqual(lines[fan + 1].strip(), "AS IS")

    def test_member_policy_never_says_no_refunds_alone(self):
        for text in _both(self.data):
            self.assertNotIn("No refunds", text)
            self.assertIn("All sales final except Thrift+ 3-day returns on", text)
            self.assertIn("lines marked 3-day return. Sold AS IS.", text)

    def test_no_banned_words(self):
        for text in _both(self.data):
            self.assertIsNone(BANNED.search(text), BANNED.search(text))

    def test_instant_redemption_prints_bucks_and_dollars(self):
        data = _fixture("receipt_thriftplus_training")
        for text in _both(data):
            flat = " ".join(ln.strip() for ln in text.splitlines())
            self.assertIn("Redeemed instantly: 35.00 ThriftBucks, $17.50 off", flat)
            self.assertNotIn("ThriftBucks collected", text)

    def test_png_renders(self):
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_training"):
            image = rp.render_receipt_to_image(_fixture(name))
            self.assertGreater(image.height, 1000)


class GuestReceiptTests(unittest.TestCase):
    def test_guest_gets_one_as_is_line_and_the_old_policy(self):
        data = _fixture("receipt_thriftplus_guest")
        for text in _both(data):
            self.assertIn("All items sold AS IS.", text)
            self.assertNotIn("3-day return", text)
            self.assertNotIn("    AS IS", text)  # no per-line marks for guests
            self.assertIn("All sales are final. No refunds or exchanges.", text)
            self.assertNotIn("ThriftBucks used", text)


class TrainingTests(unittest.TestCase):
    def test_training_banner_at_top_and_bottom(self):
        data = _fixture("receipt_thriftplus_training")
        for text in _both(data):
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            self.assertIn("TRAINING - NOT A SALE", lines[:2])
            self.assertIn("TRAINING - NOT A SALE", lines[-2:])

    def test_no_banner_without_the_flag(self):
        for text in _both(_fixture("receipt_thriftplus_member")):
            self.assertNotIn("TRAINING", text)


class ToleranceTests(unittest.TestCase):
    BASE = {
        "items": [{"name": "Lamp", "quantity": 1, "unit_price": 5.0, "line_total": 5.0, "mark": "3-day return"}],
        "subtotal": 5.0,
        "tax": 0.35,
        "total": 5.35,
    }

    def _render_all(self, data: dict) -> str:
        rp.render_receipt_to_image(data)
        rp.format_receipt(data)
        return rp.format_receipt_text(data)

    def test_old_shape_prints_only_what_still_holds(self):
        old = {**self.BASE, "thrift_plus": {
            "member": "Pat", "card_last4": "4821", "reward_total": "7.50", "to_cover": "2.00",
            "savings": "0.00", "to_bank": "5.78", "credit_used": "0.00", "bank_used": "1.00",
            "cover_month": "Sep", "cover_covered": "2.00", "cover_amount": "5.00",
            "banked": "12.40", "credit": "3.25", "rering": True,
            "lines": [{"name": "Skillet", "tag_price": "24.00", "member_price": "19.20"}],
        }}
        text = self._render_all(old)
        self.assertIn("Your ThriftBucks 12.40", text)
        self.assertRegex(text, r"Thrift\+ credit +\$3\.25")
        self.assertIsNone(BANNED.search(text))

    def test_missing_and_bad_keys_do_not_crash(self):
        payloads = [
            {**self.BASE, "thrift_plus": {}},
            {**self.BASE, "thrift_plus": None},
            {**self.BASE, "thrift_plus": "x"},
            {**self.BASE, "thrift_plus": {"member": "A."}},
            {**self.BASE, "thrift_plus": {"member": "A.", "balances": None, "collected": "abc", "use_by": "2026-13-45"}},
            {**self.BASE, "thrift_plus": {"member": "A.", "balances": {"bucks": None, "credit": ""}}},
            {**self.BASE, "training": "false"},
            {},
        ]
        for data in payloads:
            self._render_all(data)

    def test_marks_print_only_on_member_receipts(self):
        self.assertNotIn("3-day return", rp.format_receipt_text(self.BASE))
        member = {**self.BASE, "thrift_plus": {"member": "A."}}
        self.assertIn("    3-day return", rp.format_receipt_text(member))
        unknown = {**member, "items": [{**self.BASE["items"][0], "mark": "warranty"}]}
        self.assertNotIn("warranty", rp.format_receipt_text(unknown))

    def test_use_by_dates(self):
        self.assertEqual(rp._use_by("2026-11-19"), "Nov 19")
        self.assertEqual(rp._use_by("2026-11-02T00:00:00"), "Nov 2")
        self.assertEqual(rp._use_by("Nov 19"), "Nov 19")
        self.assertEqual(rp._use_by(None), "")

    def test_thriftbucks_savings_row_has_no_dollar_sign(self):
        data = {**self.BASE, "savings": {"total": 3.0, "lines": [
            {"label": "ThriftBucks used", "amount": 1.0}, {"label": "Redeemed instantly", "amount": 2.0},
        ]}}
        text = rp.format_receipt_text(data)
        self.assertRegex(text, r"ThriftBucks used +1\.00\n")
        self.assertRegex(text, r"Redeemed instantly +\$2\.00")


if __name__ == "__main__":
    unittest.main()
