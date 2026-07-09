from __future__ import annotations

import asyncio
import base64
import io
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import ANY, Mock, call, patch

from PIL import Image


# Keep these unit tests portable when optional runtime packages are unavailable.
class _StubRouter:
    def __init__(self, *args, **kwargs):
        pass

    def post(self, *args, **kwargs):
        return lambda function: function


fastapi_stub = types.ModuleType("fastapi")
fastapi_stub.APIRouter = _StubRouter
printer_manager_stub = types.ModuleType("services.printer_manager")
printer_manager_stub.resolve_printer = Mock()
printer_manager_stub.send_image = Mock()
with patch.dict(
    sys.modules,
    {
        "fastapi": fastapi_stub,
        "services.printer_manager": printer_manager_stub,
    },
):
    from routers import custom


def _png_base64(size: tuple[int, int] = (2, 2)) -> str:
    output = io.BytesIO()
    Image.new("L", size, 255).save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


class FakePage:
    def __init__(self, width: int = 2, height: int = 2):
        self.rect = SimpleNamespace(width=width, height=height)
        self._pix = SimpleNamespace(
            width=width,
            height=height,
            samples=b"\xff" * (width * height),
        )
        self.get_pixmap = Mock(return_value=self._pix)


class FakeDocument:
    def __init__(self, page_count: int, pages: list[FakePage] | None = None):
        self.page_count = page_count
        self.pages = pages or []
        self.closed = False

    def __iter__(self):
        return iter(self.pages)

    def close(self) -> None:
        self.closed = True


def _fake_fitz(doc: FakeDocument):
    return SimpleNamespace(
        open=Mock(return_value=doc),
        Matrix=Mock(return_value=object()),
        csGRAY=object(),
    )


class CustomPrintRouterTests(unittest.TestCase):
    def setUp(self):
        custom.logger.disabled = True

    def tearDown(self):
        custom.logger.disabled = False

    def test_invalid_base64_returns_failed_response(self):
        request = custom.ImageCopiesPrintRequest(image_base64="not base64!")

        with patch.object(custom, "resolve_printer") as resolve:
            response = asyncio.run(custom.print_image_copies(request))

        self.assertFalse(response.success)
        self.assertIn("Invalid base64 image", response.error or "")
        resolve.assert_not_called()

    def test_decoded_image_and_pdf_limits_return_failed_responses(self):
        self.assertEqual(custom.MAX_IMAGE_BYTES, 5 * 1024 * 1024)
        self.assertEqual(custom.MAX_PDF_BYTES, 20 * 1024 * 1024)
        image_request = custom.ImageCopiesPrintRequest(
            image_base64=base64.b64encode(b"abc").decode("ascii")
        )
        pdf_request = custom.PdfCopiesPrintRequest(
            pdf_base64=base64.b64encode(b"abc").decode("ascii")
        )
        fake_fitz = _fake_fitz(FakeDocument(1, [FakePage()]))

        with (
            patch.object(custom, "MAX_IMAGE_BYTES", 2),
            patch.object(custom, "resolve_printer") as resolve,
        ):
            image_response = asyncio.run(custom.print_image_copies(image_request))

        with (
            patch.object(custom, "MAX_PDF_BYTES", 2),
            patch.dict(sys.modules, {"fitz": fake_fitz}),
            patch.object(custom, "resolve_printer") as resolve_pdf,
        ):
            pdf_response = asyncio.run(custom.print_pdf_copies(pdf_request))

        self.assertFalse(image_response.success)
        self.assertIn("Image exceeds", image_response.error or "")
        resolve.assert_not_called()
        self.assertFalse(pdf_response.success)
        self.assertIn("Pdf exceeds", pdf_response.error or "")
        resolve_pdf.assert_not_called()

    def test_image_raster_dimension_and_pixel_limits_are_checked(self):
        too_wide = custom.ImageCopiesPrintRequest(
            image_base64=_png_base64((custom.MAX_RASTER_DIMENSION + 1, 1))
        )
        too_many_pixels = custom.ImageCopiesPrintRequest(
            image_base64=_png_base64((2, 2))
        )

        with patch.object(custom, "send_image") as send:
            dimension_response = asyncio.run(custom.print_image_copies(too_wide))
            with patch.object(custom, "MAX_RASTER_PIXELS", 3):
                pixel_response = asyncio.run(custom.print_image_copies(too_many_pixels))

        self.assertFalse(dimension_response.success)
        self.assertIn("dimensions exceed", dimension_response.error or "")
        self.assertFalse(pixel_response.success)
        self.assertIn("pixel limit", pixel_response.error or "")
        send.assert_not_called()

    def test_oversized_pdf_raster_is_rejected_before_rendering(self):
        page = FakePage(custom.MAX_RASTER_DIMENSION + 1, 1)
        doc = FakeDocument(1, [page])
        request = custom.PdfCopiesPrintRequest(
            pdf_base64=base64.b64encode(b"%PDF-test").decode("ascii")
        )

        with (
            patch.dict(sys.modules, {"fitz": _fake_fitz(doc)}),
            patch.object(custom, "resolve_printer") as resolve,
        ):
            response = asyncio.run(custom.print_pdf_copies(request))

        self.assertFalse(response.success)
        self.assertIn("dimensions exceed", response.error or "")
        page.get_pixmap.assert_not_called()
        resolve.assert_not_called()
        self.assertTrue(doc.closed)

    def test_empty_and_oversized_pdfs_return_failed_responses(self):
        request = custom.PdfCopiesPrintRequest(
            pdf_base64=base64.b64encode(b"%PDF-test").decode("ascii")
        )
        empty_doc = FakeDocument(0)
        oversized_doc = FakeDocument(custom.MAX_PDF_PAGES + 1)

        with (
            patch.dict(sys.modules, {"fitz": _fake_fitz(empty_doc)}),
            patch.object(custom, "resolve_printer") as resolve_empty,
        ):
            empty_response = asyncio.run(custom.print_pdf_copies(request))

        with (
            patch.dict(sys.modules, {"fitz": _fake_fitz(oversized_doc)}),
            patch.object(custom, "resolve_printer") as resolve_oversized,
        ):
            oversized_response = asyncio.run(custom.print_pdf_copies(request))

        self.assertFalse(empty_response.success)
        self.assertIn("PDF has no pages", empty_response.error or "")
        self.assertTrue(empty_doc.closed)
        resolve_empty.assert_not_called()
        self.assertFalse(oversized_response.success)
        self.assertIn("PDF exceeds the 10 page limit", oversized_response.error or "")
        self.assertTrue(oversized_doc.closed)
        resolve_oversized.assert_not_called()

    def test_image_copies_preserve_size_and_copy_count(self):
        request = custom.ImageCopiesPrintRequest(
            image_base64=_png_base64(),
            copies=3,
            dpi=300,
            doc_name="Shelf",
        )

        with (
            patch.object(custom, "resolve_printer", return_value="Label Printer"),
            patch.object(custom, "send_image") as send,
        ):
            response = asyncio.run(custom.print_image_copies(request))

        self.assertTrue(response.success)
        self.assertEqual(send.call_count, 3)
        self.assertEqual(
            [item.kwargs["doc_name"] for item in send.call_args_list],
            ["Shelf-1", "Shelf-2", "Shelf-3"],
        )
        self.assertTrue(
            all(item.kwargs["fit_to_printable"] is False for item in send.call_args_list)
        )

    def test_pdf_copy_order_keeps_default_fit_behavior(self):
        pages = [FakePage(), FakePage()]
        doc = FakeDocument(2, pages)
        request = custom.PdfCopiesPrintRequest(
            pdf_base64=base64.b64encode(b"%PDF-test").decode("ascii"),
            copies=2,
            doc_name="Packet",
        )

        with (
            patch.dict(sys.modules, {"fitz": _fake_fitz(doc)}),
            patch.object(custom, "resolve_printer", return_value="Office Printer"),
            patch.object(custom, "send_image") as send,
        ):
            response = asyncio.run(custom.print_pdf_copies(request))

        self.assertTrue(response.success)
        self.assertEqual(
            send.call_args_list,
            [
                call("Office Printer", ANY, custom.PDF_RENDER_DPI, doc_name="Packet-1p1"),
                call("Office Printer", ANY, custom.PDF_RENDER_DPI, doc_name="Packet-1p2"),
                call("Office Printer", ANY, custom.PDF_RENDER_DPI, doc_name="Packet-2p1"),
                call("Office Printer", ANY, custom.PDF_RENDER_DPI, doc_name="Packet-2p2"),
            ],
        )
        self.assertTrue(doc.closed)


if __name__ == "__main__":
    unittest.main()
