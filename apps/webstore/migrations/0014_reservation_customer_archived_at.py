from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0013_archive_online_sales'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservation',
            name='customer_archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
