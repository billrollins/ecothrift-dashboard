from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0074_rename_waiting_to_pending'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='itemhistory',
            index=models.Index(
                fields=['event_type', 'new_value', 'created_at'],
                name='itemhist_dash_on_shelf_idx',
            ),
        ),
    ]
