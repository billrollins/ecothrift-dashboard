from fastapi import APIRouter

from config import VERSION
from models import HealthResponse
from services.printer_manager import list_printers

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    printers = list_printers()
    return HealthResponse(
        status="ok",
        version=VERSION,
        printers_available=len(printers),
    )
