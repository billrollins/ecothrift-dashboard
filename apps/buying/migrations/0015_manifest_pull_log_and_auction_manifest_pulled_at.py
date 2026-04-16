# Generated manually for ManifestPullLog + Auction.manifest_pulled_at

from django.db import migrations, models
import django.db.models.deletion


def backfill_manifest_pulled_at(apps, schema_editor):
    Auction = apps.get_model('buying', 'Auction')
    ManifestRow = apps.get_model('buying', 'ManifestRow')
    from django.db.models import Max

    for aid in (
        ManifestRow.objects.values_list('auction_id', flat=True)
        .distinct()
        .iterator()
    ):
        latest = ManifestRow.objects.filter(auction_id=aid).aggregate(m=Max('created_at'))['m']
        if latest:
            Auction.objects.filter(pk=aid, manifest_pulled_at__isnull=True).update(
                manifest_pulled_at=latest
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('buying', '0014_categorystats_need_score_1to99_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='auction',
            name='manifest_pulled_at',
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text='When manifest rows were last fetched via API pull or CSV upload (nightly queue skips if set).',
                null=True,
            ),
        ),
        migrations.CreateModel(
            name='ManifestPullLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField()),
                ('completed_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('rows_downloaded', models.PositiveIntegerField(default=0)),
                ('api_calls', models.PositiveIntegerField(default=0)),
                ('duration_seconds', models.FloatField(default=0)),
                ('used_socks5', models.BooleanField(default=False)),
                ('success', models.BooleanField(default=True)),
                ('error_message', models.TextField(blank=True, default='')),
                (
                    'auction',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='manifest_pull_logs',
                        to='buying.auction',
                    ),
                ),
            ],
            options={
                'ordering': ['-completed_at'],
            },
        ),
        migrations.RunPython(backfill_manifest_pulled_at, noop_reverse),
    ]
