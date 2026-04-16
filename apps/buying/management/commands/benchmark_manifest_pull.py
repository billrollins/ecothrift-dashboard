"""Benchmark full manifest pull pipeline on one large auction (warm-up + baseline runs)."""

from __future__ import annotations

import statistics
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from apps.buying.models import Auction, CategoryMapping, ManifestPullLog, ManifestRow
from apps.buying.services import pipeline
from apps.buying.services.ai_key_mapping import map_one_fast_cat_batch


def _b_manifest_dir() -> Path:
    return (
        Path(settings.BASE_DIR)
        / 'workspace'
        / '4-16-26 Collection'
        / 'B-Manifest API'
    )


def _pick_auction(*, auction_id: int | None, min_rows: int) -> Auction | None:
    if auction_id is not None:
        return Auction.objects.filter(pk=auction_id).select_related('marketplace').first()
    qs = (
        Auction.objects.annotate(_row_count=Count('manifest_rows'))
        .filter(_row_count__gte=min_rows)
        .order_by('-_row_count')
    )
    a = qs.select_related('marketplace').first()
    if a:
        return a
    return (
        Auction.objects.exclude(lot_id__isnull=True)
        .exclude(lot_id='')
        .select_related('marketplace')
        .order_by('-lot_size', '-id')
        .first()
    )


def _last_success_log(auction_id: int) -> ManifestPullLog | None:
    return (
        ManifestPullLog.objects.filter(auction_id=auction_id, success=True)
        .order_by('-completed_at')
        .first()
    )


class Command(BaseCommand):
    help = (
        'Pick an auction with a large manifest (or --auction-id), run warm-up pull + AI '
        'fast_cat mapping, then N baseline --force pulls; append timings to '
        'workspace/4-16-26 Collection/B-Manifest API/benchmark_results.md'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--auction-id',
            type=int,
            default=None,
            help='Auction primary key (default: auto-pick by manifest row count).',
        )
        parser.add_argument(
            '--min-rows',
            type=int,
            default=1000,
            help='When auto-picking, prefer auctions with at least this many manifest rows.',
        )
        parser.add_argument(
            '--skip-warmup',
            action='store_true',
            help='Skip initial pull + AI mapping (use if already warmed up).',
        )
        parser.add_argument(
            '--skip-ai',
            action='store_true',
            help='Skip map_fast_cat_batch loop after warm-up pull.',
        )
        parser.add_argument(
            '--baseline-runs',
            type=int,
            default=3,
            help=(
                'Number of timed --force pulls after warm-up (default 3). '
                'Use 0 with --skip-warmup for a DB-only dry-run (no HTTP). '
                'Use 0 without --skip-warmup for warm-up + AI only (no baselines).'
            ),
        )
        parser.add_argument(
            '--no-prefetch',
            action='store_true',
            help='Pass through to run_manifest_pull (single-auction no-op).',
        )

    def handle(self, *args, **options) -> None:
        auction_id = options.get('auction_id')
        min_rows = int(options['min_rows'])
        skip_warmup = bool(options.get('skip_warmup'))
        skip_ai = bool(options.get('skip_ai'))
        baseline_runs = max(0, int(options['baseline_runs']))
        no_prefetch = bool(options.get('no_prefetch'))

        auction = _pick_auction(auction_id=auction_id, min_rows=min_rows)
        if auction is None:
            raise CommandError('No matching auction found. Create one or pass --auction-id.')

        if not (auction.lot_id or '').strip():
            raise CommandError(f'Auction {auction.pk} has no lot_id; cannot benchmark manifest pull.')

        out_dir = _b_manifest_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        results_path = out_dir / 'benchmark_results.md'

        socks = bool(getattr(settings, 'BUYING_SOCKS5_PROXY_ENABLED', False))
        chicago = datetime.now(tz=ZoneInfo('America/Chicago')).isoformat()
        row_count = ManifestRow.objects.filter(auction=auction).count()

        lines: list[str] = [
            f'\n## Run {chicago}\n',
            f'- Auction id: **{auction.pk}** — {auction.title or "(no title)"}\n',
            f'- lot_id: `{auction.lot_id}`\n',
            f'- Manifest rows in DB (before this run): **{row_count}**\n',
            f'- SOCKS5 enabled: **{socks}**\n',
        ]

        # B-TL1: --skip-warmup --baseline-runs 0 → pick auction, no HTTP
        if skip_warmup and baseline_runs == 0:
            lines.append('- **Dry-run:** no manifest pull, no baselines.\n')
            with results_path.open('a', encoding='utf-8') as f:
                f.writelines(lines)
            self.stdout.write(
                self.style.SUCCESS(
                    f'Dry-run: auction id={auction.pk} lot_id={auction.lot_id!r} '
                    f'manifest_rows={row_count} (see {results_path})'
                )
            )
            return

        if not skip_warmup:
            self.stdout.write(self.style.NOTICE('Warm-up: pull manifest (timing discarded)…'))
            pipeline.run_manifest_pull(
                [auction.pk],
                force=True,
                log_first_manifest_schema=False,
                inter_auction_delay=0.0,
                prefetch_next=False,
            )
            auction.refresh_from_db()
            if not skip_ai:
                self.stdout.write(self.style.NOTICE('Warm-up: AI map_fast_cat_batch until done…'))
                mapping = dict(
                    CategoryMapping.objects.values_list('source_key', 'canonical_category')
                )
                for _ in range(500):
                    body = map_one_fast_cat_batch(auction, mapping=mapping)
                    mapping = dict(
                        CategoryMapping.objects.values_list('source_key', 'canonical_category')
                    )
                    if body.get('error') == 'ai_not_configured':
                        lines.append(
                            '- AI mapping skipped (ANTHROPIC_API_KEY not configured).\n'
                        )
                        self.stdout.write(
                            self.style.WARNING('AI not configured; baseline may include unmapped keys.')
                        )
                        break
                    if not body.get('has_more') and (body.get('keys_remaining') or 0) == 0:
                        lines.append(
                            f"- AI warm-up: keys_mapped={body.get('keys_mapped', 0)}\n"
                        )
                        break
                else:
                    lines.append('- AI warm-up: stopped at safety iteration cap (500).\n')

        # Warm-up only: --baseline-runs 0 without --skip-warmup
        if baseline_runs == 0:
            lines.append(
                '- **Warm-up only** (`baseline_runs=0`): no timed baseline pulls.\n'
            )
            with results_path.open('a', encoding='utf-8') as f:
                f.writelines(lines)
            self.stdout.write(
                self.style.SUCCESS(
                    f'Warm-up complete; no baselines. Appended summary to {results_path}'
                )
            )
            return

        durations: list[float] = []
        rows_list: list[int] = []

        self.stdout.write(self.style.NOTICE(f'Baseline: {baseline_runs} timed pull(s) with --force…'))
        for i in range(baseline_runs):
            pipeline.run_manifest_pull(
                [auction.pk],
                force=True,
                log_first_manifest_schema=False,
                inter_auction_delay=0.0,
                prefetch_next=not no_prefetch,
            )
            log = _last_success_log(auction.pk)
            if log is None:
                raise CommandError(f'Baseline run {i + 1}: no successful ManifestPullLog row.')
            durations.append(float(log.duration_seconds))
            rows_list.append(int(log.rows_downloaded))
            self.stdout.write(
                f"  Run {i + 1}: duration={log.duration_seconds:.4f}s rows={log.rows_downloaded}"
            )

        avg_d = statistics.mean(durations)
        avg_rows = int(statistics.mean(rows_list)) if rows_list else 0
        rps = (avg_rows / avg_d) if avg_d > 0 else 0.0

        lines.extend(
            [
                f'- Baseline runs: **{baseline_runs}**\n',
                f'- Avg HTTP duration (ManifestPullLog.duration_seconds): **{avg_d:.4f}s**\n',
                f'- Avg rows downloaded: **{avg_rows}** (~{rps:.1f} rows/s)\n',
                f'- Individual durations (s): `{durations}`\n',
            ]
        )

        with results_path.open('a', encoding='utf-8') as f:
            f.writelines(lines)

        self.stdout.write(
            self.style.SUCCESS(
                f'Appended benchmark summary to {results_path} (avg {avg_d:.4f}s over {baseline_runs} runs).'
            )
        )
