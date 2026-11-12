"""Step 2 of loading sign drafts (#122): turn an uploaded manifest into drafts on Facilities > Signage.

Step 1 (``scripts/s3/upload_sign_drafts.py``, on the PC with the package folders) uploads the files and the manifest
and prints its key. Here, where the app runs:

    python manage.py load_sign_drafts --manifest-key signage/drafts/manifests/<time>.json            # dry run
    python manage.py load_sign_drafts --manifest-key signage/drafts/manifests/<time>.json --apply [--user email]

Idempotent by slug: a new slug makes a draft; a draft with that slug gets its name, place, quantity and notes from the
manifest and its versions brought up to date by label (new label = new version; same label with other files = the
files are replaced, votes kept; a label no longer in the manifest is kept and reported). Running it twice changes
nothing the second time. A sign already in production, or removed, is never touched. The dry run does the same work
inside a transaction and then rolls it back, so what it prints is exactly what --apply will do.
"""
from __future__ import annotations

import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import S3File
from apps.signage import packages
from apps.signage.models import Sign, SignVersion

FIELDS = {'name': 'name', 'location': 'location', 'quantity': 'quantity', 'notes': 'note', 'kind': 'kind',
          'dash_update': 'dash_update'}


class Command(BaseCommand):
    help = 'Load sign drafts from an uploaded manifest (scripts/s3/upload_sign_drafts.py). Dry run unless --apply.'

    def add_arguments(self, parser):
        parser.add_argument('--manifest-key', required=True, help='The manifest key step 1 printed.')
        parser.add_argument('--apply', action='store_true', help='Keep the changes. Without it, nothing is kept.')
        parser.add_argument('--user', default='', help='Email of the person the drafts and files are credited to.')

    def handle(self, *args, manifest_key, apply, user, **options):
        who = None
        if user:
            who = get_user_model().objects.filter(email__iexact=user).first()
            if not who:
                raise CommandError(f'No user with the email {user}')
        manifest = self.read_manifest(manifest_key)
        self.check_files(manifest)

        counts = {'new': 0, 'updated': 0, 'same': 0, 'skipped': 0, 'versions_added': 0, 'versions_replaced': 0}
        with transaction.atomic():
            for d in manifest['drafts']:
                self.load_one(d, who, counts)
            if not apply:
                transaction.set_rollback(True)

        mode = 'Loaded' if apply else 'Dry run (nothing kept; add --apply to load)'
        self.stdout.write(self.style.SUCCESS(
            f'{mode}: {counts["new"]} new draft(s), {counts["updated"]} updated, {counts["same"]} unchanged, '
            f'{counts["skipped"]} skipped; {counts["versions_added"]} version(s) added, '
            f'{counts["versions_replaced"]} with new files.'
        ))

    # ---- reading ----

    def read_manifest(self, key: str) -> dict:
        try:
            with default_storage.open(key, 'rb') as f:
                manifest = json.loads(f.read().decode('utf-8'))
        except (OSError, FileNotFoundError, ValueError) as exc:
            raise CommandError(f'Cannot read the manifest {key}: {exc}')
        if not isinstance(manifest, dict) or manifest.get('format') != packages.FORMAT:
            raise CommandError(f'{key} is not a sign drafts manifest ({packages.FORMAT}).')
        here = (getattr(settings, 'AWS_LOCATION', '') or '').strip('/') if getattr(settings, 'USE_S3', False) else None
        if here is not None and (manifest.get('location') or '') != here:
            raise CommandError(
                f'The files were uploaded under {manifest.get("location") or "(bucket root)"!r} but this app reads '
                f'{here or "(bucket root)"!r}. Upload again with this app\'s AWS_LOCATION.'
            )
        slugs = [d.get('slug') for d in manifest.get('drafts') or []]
        if len(slugs) != len(set(slugs)) or not all(isinstance(s, str) and packages.SLUG_RE.match(s) for s in slugs):
            raise CommandError('The manifest has a missing, bad or repeated slug.')
        return manifest

    def check_files(self, manifest: dict) -> None:
        missing = [
            f'{d["slug"]}: {v[kind]["key"]}'
            for d in manifest['drafts'] for v in d['versions'] for kind in ('png', 'pdf')
            if not default_storage.exists(v[kind]['key'])
        ]
        if missing:
            for m in missing:
                self.stderr.write(f'  missing in the file store: {m}')
            raise CommandError(f'{len(missing)} file(s) are not in the file store; nothing loaded.')

    # ---- loading ----

    def s3file(self, entry: dict, who) -> S3File:
        row, _ = S3File.objects.get_or_create(key=entry['key'], defaults={
            'filename': entry['filename'][:255], 'size': entry.get('size') or 0,
            'content_type': entry.get('content_type') or '', 'uploaded_by': who,
        })
        return row

    def load_one(self, d: dict, who, counts: dict) -> None:
        slug = d['slug']
        values = {model_field: d.get(key) for key, model_field in FIELDS.items()}
        values['name'] = (values['name'] or slug)[:120]
        values['location'] = (values['location'] or '')[:255]
        values['note'] = values['note'] or ''
        values['kind'] = values['kind'] if values['kind'] in dict(Sign.KIND_CHOICES) else Sign.KIND_SIGN
        values['quantity'] = values['quantity'] if isinstance(values['quantity'], int) else 1

        sign = Sign.objects.filter(slug=slug).first()
        if sign and (sign.stage != Sign.STAGE_DRAFT or not sign.is_active):
            why = 'removed' if not sign.is_active else 'in production'
            self.stdout.write(f'SKIP  {slug}: {why} (#{sign.id}); not touched')
            counts['skipped'] += 1
            return
        lines = []
        if not sign:
            sign = Sign.objects.create(slug=slug, stage=Sign.STAGE_DRAFT, created_by=who, **values)
            head = f'NEW   {slug}: draft #{sign.id} {values["name"]!r}'
            counts['new'] += 1
            is_new = changed = True
        else:
            diff = [f for f, v in values.items() if getattr(sign, f) != v]
            for f in diff:
                setattr(sign, f, values[f])
            if diff:
                sign.save(update_fields=diff + ['updated_at'])
                lines.append(f'        changed: {", ".join(diff)}')
            head = f'{slug}: draft #{sign.id} {sign.name!r}'
            is_new, changed = False, bool(diff)

        have = {v.label.lower(): v for v in sign.versions.all()}
        listed = set()
        for position, v in enumerate(d['versions'], start=1):
            label = str(v['label'])[:120]
            listed.add(label.lower())
            pdf, png = self.s3file(v['pdf'], who), self.s3file(v['png'], who)
            version = have.get(label.lower())
            if not version:
                SignVersion.objects.create(
                    sign=sign, label=label, pdf=pdf, preview=png, position=position, created_by=who,
                )
                lines.append(f'        + {label}')
                counts['versions_added'] += 1
                changed = True
                continue
            update = {}
            if version.pdf_id != pdf.id:
                update['pdf'] = pdf
            if version.preview_id != png.id:
                update['preview'] = png
            if version.position != position:
                update['position'] = position
            if version.label != label:
                update['label'] = label
            if update:
                for f, val in update.items():
                    setattr(version, f, val)
                version.save(update_fields=list(update))
                changed = True
                if 'pdf' in update or 'preview' in update:
                    lines.append(f'        ~ {label}: new files (votes kept)')
                    counts['versions_replaced'] += 1
        for label, version in have.items():
            if label not in listed:
                lines.append(f'        ! {version.label}: not in the manifest, kept')

        if not is_new:
            counts['updated' if changed else 'same'] += 1
            head = ('UPD   ' if changed else 'SAME  ') + head
        self.stdout.write(head)
        for line in lines:
            self.stdout.write(line)
