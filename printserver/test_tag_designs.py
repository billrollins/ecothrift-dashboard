"""1.9.12 (owner 2026-10-29): the Classic and Thrift+ Perks price tags are drawn by the print server, never sent as a
picture from Dash. Every design renders at the common label sizes with nothing clipped.

Run from printserver/: ``python -m pytest -p no:django -o addopts="" test_tag_designs.py``.
"""
from __future__ import annotations

import asyncio
import importlib.util
import unittest
from unittest import mock

from services import tag_designs as td

SIZES = [(1.5, 1.0), (2.0, 1.0), (2.25, 1.25), (3.0, 2.0)]
DATA = {
    "text": "$24.99",
    "qr_data": "ITM0226342",
    "product_title": "KitchenAid Artisan 5 qt Stand Mixer, Empire Red, with the wide bowl and the extra attachments",
    "product_brand": "KitchenAid",
    "include_text": True,
    "retail_text": "Retail $449.99",
}
VARIANTS = {
    "full": DATA,
    "as_is": {**DATA, "as_is": True},
    "no_retail": {**DATA, "retail_text": ""},
    "whole_dollars": {**DATA, "text": "$8.00"},
    "sub_dollar": {**DATA, "text": "$0.75"},
    "big_price": {**DATA, "text": "$1,249.99"},
    "na": {**DATA, "include_text": False},
    "long_word": {**DATA, "product_title": "Supercalifragilisticexpialidocious Blender"},
    "bare": {"text": "$5.00", "qr_data": "ITM1"},
}
LAYOUTS = {
    "price": lambda data, w, h, dpi: td.layout_price_tag(data, w, h),
    "perks": td.layout_perks_tag,
}
DRAWS = {"price": td.draw_price_tag, "perks": td.draw_perks_tag}


class PriceTagDesignTests(unittest.TestCase):
    def test_renders_at_the_label_size_in_black_and_white(self):
        for name, draw in DRAWS.items():
            for w_in, h_in in SIZES:
                for dpi in (203, 300):
                    with self.subTest(design=name, size=f"{w_in}x{h_in}@{dpi}"):
                        img = draw(DATA, w_in, h_in, dpi)
                        self.assertEqual(img.size, (round(w_in * dpi), round(h_in * dpi)))
                        self.assertEqual(set(img.tobytes()) - {0, 255}, set())
                        self.assertGreater(len(set(img.tobytes())), 1)

    def test_every_variant_renders_and_no_text_is_clipped(self):
        for name, layout in LAYOUTS.items():
            for w_in, h_in in SIZES:
                w, h = round(w_in * 203), round(h_in * 203)
                for label, data in VARIANTS.items():
                    with self.subTest(design=name, size=f"{w_in}x{h_in}", variant=label):
                        ops = layout(data, w, h, 203)
                        td._paint_ops(ops, w, h)
                        texts = [op for op in ops if op["kind"] == "text" and op["text"]]
                        self.assertTrue(texts)
                        for op in texts:
                            left, top, right, bottom = td.text_bounds(op)
                            self.assertGreaterEqual(left, 0, op["text"])
                            self.assertGreaterEqual(top, 0, op["text"])
                            self.assertLessEqual(right, w, op["text"])
                            self.assertLessEqual(bottom, h, op["text"])
                        for op in ops:
                            if op["kind"] == "qr":
                                self.assertGreaterEqual(op["x"], 0)
                                self.assertGreaterEqual(op["y"], 0)
                                self.assertLessEqual(op["x"] + op["size"], w)
                                self.assertLessEqual(op["y"] + op["size"], h)
                            if op["kind"] == "logo":
                                self.assertLessEqual(op["x"] + op["w"], w)
                                self.assertLessEqual(op["y"] + op["h"], h)

    def test_perks_qr_is_the_link_with_whole_three_dot_modules_and_the_strip_matches_as_is(self):
        for as_is, strip in ((False, td.STRIP_RETURNS), (True, td.STRIP_AS_IS)):
            ops = td.layout_perks_tag({**DATA, "as_is": as_is}, 457, 254, 203)
            qr = next(op for op in ops if op["kind"] == "qr")
            self.assertEqual(qr["data"], "HTTPS://ECOTHRIFT.US/I/ITM0226342")
            self.assertGreaterEqual(qr["size"] // (td.qr_modules(qr["data"], qr.get("ecc", "H")) + 2), 3)
            self.assertIn(strip, [op["text"] for op in ops if op["kind"] == "text"])
            self.assertIn("OUR PRICE", [op["text"] for op in ops if op["kind"] == "text"])

    def test_classic_qr_is_the_plain_sku_and_retail_is_optional(self):
        ops = td.layout_price_tag(DATA, 305, 203)
        self.assertEqual(next(op for op in ops if op["kind"] == "qr")["data"], "ITM0226342")
        self.assertIn("Retail $449.99", [op["text"] for op in ops if op["kind"] == "text"])
        bare = td.layout_price_tag(VARIANTS["no_retail"], 305, 203)
        self.assertFalse(any(op["text"].startswith("Retail") for op in bare if op["kind"] == "text"))

    def test_price_parsing_matches_dash(self):
        self.assertEqual(td.parse_price("$1,234.5"), ("1,234", ".50"))
        self.assertEqual(td.parse_price("N/A"), None)
        self.assertEqual(td.parse_price("$.75"), ("0", ".75"))
        self.assertEqual(td.perks_price("$12.00"), "$12")
        self.assertEqual(td.perks_price("$12.50"), "$12.50")


@unittest.skipUnless(importlib.util.find_spec("pydantic") and importlib.util.find_spec("fastapi"),
                     "needs the print server's pydantic and fastapi")
class TagsRouteTests(unittest.TestCase):
    def test_price_and_perks_jobs_are_drawn_and_printed_in_order(self):
        from models import TagsPrintRequest
        from routers import labels

        req = TagsPrintRequest(
            tags=[
                {"kind": "price", "data": DATA, "doc_name": "a"},
                {"kind": "perks", "data": {**DATA, "as_is": True}, "doc_name": "b"},
                {"kind": "restoration", "data": {"sku": "ITM1", "title": "Lamp", "needs": ["clean"]}},
                {"kind": "test"},
            ],
            w_in=2.25, h_in=1.25, dpi=203,
        )
        with mock.patch.object(labels, "resolve_printer", return_value="P"), \
                mock.patch.object(labels, "send_image") as send:
            res = asyncio.run(labels.print_tags(req))
        self.assertTrue(res.success, res.error)
        self.assertEqual(send.call_count, 4)
        for call in send.call_args_list:
            self.assertEqual(call.args[1].size, (457, 254))
            self.assertEqual(call.args[2], 203)
        self.assertEqual([c.kwargs["doc_name"] for c in send.call_args_list][:2], ["a", "b"])

    def test_unknown_kind_is_refused(self):
        from models import TagsPrintRequest
        from routers import labels

        req = TagsPrintRequest(tags=[{"kind": "nope"}])
        with mock.patch.object(labels, "resolve_printer", return_value="P"), mock.patch.object(labels, "send_image"):
            res = asyncio.run(labels.print_tags(req))
        self.assertFalse(res.success)


if __name__ == "__main__":
    unittest.main()
