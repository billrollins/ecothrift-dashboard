import logging

from fastapi import APIRouter

from models import PrintResponse, ReceiptPrintRequest, TestReceiptRequest
from services.drawer_service import build_kick_bytes
from starlette.concurrency import run_in_threadpool

from services.printer_manager import resolve_printer, send_raw_paced
from services.receipt_printer import receipt_job_parts, sample_receipt_dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/print", tags=["receipts"])


@router.post("/receipt", response_model=PrintResponse)
async def print_receipt(req: ReceiptPrintRequest):
    drawer_opened = None
    try:
        printer = resolve_printer(req.printer_name, role="receipt")
        parts = receipt_job_parts(req.receipt_data)
        if req.open_drawer:
            try:
                first, wait = parts[0]
                parts[0] = (build_kick_bytes() + first, wait)
                drawer_opened = True
            except Exception as exc:
                logger.warning("Drawer kick bytes failed; printing receipt without kick: %s", exc)
                drawer_opened = False
        # Paced, a strip at a time (1.9.5): a few seconds, so off the server's main loop.
        await run_in_threadpool(send_raw_paced, printer, "Receipt", parts)
    except Exception as exc:
        logger.exception("Receipt print failed")
        return PrintResponse(success=False, message="Receipt print failed", error=str(exc))

    return PrintResponse(
        success=True,
        message=f"Receipt sent to {printer}",
        drawer_opened=drawer_opened,
    )


@router.post("/test-receipt", response_model=PrintResponse)
async def print_test_receipt(req: TestReceiptRequest | None = None):
    try:
        printer = resolve_printer(req.printer_name if req else None, role="receipt")
        parts = receipt_job_parts(sample_receipt_dict())
        await run_in_threadpool(send_raw_paced, printer, "Test-Receipt", parts)
        logger.info("RAW test receipt to %s (%d bytes, %d strips)", printer, sum(len(b) for b, _w in parts), len(parts))
        return PrintResponse(success=True, message=f"Test receipt sent to {printer}")
    except Exception as exc:
        logger.exception("Test receipt print failed")
        return PrintResponse(success=False, message="Test receipt failed", error=str(exc))
