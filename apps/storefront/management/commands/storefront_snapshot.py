"""Build the storefront snapshot once and print what it cost: seconds, queries, rows, raw and gzip sizes.

Read-only. Also times warm requests to the two feeds (the view alone, in process) and checks they run no query.
"""
from __future__ import annotations

import statistics
import time

from django.core.management.base import BaseCommand
from django.db import connection
from django.test.client import RequestFactory
from django.test.utils import CaptureQueriesContext

KB = 1024


class Command(BaseCommand):
    help = 'Build the storefront snapshot once and print build seconds, queries, rows and payload sizes.'

    def add_arguments(self, parser):
        parser.add_argument('--requests', type=int, default=500, help='warm requests to time per feed')

    def handle(self, *args, **opts):
        from apps.storefront import views
        from apps.storefront.services.holder import build_encoded, holder

        with CaptureQueriesContext(connection) as ctx:
            t = time.perf_counter()
            built = build_encoded()
            seconds = time.perf_counter() - t
        st = built.stats
        w = self.stdout.write
        w(f'build: {seconds:.2f} s, {len(ctx.captured_queries)} queries')
        w('  ' + ', '.join(f'{k} {v:.3f}s' for k, v in st['timings'].items()))
        slow = sorted(ctx.captured_queries, key=lambda q: -float(q['time']))[:3]
        w('  slowest queries: ' + ', '.join(f"{float(q['time']):.3f}s" for q in slow))
        w(f"rows: instore {st['instore']} products ({st['pieces']} pieces), coming {st['coming']}, "
          f"trucks {st['trucks']}, finds {st['finds']}")
        w(f"stock.json: {st['stock_raw'] / KB:.0f} KB raw, {st['stock_gz'] / KB:.0f} KB gzip")
        w(f"home.json: {st['home_raw'] / KB:.1f} KB raw, {st['home_gz'] / KB:.1f} KB gzip")

        holder._current = built  # warm, as a worker is after its first request
        rf = RequestFactory()
        for name, view in (('stock', views.stock), ('home', views.home)):
            times = []
            with CaptureQueriesContext(connection) as warm:
                for _ in range(max(1, opts['requests'])):
                    request = rf.get(f'/api/storefront/{name}.json', HTTP_ACCEPT_ENCODING='gzip, br')
                    t = time.perf_counter()
                    response = view(request)
                    times.append(time.perf_counter() - t)
            w(f'warm {name}.json: median {statistics.median(times) * 1e6:.0f} us, '
              f'p99 {sorted(times)[int(len(times) * 0.99) - 1] * 1e6:.0f} us, {len(warm.captured_queries)} queries, '
              f"{response.status_code} {response.get('Content-Encoding', 'identity')} {len(response.content)} bytes")
        if seconds > 2:
            w(self.style.WARNING('over the 2 s target'))
        if st['stock_gz'] > 500 * KB:
            w(self.style.WARNING('stock.json gzip is over 500 KB'))
