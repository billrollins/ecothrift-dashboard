"""Generate and print barcode/QR labels for inventory items."""

from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

import barcode  # python-barcode
import qrcode
from PIL import Image, ImageDraw, ImageFont

from config import LABEL_DPI, LABEL_HEIGHT_INCHES, LABEL_WIDTH_INCHES

if TYPE_CHECKING:
    from models import LabelPrintRequest

logger = logging.getLogger(__name__)

LABEL_W = int(LABEL_WIDTH_INCHES * LABEL_DPI)
LABEL_H = int(LABEL_HEIGHT_INCHES * LABEL_DPI)

# Attempt to load a TrueType font; fall back to Pillow's default bitmap font.
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for family in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(family, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _make_qr(data: str, box_px: int) -> Image.Image:
    qr = qrcode.QRCode(box_size=4, border=1, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("L")
    return img.resize((box_px, box_px), Image.NEAREST)


def _make_barcode_128(data: str, width: int, height: int) -> Image.Image:
    Code128 = barcode.get_barcode_class("code128")
    writer = barcode.writer.ImageWriter()
    code = Code128(data, writer=writer)
    buf = io.BytesIO()
    code.write(buf, options={"write_text": False, "module_height": height / LABEL_DPI * 25.4})
    buf.seek(0)
    img = Image.open(buf).convert("L")
    return img.resize((width, height), Image.LANCZOS)


def generate_label(req: LabelPrintRequest) -> Image.Image:
    """Build a label as a PIL Image.

    Layout (landscape, left-to-right):
      [ QR code ] [ Price text  ]
                  [ Product title ]
      [ -------- Code128 barcode -------- ]
    """
    label = Image.new("L", (LABEL_W, LABEL_H), 255)
    draw = ImageDraw.Draw(label)

    padding = int(LABEL_DPI * 0.05)
    qr_size = int(LABEL_H * 0.52)

    qr_img = _make_qr(req.qr_data, qr_size)
    label.paste(qr_img, (padding, padding))

    text_x = padding + qr_size + padding

    if req.include_text:
        price_font = _font(int(LABEL_DPI * 0.22))
        draw.text((text_x, padding), req.text, font=price_font, fill=0)

        if req.product_title:
            title_font = _font(int(LABEL_DPI * 0.11))
            price_bbox = draw.textbbox((text_x, padding), req.text, font=price_font)
            title_y = price_bbox[3] + 2
            max_title_w = LABEL_W - text_x - padding
            _draw_wrapped(draw, req.product_title, title_font, text_x, title_y, max_title_w)

    bc_height = int(LABEL_H * 0.28)
    bc_width = LABEL_W - 2 * padding
    bc_y = LABEL_H - bc_height - padding
    try:
        bc_img = _make_barcode_128(req.qr_data, bc_width, bc_height)
        label.paste(bc_img, (padding, bc_y))
    except Exception:
        logger.warning("Barcode generation failed for %s; label will omit barcode", req.qr_data)

    return label


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    x: int,
    y: int,
    max_width: int,
) -> None:
    """Draw text, wrapping at max_width. Truncates after 2 lines."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)

    for i, line in enumerate(lines[:2]):
        if i == 1 and len(lines) > 2:
            line = line[: max(len(line) - 3, 0)] + "..."
        draw.text((x, y), line, font=font, fill=0)
        bbox = draw.textbbox((x, y), line, font=font)
        y = bbox[3] + 1


def generate_test_label() -> Image.Image:
    """Generate a test label with sample data."""
    from models import LabelPrintRequest

    return generate_label(
        LabelPrintRequest(
            text="$9.99",
            qr_data="TEST-SKU-001",
            include_text=True,
            product_title="Test Product — Print Server OK",
        )
    )
