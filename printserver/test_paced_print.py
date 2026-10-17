"""1.9.5 (owner 2026-10-17): a receipt's top printed over and over. The picture now goes to the printer one strip at a
time, at about the printer's speed (longer for dark strips), in one job, so Windows never stalls and restarts it.

Run from printserver/: ``python -m pytest -p no:django -o addopts="" test_paced_print.py``.
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from services import receipt_printer as rp
from services import receipt_raster as rr

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


class StripTests(unittest.TestCase):
    def test_the_strips_join_into_the_whole_job(self):
        data = _fixture("receipt_thriftplus_member")
        parts = rr.receipt_parts(data)
        self.assertGreater(len(parts), 5)
        self.assertEqual(b"".join(b for b, _w in parts), rr.receipt_escpos(data))
        self.assertTrue(parts[0][0].startswith(rp.INIT + rp.LEFT + b"\x1dv0\x00"))
        self.assertTrue(parts[-1][0].endswith(rp.FEED_LINES(4) + rp.PARTIAL_CUT))
        self.assertTrue(all(len(b) <= 5 * 1024 + 64 for b, _w in parts))  # small strips, never one big write

    def test_a_dark_strip_waits_longer_and_the_whole_receipt_stays_quick(self):
        white = Image.new("1", (rr.DOTS, rr.BAND_ROWS), 1)
        black = Image.new("1", (rr.DOTS, rr.BAND_ROWS), 0)
        (_w, light_wait), = rr.raster_parts(white)
        (_b, dark_wait), = rr.raster_parts(black)
        self.assertAlmostEqual(dark_wait, light_wait * (1 + rr.DARK_SLOWDOWN), places=2)
        total = sum(w for _b, w in rr.receipt_parts(_fixture("receipt_thriftplus_member")))
        self.assertLess(total, 8.0)  # a few seconds for a long receipt

    def test_the_text_tape_is_one_part_when_the_picture_fails(self):
        data = _fixture("receipt_thriftplus_guest")
        with mock.patch("services.receipt_raster.render_thermal_receipt", side_effect=RuntimeError("no fonts")):
            parts = rp.receipt_job_parts(data)
        self.assertEqual(parts, [(rp.format_receipt_tape(data), 0.0)])


class PacedSendTests(unittest.TestCase):
    def test_one_job_written_a_strip_at_a_time_with_the_waits(self):
        from services import printer_manager as pm

        calls: list[tuple] = []
        fake = mock.MagicMock()
        fake.OpenPrinter.return_value = "h"
        fake.WritePrinter.side_effect = lambda h, data: calls.append(("write", data))
        fake.StartDocPrinter.side_effect = lambda *a: calls.append(("start",))
        fake.EndDocPrinter.side_effect = lambda *a: calls.append(("end",))
        with mock.patch.object(pm, "win32print", fake), \
                mock.patch.object(pm.time, "sleep", side_effect=lambda s: calls.append(("sleep", s))):
            pm.send_raw_paced("POS-80", "Receipt", [(b"a", 0.1), (b"b", 0.0), (b"c", 0.2)])
        self.assertEqual(calls, [("start",), ("write", b"a"), ("sleep", 0.1), ("write", b"b"), ("write", b"c"),
                                 ("sleep", 0.2), ("end",)])
        fake.ClosePrinter.assert_called_once_with("h")


if __name__ == "__main__":
    unittest.main()
