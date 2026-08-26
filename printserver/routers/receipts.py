import logging

from fastapi import APIRouter

from models import PrintResponse, ReceiptPrintRequest, TestReceiptRequest
from services.drawer_service import kick_drawer
from services.printer_manager import resolve_printer, send_raw
from services.receipt_printer import format_receipt, format_test_receipt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/print", tags=["receipts"])


@router.post("/receipt", response_model=PrintResponse)
async def print_receipt(req: ReceiptPrintRequest):
    try:
        printer = resolve_printer(req.printer_name, role="receipt")
        send_raw(printer, "Receipt", format_receipt(req.receipt_data))
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
        payload = format_test_receipt()
        send_raw(printer, "Test-Receipt", payload)
        logger.info("RAW test receipt to %s (%d bytes)", printer, len(payload))
        return PrintResponse(success=True, message=f"Test receipt sent to {printer}")
    except Exception as exc:
        logger.exception("Test receipt print failed")
        return PrintResponse(success=False, message="Test receipt failed", error=str(exc))
