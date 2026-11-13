"""Fold every work location into the one store (#130, Bill 2026-11-13).

"We only have 1 location. It is the MAIN Eco-Thrift location and it is Canfield: 8425 West Center Road."

Dry run by default: the whole fold runs inside a transaction (constraints checked) and is rolled back, so the
report is exactly what ``--apply`` would do.

    python manage.py fold_locations                 # dry run: report only
    python manage.py fold_locations --apply         # do it

Every row that points at another location (registers, floor plans, employees, departments, safes, drawers, goals,
deliveries, ... found through the foreign keys, so a new one is never missed) moves to the kept location. A floor
plan that was Current at another location stops being Current (it stays as a past version with its pins), because
the store has one Current plan. The emptied locations are then deleted, and the kept one is renamed.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.core.models import WorkLocation

STORE_NAME = 'Canfield'
STORE_ADDRESS = '8425 West Center Road, Omaha NE 68124'


class _DryRun(Exception):
    pass


class Command(BaseCommand):
    help = 'Fold every work location into the one store (Canfield, 8425 West Center Road). Dry run unless --apply.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Save the fold (default: dry run, nothing saved).')
        parser.add_argument('--into', type=int, default=None,
                            help='Id of the location to keep (default: the one at 8425 West Center Road, '
                                 'else the oldest active one).')
        parser.add_argument('--name', default=STORE_NAME, help=f'Name of the kept location (default "{STORE_NAME}").')
        parser.add_argument('--address', default=STORE_ADDRESS, help='Address of the kept location.')

    def handle(self, *args, **opts):
        apply = opts['apply']
        keep = self._pick(opts['into'])
        others = list(WorkLocation.objects.exclude(pk=keep.pk).order_by('id'))
        w = self.stdout.write
        w(self.style.MIGRATE_HEADING('Fold locations: ' + ('APPLY' if apply else 'DRY RUN (nothing is saved)')))
        for loc in WorkLocation.objects.order_by('id'):
            mark = 'KEEP' if loc.pk == keep.pk else 'fold'
            w(f'  [{mark}] #{loc.id} "{loc.name}" {loc.address or "(no address)"} active={loc.is_active}')
        try:
            with transaction.atomic():
                self._fold(keep, others, opts['name'], opts['address'])
                with connection.cursor() as cur:
                    cur.execute('SET CONSTRAINTS ALL IMMEDIATE')  # deferred FKs fail here, not at commit
                if not apply:
                    raise _DryRun()
        except _DryRun:
            w(self.style.WARNING('Dry run: rolled back. Run again with --apply to save it.'))
            return
        except IntegrityError as exc:
            raise CommandError(f'Stopped, nothing saved: {exc}')
        w(self.style.SUCCESS(f'Done: one location, #{keep.id} "{opts["name"]}".'))

    def _pick(self, into):
        if into is not None:
            keep = WorkLocation.objects.filter(pk=into).first()
            if keep is None:
                raise CommandError(f'No location #{into}.')
            return keep
        keep = (
            WorkLocation.objects.filter(address__icontains='8425 West Center').order_by('id').first()
            or WorkLocation.the_store()
        )
        if keep is None:
            raise CommandError('There is no location at all.')
        return keep

    def _fold(self, keep, others, name, address):
        from apps.floorplan.models import FloorPlan, FloorPlanCurrentPeriod

        w = self.stdout.write
        if others:
            # One Current plan for the store: the kept location's wins; another location's Current plan becomes a
            # past version (pins kept on it).
            keep_has_current = FloorPlan.objects.filter(location=keep, is_current=True).exists()
            extra = FloorPlan.objects.filter(location__in=others, is_current=True).order_by('id')
            if not keep_has_current:
                first = extra.first()
                extra = extra.exclude(pk=first.pk) if first else extra
                if first:
                    w(f'  Floor plan #{first.id} "{first.name}" stays Current (the kept location has none).')
            now = timezone.now()
            for plan in extra:
                FloorPlanCurrentPeriod.objects.filter(plan=plan, ended_at__isnull=True).update(ended_at=now)
                FloorPlan.objects.filter(pk=plan.pk).update(is_current=False)
                w(f'  Floor plan #{plan.id} "{plan.name}" is no longer Current; kept as a past version '
                  f'with its {plan.pins.count()} pin(s).')

        moved_any = False
        # include_hidden: a foreign key with related_name='+' still points at a location.
        reverse = [f for f in WorkLocation._meta.get_fields(include_hidden=True) if f.auto_created and not f.concrete]
        for rel in reverse:
            if not (rel.one_to_many or rel.one_to_one):
                continue
            model = rel.related_model
            field = rel.field.name
            label = f'{model._meta.label}.{field}'
            rows = model._base_manager.filter(**{f'{field}__in': others})
            count = rows.count()
            if not count:
                continue
            moved_any = True
            if rel.one_to_one and model._base_manager.filter(**{field: keep}).exists():
                raise CommandError(f'{label}: the kept location already has one and another location has one too. '
                                   'Decide which to keep first; nothing saved.')
            by_loc = {}
            for loc_id in rows.values_list(f'{field}_id', flat=True):
                by_loc[loc_id] = by_loc.get(loc_id, 0) + 1
            try:
                with transaction.atomic():
                    rows.update(**{field: keep})
            except IntegrityError as exc:
                raise CommandError(f'{label}: moving {count} row(s) clashes with the kept location ({exc}). '
                                   'Nothing saved.')
            detail = ', '.join(f'#{k}: {v}' for k, v in sorted(by_loc.items()))
            w(f'  Moved {count} {label} row(s) ({detail}) to #{keep.id}.')
        if not moved_any:
            w('  Nothing points at the other locations.')

        for loc in others:
            loc_id = loc.id
            loc.delete()
            w(f'  Deleted location #{loc_id} "{loc.name}" (nothing points at it now).')
        changes = []
        if keep.name != name:
            changes.append(f'name "{keep.name}" -> "{name}"')
        if address and keep.address != address:
            changes.append(f'address "{keep.address}" -> "{address}"')
        if not keep.is_active:
            changes.append('active')
        keep.name = name
        if address:
            keep.address = address
        keep.is_active = True
        keep.save()
        w(f'  Kept location #{keep.id}: ' + ('; '.join(changes) if changes else 'no change') + '.')
