import logging

from fastapi import APIRouter

from models import DrawerControlRequest, PrintResponse
from services.drawer_service import kick_drawer
from services.printer_manager import resolve_printer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/drawer", tags=["drawer"])


@router.post("/control", response_model=PrintResponse)
async def drawer_control(req: DrawerControlRequest):
    try:
        printer = resolve_printer(req.printer_name, role="receipt")
        if req.action == "open":
            kick_drawer(printer)
            return PrintResponse(success=True, message=f"Cash drawer opened via {printer}")
        return PrintResponse(success=False, message=f"Unknown action: {req.action}")
    except Exception as exc:
        logger.exception("Drawer control failed")
        return PrintResponse(success=False, message="Drawer control failed", error=str(exc))
