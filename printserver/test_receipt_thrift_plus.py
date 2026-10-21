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
# "store credit" is banned except in the returns line (owner 2026-10-20, release 4: "80% of value as store credit").
BANNED = re.compile(
    r"InstantBucks|\bcover\b|Return \$|(?<!80% of value as )store credit|warranty|\bearn|(?-i:Rewards)",
    re.IGNORECASE,
)
# Owner 2026-10-14: there is no Thrift+ card. The Thrift+ block never says "card" (payment card rows may).
CARD = re.compile(r"\bcards?\b", re.IGNORECASE)
# B12, owner 2026-10-16: "Use ThriftBucks tomorrow; expire in 30 days" (attorney to confirm the new words).
B12 = ("ThriftBucks are Thrift+ rewards. Use them starting tomorrow; they expire 30 days after you collect them. "
       "No cash value. Terms: ecothrift.us/terms")


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def _escpos_text(data: dict) -> str:
    raw = rp.format_receipt_tape(data).replace(rp.INIT, b"")
    raw = re.sub(rb"\x1b[!aEdM-][\x00-\xff]", b"", raw)
    raw = re.sub(rb"\x1d[BV][\x00-\xff]", b"", raw)
    return raw.decode("cp437")


def _both(data: dict) -> list[str]:
    return [rp.format_receipt_text(data), _escpos_text(data)]


def _lines(text: str) -> list[str]:
    """The tape's lines without the black block's centering pad."""
    return [ln.strip() for ln in text.splitlines()]


class MemberReceiptTests(unittest.TestCase):
    def setUp(self):
        self.data = _fixture("receipt_thriftplus_member")

    def test_member_block_says_this_trip_and_no_balances(self):
        """Owner 2026-10-16: today's ThriftBucks on one line; no use-by date, no balances."""
        head, lines, fine = rp._bottom_block(self.data)
        self.assertEqual(head, "THRIFT+ MEMBER Pat")
        self.assertEqual(lines, [("+20.00 ThriftBucks today · 35.00 used", True)])
        self.assertEqual(fine, [B12])
        for text in _both(self.data):
            self.assertNotIn("balance", text.lower())
            self.assertNotIn("use by", text.lower())
            self.assertNotIn("Your ThriftBucks", text)
            self.assertRegex(text, r"Thrift\+ credit +\$40\.00")  # credit is a payment row

    @staticmethod
    def dot(text: str) -> str:
        """The tape folds "·" for the printer's code page; the text path keeps it."""
        return "·" if "·" in text else next(c for c in ("\u2219", "\u00b7", "*") if c in text)

    def test_every_item_has_a_sub_line_thriftbucks_first(self):
        """Owner 2026-10-16: ThriftBucks first, set apart from the 3-day return / AS IS note."""
        items = self.data["items"]
        self.assertEqual(rp._item_subparts(items[0], self.data), ("+9.60 ThriftBucks", "3-day return"))
        self.assertEqual(rp._item_subparts(items[2], self.data), ("+4.00 ThriftBucks", "AS IS"))
        self.assertEqual(rp._item_subline(items[0], self.data), "+9.60 ThriftBucks | 3-day return")
        self.assertEqual(rp._item_subparts({**items[0], "bucks": None}, self.data), ("", "3-day return"))  # older
        self.assertEqual(rp._return_items(self.data), 2)
        self.assertEqual(rp._return_items({**self.data, "items": [{**items[0], "quantity": 3}]}), 3)

    def test_the_black_block_comes_last_with_the_review_line_right_above(self):
        """Owner 2026-10-16: the black block at the bottom says it all; one small Google review line above it."""
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_guest"):
            for text in _both(_fixture(name)):
                lines = [ln for ln in _lines(text) if ln]
                review = lines.index(rp.RECEIPT_REVIEW_LINE)
                head = next(i for i, ln in enumerate(lines) if ln.startswith(("THRIFT+ MEMBER", "NON-MEMBER")))
                self.assertLessEqual(head - review, 2)  # the PNG/text block edge may sit between them
                self.assertNotIn("GOOGLE REVIEW REWARD", text)
                self.assertNotIn("THANK YOU\n", text)
                self.assertNotIn(rp.REVERSE_ON.decode("latin-1"), text)  # white-on-black lines printed striped
        self.assertLessEqual(len(rp.RECEIPT_REVIEW_LINE), rp.W)

    def test_every_member_receipt_carries_the_b12_line_word_for_word(self):
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_training"):
            for text in _both(_fixture(name)):
                flat = " ".join(ln.strip() for ln in text.splitlines())
                self.assertIn(B12, flat)
        self.assertEqual(rp.THRIFT_PLUS_TERMS_LINE, B12)
        lines = rp._wrap_chars(B12)
        self.assertTrue(all(len(ln) <= rp.W for ln in lines))
        self.assertTrue(any("30 days" in ln for ln in lines))  # "30 days" never splits on the tape

    def test_no_card_and_no_last_4_in_the_thrift_plus_block(self):
        """Owner 2026-10-14: no Thrift+ card. The first name, or nothing; a card_last4 sent by mistake is ignored."""
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_training", "receipt_thriftplus_guest"):
            data = _fixture(name)
            data["thrift_plus"] = {**data["thrift_plus"], "card_last4": "4821"}
            head, block, fine = rp._bottom_block(data)
            rows = " ".join([head, *(text for text, _bold in block), *fine])
            self.assertIsNone(CARD.search(rows), rows)
            self.assertNotIn("4821", rows)
        paid_by_card = {**self.data, "payment_method": "card", "card_type": "debit", "card_amount": 8.15}
        self.assertIn("Card (", rp.format_receipt_text(paid_by_card))  # payment card rows are unchanged

    def test_a_member_receipt_with_no_name_prints_the_words_alone(self):
        data = {**self.data, "thrift_plus": {**self.data["thrift_plus"], "member": ""}}
        for text in _both(data):
            self.assertIn("THRIFT+ MEMBER", _lines(text))
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
            self.assertTrue(lines[lamp + 1].strip().endswith("| 3-day return"), lines[lamp + 1])
            self.assertTrue(lines[fan + 1].strip().endswith("| AS IS"), lines[fan + 1])

    def test_member_policy_never_says_no_refunds_alone(self):
        for text in _both(self.data):
            self.assertNotIn("No refunds", text)

    def test_no_banned_words(self):
        for text in _both(self.data):
            self.assertIsNone(BANNED.search(text), BANNED.search(text))

    def test_instant_redemption_prints_bucks_and_dollars(self):
        data = _fixture("receipt_thriftplus_training")
        _head, lines, _fine = rp._bottom_block(data)
        self.assertEqual(lines, [("-35.00 ThriftBucks instantly: $17.50 off", True)])
        for text in _both(data):
            self.assertNotIn("today", text)

    def test_png_renders(self):
        for name in ("receipt_thriftplus_member", "receipt_thriftplus_training"):
            image = rp.render_receipt_to_image(_fixture(name))
            self.assertGreater(image.height, 1000)


class GuestReceiptTests(unittest.TestCase):
    def test_guest_gets_the_non_member_block(self):
        data = _fixture("receipt_thriftplus_guest")
        head, lines, fine = rp._bottom_block(data)
        self.assertEqual(head, "NON-MEMBER")
        self.assertEqual(lines, [("You missed out on:", False), ("12.60 ThriftBucks and 3-day returns", True),
                                 ("Join free: ecothrift.us/join", False), ("All sales final · Sold AS IS", True)])
        self.assertEqual(fine, [])
        for text in _both(data):
            lines_ = _lines(text)
            # Owner 2026-10-15: "Non-member" replaces "guest" wherever a customer reads.
            self.assertIn("NON-MEMBER", lines_)
            self.assertNotIn("guest", text.lower())
            self.assertNotIn("ThriftBucks used", text)
            self.assertNotIn("THRIFT+ MEMBER", text)

    def test_a_non_member_sub_line_says_what_joining_would_give(self):
        data = _fixture("receipt_thriftplus_guest")
        lamp, mugs = data["items"][0], data["items"][1]
        self.assertEqual(rp._item_subparts(lamp, data), ("Join for +9.60 ThriftBucks", "3-day return"))
        self.assertEqual(rp._item_subparts(mugs, data), ("Join for +2.40 ThriftBucks", ""))
        self.assertEqual(rp._item_subparts({**mugs, "bucks": 0}, data), ("", ""))
        self.assertEqual(rp._item_subparts({**lamp, "bucks": 0}, data), ("Join for:", "3-day return"))
        self.assertEqual(rp._item_subparts({"name": "x", "mark": "AS IS"}, data), ("", ""))  # an older dashboard
        self.assertEqual(rp._return_items(data), 1)
        self.assertIsNone(rp._return_items({**data, "items": [{"name": "x", "mark": "AS IS"}]}))

    def test_nothing_missed_prints_no_missed_line(self):
        data = _fixture("receipt_thriftplus_guest")
        data["thrift_plus"]["guest_line"] = "This trip would have collected 0.00 ThriftBucks."
        data["items"] = [{**it, "join_mark": "AS IS"} for it in data["items"]]
        for text in _both(data):
            self.assertNotIn("missed", text)
            self.assertIn("NON-MEMBER", _lines(text))

    def test_a_receipt_without_thrift_plus_keeps_no_refunds(self):
        data = {k: v for k, v in _fixture("receipt_thriftplus_guest").items() if k != "thrift_plus"}
        for text in _both(data):
            self.assertIn("NO REFUNDS", _lines(text))
            self.assertIn("All sales are final. No refunds or exchanges.", " ".join(_lines(text)))
            self.assertNotIn("NON-MEMBER", text)


    def test_the_picture_groups_items_and_names_the_column(self):
        """Owner 2026-10-16: a member's 3-DAY RETURN and SOLD AS IS groups, each with its column headers; a
        non-member's one ALL SALES FINAL group with an IF MEMBER column. Checked on the drawn receipt's height:
        a member receipt with both groups is taller than the same items in one group."""
        from services import receipt_raster as rr

        member = _fixture("receipt_thriftplus_member")
        one_group = {**member, "items": [{**it, "mark": "AS IS"} for it in member["items"]]}
        self.assertGreater(rr.render_thermal_receipt(member).height, rr.render_thermal_receipt(one_group).height)
        self.assertEqual(rr._when({"date": "2026-10-20", "time": "2:14 PM"}), "Oct 20, 2:14 PM")
        self.assertEqual(rr._payment_line(member), "Thrift+ credit $40.00 · Cash $20.00 · Change $3.29")
        card = {**member, "payment_method": "card", "card_type": "debit", "card_amount": 16.71}
        self.assertNotIn("Card", rr._payment_line(card))  # a card sale keeps its own rows

    def test_a_member_receipt_has_no_non_member_line(self):
        for text in _both(_fixture("receipt_thriftplus_member")):
            self.assertNotIn("Non-member", text)


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
            self.assertNotIn("COPY", text)

    def test_a_reprint_says_copy_at_top_and_bottom(self):
        data = {**_fixture("receipt_thriftplus_member"), "copy": True}
        for text in _both(data):
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            self.assertIn("COPY - NOT THE ORIGINAL", lines[:2])
            self.assertIn("COPY - NOT THE ORIGINAL", lines[-2:])


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
        self.assertIn("THRIFT+ MEMBER Pat", text)
        self.assertNotIn("12.40", text)  # no balances (owner 2026-10-16)
        self.assertNotIn("4821", text)
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


class ReturnsLineTests(unittest.TestCase):
    """1.9.7 (owner 2026-10-20): under a member's 3-DAY RETURN heading, "Returns through Fri Oct 23 · 80% of value as
    store credit"; the date is the payload's ``returns_until``, else the sale date + 3."""

    LINE = "Returns through Fri Oct 23 · 80% of value as store credit"

    def setUp(self):
        self.data = _fixture("receipt_thriftplus_member")  # sale date 2026-10-20, no returns_until (older Dash)

    def test_the_date_is_sent_or_the_sale_date_plus_three(self):
        self.assertEqual(rp._returns_line(self.data), self.LINE)  # computed
        sent = {**self.data, "returns_until": "2026-10-27"}  # closed days pushed it out: the server's date wins
        self.assertEqual(rp._returns_line(sent), "Returns through Tue Oct 27 · 80% of value as store credit")
        self.assertEqual(rp._returns_line({**self.data, "returns_until": "2026-10-27T00:00:00"}),
                         "Returns through Tue Oct 27 · 80% of value as store credit")
        self.assertEqual(rp._returns_line({**self.data, "returns_until": "junk"}), self.LINE)  # bad: compute
        self.assertEqual(rp._returns_line({**self.data, "date": "2026-12-30"}),
                         "Returns through Sat Jan 2 · 80% of value as store credit")  # across the year
        nodate = {k: v for k, v in self.data.items() if k != "date"}
        self.assertEqual(rp._returns_line(nodate), "Returns within 3 days · 80% of value as store credit")

    def test_only_a_member_with_return_lines_gets_it(self):
        guest = _fixture("receipt_thriftplus_guest")
        self.assertEqual(rp._returns_line(guest), "")
        as_is = {**self.data, "items": [{**it, "mark": "AS IS"} for it in self.data["items"]]}
        self.assertEqual(rp._returns_line(as_is), "")
        self.assertEqual(rp._returns_line({k: v for k, v in self.data.items() if k != "thrift_plus"}), "")
        for text in _both(guest) + _both(as_is):
            self.assertNotIn("80% of value", text)

    def test_the_text_receipts_print_it_under_the_items(self):
        for text in _both(self.data):
            lines = _lines(text)
            sold = next(i for i, ln in enumerate(lines) if ln.startswith("Box fan"))
            head = next(i for i, ln in enumerate(lines) if ln.startswith("Returns through"))
            self.assertGreater(head, sold)
            self.assertEqual(lines[head], "Returns through Fri Oct 23")
            self.assertEqual(lines[head + 1], "80% of value as store credit")
            self.assertEqual(sum(1 for ln in lines if "80% of value" in ln), 1)

    def test_the_picture_draws_the_line_in_one_or_two_lines(self):
        from unittest import mock

        from services import receipt_raster as rr

        with mock.patch.object(rp, "_returns_parts", return_value=None):
            without = rr.render_thermal_receipt(self.data)
        with_line = rr.render_thermal_receipt(self.data)
        self.assertEqual(with_line.width, 576)
        self.assertGreaterEqual(with_line.height - without.height, 20)  # a line of type, at least
        self.assertLessEqual(with_line.height - without.height, 70)  # never more than two lines and their gaps
        # the line sits under the 3-DAY RETURN heading: the pictures match down to the heading's frame
        top = without.crop((0, 0, 576, 600)).convert("L")
        same = with_line.crop((0, 0, 576, 600)).convert("L")
        first_diff = next((y for y in range(600) if top.crop((0, y, 576, y + 1)).tobytes()
                           != same.crop((0, y, 576, y + 1)).tobytes()), None)
        self.assertIsNotNone(first_diff)
        self.assertGreater(first_diff, 250)  # below the logo, the store lines and the meta line

    def test_the_as_is_box_says_nothing_comes_back(self):
        from unittest import mock

        from services import receipt_raster as rr

        with mock.patch.object(rp, "AS_IS_NO_RETURNS_LINE", ""):
            plain = rr.render_thermal_receipt(self.data)
        said = rr.render_thermal_receipt(self.data)
        self.assertEqual(rp.AS_IS_NO_RETURNS_LINE, "Items below are final sale and can't be returned.")
        self.assertGreaterEqual(said.height - plain.height, 20)  # the line sits inside the SOLD AS IS frame

    def test_odd_dates_still_draw(self):
        from services import receipt_raster as rr

        for day in ("2026-10-20", "2026-12-28", "2026-05-12", "2026-09-16"):  # wide weekday and month names
            img = rr.render_thermal_receipt({**self.data, "date": day})
            self.assertEqual(img.width, 576)


class PictureTests(unittest.TestCase):
    """1.9.2 (owner 2026-10-16): the receipt prints as one picture (a solid black block, the logo on top)."""

    def test_the_print_job_is_a_picture_at_the_printer_width(self):
        from services import receipt_raster as rr

        for name in ("receipt_thriftplus_member", "receipt_thriftplus_guest", "receipt_thriftplus_training"):
            data = _fixture(name)
            image = rr.render_thermal_receipt(data)
            self.assertEqual(image.width, 576)
            self.assertEqual(image.mode, "1")
            self.assertGreater(image.height, 900)
            job = rp.format_receipt(data)
            self.assertTrue(job.startswith(rp.INIT + rp.LEFT + b"\x1dv0\x00" + bytes([72, 0])))
            self.assertTrue(job.endswith(rp.FEED_LINES(4) + rp.PARTIAL_CUT))
            bands = (image.height + rr.BAND_ROWS - 1) // rr.BAND_ROWS
            self.assertEqual(job.count(b"\x1dv0\x00"), bands)

    def test_a_reprint_is_taller_by_its_copy_bands(self):
        """A reprint (copy: true, 2026-10-21) draws a COPY band at the top and the bottom of the picture."""
        from services import receipt_raster as rr

        data = _fixture("receipt_thriftplus_member")
        plain = rr.render_thermal_receipt(data)
        copy = rr.render_thermal_receipt({**data, "copy": True})
        self.assertGreater(copy.height, plain.height + 80)
        self.assertEqual(rp._banners({**data, "copy": True}), [rp.COPY_BANNER])
        self.assertEqual(rp._banners({**data, "copy": True, "training": True}), [rp.TRAINING_BANNER, rp.COPY_BANNER])
        self.assertEqual(rp._banners(data), [])

    def test_the_text_tape_prints_if_the_picture_fails(self):
        from unittest import mock

        data = _fixture("receipt_thriftplus_member")
        with mock.patch("services.receipt_raster.render_thermal_receipt", side_effect=RuntimeError("no fonts")):
            job = rp.format_receipt(data)
        self.assertEqual(job, rp.format_receipt_tape(data))

    def test_odd_payloads_still_draw(self):
        from services import receipt_raster as rr

        for data in ({}, {"items": [None, {"name": "x"}]}, {"thrift_plus": {"member": "A."}, "training": True},
                     rp.sample_receipt_dict()):
            self.assertEqual(rr.render_thermal_receipt(data).width, 576)


if __name__ == "__main__":
    unittest.main()
