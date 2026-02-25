from fastapi import APIRouter

from models import PrinterInfo
from services.printer_manager import list_printers

router = APIRouter()


@router.get("/printers", response_model=list[PrinterInfo])
async def get_printers():
    return list_printers()
