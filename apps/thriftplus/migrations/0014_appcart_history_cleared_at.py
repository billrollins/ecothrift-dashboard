from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0013_seed_price_first'),
    ]

    operations = [
        migrations.AddField(
            model_name='appcart',
            name='history_cleared_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
