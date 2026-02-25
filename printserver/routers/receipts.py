import logging

from fastapi import APIRouter

from models import PrintResponse, ReceiptPrintRequest, TestReceiptRequest
from services.drawer_service import kick_drawer
from services.printer_manager import resolve_printer, send_text
from services.receipt_printer import format_receipt_text, format_test_receipt_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/print", tags=["receipts"])


@router.post("/receipt", response_model=PrintResponse)
async def print_receipt(req: ReceiptPrintRequest):
    try:
        printer = resolve_printer(req.printer_name, role="receipt")
        text = format_receipt_text(req.receipt_data)
        send_text(printer, text, doc_name="Receipt")
        if req.open_drawer:
            kick_drawer(printer)
        return PrintResponse(success=True, message=f"Receipt sent to {printer}")
    except Exception as exc:
        logger.exception("Receipt print failed")
        return PrintResponse(success=False, message="Receipt print failed", error=str(exc))


@router.post("/test-receipt", response_model=PrintResponse)
async def print_test_receipt(req: TestReceiptRequest | None = None):
    try:
        printer = resolve_printer(req.printer_name if req else None, role="receipt")
        text = format_test_receipt_text()
        send_text(printer, text, doc_name="Test-Receipt")
        return PrintResponse(success=True, message=f"Test receipt sent to {printer}")
    except Exception as exc:
        logger.exception("Test receipt print failed")
        return PrintResponse(success=False, message="Test receipt failed", error=str(exc))
