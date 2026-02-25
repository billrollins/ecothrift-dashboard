"""publish_printserver — register a print server release directly via the ORM.

Called by printserver/distribute.py — no HTTP, no credentials.

Usage:
    python manage.py publish_printserver \
        --version 1.2.0 \
        --s3-key print-server/ecothrift-printserver-v1.2.0.exe \
        --filename ecothrift-printserver.exe \
        --size 12345678 \
        --release-notes "Bug fixes and improvements"
"""

from django.core.management.base import BaseCommand, CommandError
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

        if PrintServerRelease.objects.filter(version=version).exists():
            raise CommandError(
                f"Version {version} already exists. "
                "Bump VERSION in printserver/config.py before distributing."
            )

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
            release = PrintServerRelease.objects.create(
                version=version,
                s3_file=s3_file,
                release_notes=release_notes,
                is_current=True,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Published: Print Server v{release.version} (id={release.pk})"
            )
        )
