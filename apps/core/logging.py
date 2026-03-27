"""
Central dev logger: standard Python logging + optional stderr / file per `.ai/debug/log.config`.
"""
from __future__ import annotations

import logging
import sys
import traceback
from pathlib import Path

from django.conf import settings

from apps.core.log_config import resolve

_file_handler: logging.Handler | None = None


def _format_msg(msg: object, args: tuple) -> str:
    if args:
        try:
            return str(msg) % args
        except Exception:
            return f'{msg!s} {args!r}'
    return str(msg)


def _get_file_handler() -> logging.Handler:
    global _file_handler
    if _file_handler is None:
        log_dir = Path(settings.BASE_DIR) / '.ai' / 'debug'
        log_dir.mkdir(parents=True, exist_ok=True)
        path = log_dir / 'debug.log'
        _file_handler = logging.FileHandler(path, encoding='utf-8')
        _file_handler.setFormatter(
            logging.Formatter('[%(asctime)s] %(name)s %(levelname)s: %(message)s'),
        )
    return _file_handler


class AppLogger:
    """Routes log lines per area to django + optional stderr / file."""

    __slots__ = ('_name', '_area', '_django')

    def __init__(self, name: str, area: str) -> None:
        self._name = name
        self._area = area
        self._django = logging.getLogger(name)

    def _targets(self) -> frozenset[str]:
        return resolve(self._area)

    def _emit_extra(self, level_name: str, formatted: str) -> None:
        targets = self._targets()
        if 'django' in targets:
            print(f'[{self._name}] {level_name}: {formatted}', file=sys.stderr, flush=True)
        if 'file' in targets:
            handler = _get_file_handler()
            record = logging.LogRecord(
                name=self._name,
                level=logging.INFO,
                pathname='',
                lineno=0,
                msg=formatted,
                args=(),
                exc_info=None,
            )
            record.levelname = level_name
            handler.emit(record)

    def debug(self, msg: object, *args: object) -> None:
        self._django.debug(msg, *args)
        if self._targets() & {'django', 'file'}:
            self._emit_extra('DEBUG', _format_msg(msg, args))

    def info(self, msg: object, *args: object) -> None:
        self._django.info(msg, *args)
        if self._targets() & {'django', 'file'}:
            self._emit_extra('INFO', _format_msg(msg, args))

    def warning(self, msg: object, *args: object) -> None:
        self._django.warning(msg, *args)
        if self._targets() & {'django', 'file'}:
            self._emit_extra('WARNING', _format_msg(msg, args))

    def error(self, msg: object, *args: object) -> None:
        self._django.error(msg, *args)
        if self._targets() & {'django', 'file'}:
            self._emit_extra('ERROR', _format_msg(msg, args))

    def exception(self, msg: object, *args: object) -> None:
        self._django.exception(msg, *args)
        targets = self._targets()
        if not (targets & {'django', 'file'}):
            return
        formatted = _format_msg(msg, args)
        tb = traceback.format_exc()
        extra = f'{formatted}\n{tb}'
        if 'django' in targets:
            print(f'[{self._name}] EXCEPTION: {extra}', file=sys.stderr, flush=True)
        if 'file' in targets:
            handler = _get_file_handler()
            record = logging.LogRecord(
                name=self._name,
                level=logging.ERROR,
                pathname='',
                lineno=0,
                msg=extra,
                args=(),
                exc_info=None,
            )
            record.levelname = 'ERROR'
            handler.emit(record)

    def should_log_browser(self) -> bool:
        return 'browser' in self._targets()

    def active_targets(self) -> frozenset[str]:
        """Resolved targets for this area (from log.config cascade)."""
        return self._targets()


def get_logger(name: str, area: str = 'LOG_BACKEND') -> AppLogger:
    return AppLogger(name, area)
