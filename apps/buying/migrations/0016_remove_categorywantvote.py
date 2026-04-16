# Generated manually — remove staff category want-vote feature.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('buying', '0015_manifest_pull_log_and_auction_manifest_pulled_at'),
    ]

    operations = [
        migrations.DeleteModel(name='CategoryWantVote'),
    ]
