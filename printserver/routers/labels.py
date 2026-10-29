import logging

from fastapi import APIRouter

from config import LABEL_DPI
from models import (
    LabelBatchPrintRequest,
    LabelBatchPrintResponse,
    LabelPrintRequest,
    PrintResponse,
    TagsPrintRequest,
    TestPrintRequest,
)
from services.label_printer import generate_label, generate_test_label
from services.printer_manager import resolve_printer, send_image
from services.tag_designs import draw_restoration_tag, draw_test_label

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


@router.post("/labels", response_model=LabelBatchPrintResponse)
async def print_label_batch(req: LabelBatchPrintRequest):
    """Spool a whole check-in batch in one HTTP call (printer resolved once)."""
    requested = len(req.labels)
    if requested == 0:
        return LabelBatchPrintResponse(
            success=True, message="No labels to print", requested=0, printed=0, failed=0,
        )
    try:
        printer = resolve_printer(req.printer_name or req.labels[0].printer_name, role="label")
    except Exception as exc:
        logger.exception("Batch label print failed resolving printer")
        return LabelBatchPrintResponse(
            success=False,
            message="No label printer available",
            requested=requested,
            printed=0,
            failed=requested,
            errors=[str(exc)],
        )

    printed = 0
    errors: list[str] = []
    for label in req.labels:
        try:
            image = generate_label(label)
            send_image(printer, image, LABEL_DPI, doc_name=f"Label-{label.qr_data}")
            printed += 1
        except Exception as exc:  # keep going — one bad label shouldn't kill the run
            logger.exception("Batch label failed for %s", label.qr_data)
            if len(errors) < 5:
                errors.append(f"{label.qr_data}: {exc}")
    failed = requested - printed
    return LabelBatchPrintResponse(
        success=failed == 0,
        message=f"{printed}/{requested} label(s) sent to {printer}",
        requested=requested,
        printed=printed,
        failed=failed,
        errors=errors,
    )


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


@router.post("/tags", response_model=PrintResponse)
async def print_tags(req: TagsPrintRequest):
    """Restoration tags and test labels, drawn here at the label size Dash sends, printed one job per tag in order
    and fitted to the label like the price tag (1.9.10)."""
    printed = 0
    try:
        printer = resolve_printer(req.printer_name, role="label")
        for job in req.tags:
            if job.kind == "restoration":
                image = draw_restoration_tag(job.data, req.w_in, req.h_in, req.dpi)
            elif job.kind == "test":
                image = draw_test_label(req.w_in, req.h_in, req.dpi)
            else:
                return PrintResponse(success=False, message=f"Unknown tag kind: {job.kind}", output=f"printed={printed}")
            send_image(printer, image, req.dpi, doc_name=job.doc_name or f"Tag-{job.kind}")
            printed += 1
        return PrintResponse(success=True, message=f"{printed} tag(s) sent to {printer}", output=f"printed={printed}")
    except Exception as exc:  # noqa: BLE001 - the dashboard shows the message
        logger.exception("tag print failed")
        return PrintResponse(success=False, message="Tag print failed", error=str(exc), output=f"printed={printed}")
