# Dash Update #108: photo sheets get a contrast setting, editable fact labels, and the list of boxes a person typed.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0132_row_dispute_item'),
    ]

    operations = [
        migrations.AddField(
            model_name='photosheet',
            name='contrast',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='photosheet',
            name='labels',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='photosheet',
            name='typed',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
