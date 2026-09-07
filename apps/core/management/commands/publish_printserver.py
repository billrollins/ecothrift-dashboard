"""publish_printserver - register a print server release directly via the ORM.

Called by printserver/distribute.py - no HTTP, no credentials.
Safe to re-run: an existing version is updated and marked current.

Usage:
    python manage.py publish_printserver \
        --ps-version 1.2.0 \
        --s3-key print-server/ecothrift-printserver-setup-v1.2.0.exe \
        --filename ecothrift-printserver-setup.exe \
        --size 12345678 \
        --release-notes "Bug fixes and improvements"
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import S3File, PrintServerRelease


class Command(BaseCommand):
    help = "Register a print server release (called by distribute.py)"

    def add_arguments(self, parser):
        parser.add_argument("--ps-version", required=True)
        parser.add_argument("--s3-key", required=True)
        parser.add_argument("--filename", required=True)
        parser.add_argument("--size", type=int, default=0)
        parser.add_argument("--release-notes", default="")

    def handle(self, *args, **options):
        version = options["ps_version"]
        s3_key = options["s3_key"]
        filename = options["filename"]
        size = options["size"]
        release_notes = options["release_notes"]

        with transaction.atomic():
            s3_file, created = S3File.objects.get_or_create(
                key=s3_key,
                defaults={
                    "filename": filename,
                    "size": size,
                    "content_type": "application/octet-stream",
                },
            )
            if not created:
                s3_file.filename = filename
                s3_file.size = size
                s3_file.save()

            PrintServerRelease.objects.update(is_current=False)
            release, rel_created = PrintServerRelease.objects.get_or_create(
                version=version,
                defaults={
                    "s3_file": s3_file,
                    "release_notes": release_notes,
                    "is_current": True,
                },
            )
            if not rel_created:
                release.s3_file = s3_file
                if release_notes:
                    release.release_notes = release_notes
                release.is_current = True
                release.save()

        action = "Published" if rel_created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action}: Print Server v{release.version} (id={release.pk})"
            )
        )
