"""Settings > AI: check every non-archived model's price on the web (Claude Opus 5.5, high effort)."""
from django.core.management.base import BaseCommand

from apps.core.services import ai_prices


class Command(BaseCommand):
    help = (
        "Check the price per 1M tokens of every text model that is not archived. Models with no price get "
        "the verified one; a price that differs waits for review in Settings > AI. --review saves nothing."
    )

    def add_arguments(self, parser):
        parser.add_argument('--review', action='store_true', help='Save nothing; keep every change for review.')
        parser.add_argument('--by', type=int, default=0, help='Id of the user who asked (the Refresh button).')

    def handle(self, *args, review, by, **options):
        user = None
        if by:
            from django.contrib.auth import get_user_model

            from apps.core.services.ai_usage_log import set_request_user

            user = get_user_model().objects.filter(pk=by).first()
            set_request_user(user)  # the AI call is charged to the person who clicked
        s = ai_prices.run(save_blanks=not review, user=user)
        rows = s.get('results', [])
        count = {v: sum(1 for r in rows if r['verdict'] == v) for v in ('confirmed', 'changed', 'not_verified')}
        self.stdout.write(
            f"{s['status']}: {len(rows)} models, {count['confirmed']} confirmed, {count['changed']} changed, "
            f"{count['not_verified']} could not verify. {s.get('error', '')}"
        )
