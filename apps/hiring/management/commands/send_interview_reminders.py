from django.core.management.base import BaseCommand

from apps.hiring.interviews import send_due_reminders


class Command(BaseCommand):
    help = "Email the day-before reminder for interviews in the next 24 hours (each once). Also runs in sync_ms_mailbox."

    def handle(self, *args, **options):
        self.stdout.write(f'Interview reminders sent: {send_due_reminders()}')
