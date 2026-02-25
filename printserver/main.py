"""Eco-Thrift Print Server — local FastAPI service for label/receipt printing."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# When frozen by PyInstaller (--noconsole) sys.stdout/stderr are None, which
# causes uvicorn's log formatter to crash on .isatty().  Redirect both to a
# log file next to the exe so we still have a record of what happened.
# ---------------------------------------------------------------------------
def _fix_streams() -> None:
    if not getattr(sys, "frozen", False):
        return  # running normally from terminal — nothing to do

    if getattr(sys, "executable", None):
        log_path = Path(sys.executable).parent / "printserver.log"
    else:
        log_path = Path("printserver.log")

    log_file = open(log_path, "a", encoding="utf-8", buffering=1)  # line-buffered
    if sys.stdout is None:
        sys.stdout = log_file  # type: ignore[assignment]
    if sys.stderr is None:
        sys.stderr = log_file  # type: ignore[assignment]


_fix_streams()

import uvicorn  # noqa: E402 — must come after stream fix
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from config import HOST, PORT, VERSION  # noqa: E402
from routers import drawer, health, labels, manage, printers, receipts, settings  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("printserver")

app = FastAPI(
    title="Eco-Thrift Print Server",
    version=VERSION,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings.router)
app.include_router(health.router)
app.include_router(printers.router)
app.include_router(labels.router)
app.include_router(receipts.router)
app.include_router(drawer.router)
app.include_router(manage.router)


def main() -> None:
    logger.info("Starting Eco-Thrift Print Server v%s on %s:%d", VERSION, HOST, PORT)
    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        # Use "none" log config so uvicorn doesn't install its own formatters
        # that reference sys.stdout before we've had a chance to fix it.
        log_config=None,
        log_level="info",
    )


if __name__ == "__main__":
    main()
