from django.core.management.base import BaseCommand

from apps.hiring.interviews import send_due_reminders


class Command(BaseCommand):
    help = "Email the day-before reminder for interviews in the next 24 hours (each once). Also runs in sync_ms_mailbox."

    def handle(self, *args, **options):
        from apps.hiring.outreach import send_due_email_reminders

        self.stdout.write(f'Interview reminders sent: {send_due_reminders()}')
        self.stdout.write(f'Book-your-interview reminders sent: {send_due_email_reminders()}')
