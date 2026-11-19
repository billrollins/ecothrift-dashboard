"""The snapshot kept in memory, already encoded (JSON bytes, gzip bytes, ETag), one per worker process.

``get()`` answers at once. When the copy is older than the refresh time (``storefront.snapshot_seconds``, default
300), the next request starts ONE background thread to rebuild (single flight) and still answers from the old copy.
Only the very first request of a worker builds in line (the others wait for it). A failed rebuild keeps the old copy,
logs, and is not tried again for ``RETRY_SECONDS``.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import logging
import threading
import time
from dataclasses import dataclass, field

from apps.storefront.services import snapshot

logger = logging.getLogger(__name__)

RETRY_SECONDS = 30
GZIP_LEVEL = 9  # built off the request path: the smallest bytes win


@dataclass(frozen=True)
class Encoded:
    raw: bytes
    gz: bytes
    etag: str  # quoted, as the header carries it


@dataclass
class Built:
    stock: Encoded
    home: Encoded
    built_at: float              # time.monotonic()
    max_age: int
    stats: dict = field(default_factory=dict)


def encode(body: dict, as_of: str) -> Encoded:
    """``v`` is a hash of the content without ``as_of``: an unchanged shelf keeps its ETag across rebuilds."""
    inner = json.dumps(body, ensure_ascii=False, separators=(',', ':'), default=snapshot.json_default).encode('utf-8')
    v = hashlib.blake2b(inner, digest_size=10).hexdigest()
    head = json.dumps({'v': v, 'as_of': as_of}, separators=(',', ':')).encode('utf-8')
    raw = head[:-1] + b',' + inner[1:] if len(inner) > 2 else head
    return Encoded(raw=raw, gz=gzip.compress(raw, compresslevel=GZIP_LEVEL, mtime=0), etag=f'"{v}"')


def build_encoded() -> Built:
    t = time.perf_counter()
    snap = snapshot.build()
    as_of = snap['as_of'].isoformat(timespec='seconds')
    stock = encode(snapshot.stock_payload(snap), as_of)
    home = encode(snapshot.home_payload(snap), as_of)
    timings = dict(snap['timings'], encode=time.perf_counter() - t - snap['timings']['total'])
    stats = {
        'timings': timings, 'instore': len(snap['instore']), 'coming': len(snap['coming']),
        'trucks': len(snap['trucks']), 'finds': len(snap['finds']), 'pieces': sum(snap['pieces']),
        'stock_raw': len(stock.raw), 'stock_gz': len(stock.gz), 'home_raw': len(home.raw), 'home_gz': len(home.gz),
    }
    return Built(stock=stock, home=home, built_at=time.monotonic(), max_age=snap['settings'].refresh_seconds,
                 stats=stats)


class Holder:
    def __init__(self, builder=build_encoded):
        self._builder = builder
        self._current: Built | None = None
        self._first = threading.Lock()   # the first build of the worker, in line
        self._flight = threading.Lock()  # one rebuild at a time
        self._retry_at = 0.0
        self.background = True           # tests set False: the rebuild runs in line

    def get(self) -> Built:
        current = self._current
        if current is None:
            with self._first:
                if self._current is None:
                    self._current = self._builder()
                return self._current
        now = time.monotonic()
        if now - current.built_at >= current.max_age and now >= self._retry_at:
            self._refresh()
        return current

    def peek(self) -> Built | None:
        return self._current

    def reset(self) -> None:
        self._current = None
        self._retry_at = 0.0

    def _refresh(self) -> None:
        if not self._flight.acquire(blocking=False):
            return  # a rebuild is already running
        if not self.background:
            self._rebuild()
            return
        try:
            threading.Thread(target=self._rebuild, kwargs={'close_db': True}, name='storefront-snapshot',
                             daemon=True).start()
        except Exception:
            self._flight.release()
            logger.exception('storefront: could not start the snapshot rebuild')

    def _rebuild(self, close_db: bool = False) -> None:
        try:
            self._current = self._builder()
        except Exception:
            self._retry_at = time.monotonic() + RETRY_SECONDS
            logger.exception('storefront: snapshot rebuild failed; serving the old copy')
        finally:
            self._flight.release()
            if close_db:
                from django.db import connections

                connections.close_all()  # this thread's connections only


holder = Holder()
