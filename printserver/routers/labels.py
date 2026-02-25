import logging

from fastapi import APIRouter

from config import LABEL_DPI
from models import LabelPrintRequest, PrintResponse, TestPrintRequest
from services.label_printer import generate_label, generate_test_label
from services.printer_manager import resolve_printer, send_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/print", tags=["labels"])


@router.post("/label", response_model=PrintResponse)
async def print_label(req: LabelPrintRequest):
    try:
        printer = resolve_printer(req.printer_name, role="label")
        image = generate_label(req)
        send_image(printer, image, LABEL_DPI, doc_name=f"Label-{req.qr_data}")
        return PrintResponse(
            success=True,
            message=f"Label sent to {printer}",
            output=f"sku={req.qr_data}",
        )
    except Exception as exc:
        logger.exception("Label print failed")
        return PrintResponse(success=False, message="Label print failed", error=str(exc))


@router.post("/test", response_model=PrintResponse)
async def print_test(req: TestPrintRequest | None = None):
    try:
        printer = resolve_printer(req.printer_name if req else None, role="label")
        image = generate_test_label()
        send_image(printer, image, LABEL_DPI, doc_name="Test-Label")
        return PrintResponse(success=True, message=f"Test label sent to {printer}")
    except Exception as exc:
        logger.exception("Test label print failed")
        return PrintResponse(success=False, message="Test label failed", error=str(exc))
