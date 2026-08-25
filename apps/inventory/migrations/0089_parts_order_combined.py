from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0088_restore_parts_orders'),
    ]

    operations = [
        migrations.AddField(
            model_name='restorationpartsorder',
            name='combined',
            field=models.BooleanField(default=False),
        ),
    ]
