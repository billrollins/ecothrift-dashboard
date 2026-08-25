from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0094_item_note_backfill'),
    ]

    operations = [
        migrations.AddField(
            model_name='restorationpartsorderline',
            name='review_note',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='restorationpartsorderline',
            name='review_result',
            field=models.CharField(blank=True, default='', max_length=16),
        ),
    ]
