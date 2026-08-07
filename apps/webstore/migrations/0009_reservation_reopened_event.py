# Allow a released hold to be reopened: new 'reopened' timeline event kind.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0008_hold_clarity'),
    ]

    operations = [
        migrations.AlterField(
            model_name='reservationevent',
            name='kind',
            field=models.CharField(
                choices=[
                    ('requested', 'Requested'),
                    ('verified', 'Email verified'),
                    ('confirmed', 'Confirmed'),
                    ('staged', 'Staged'),
                    ('extended', 'Extended'),
                    ('completed', 'Completed'),
                    ('declined', 'Declined'),
                    ('expired', 'Expired'),
                    ('cancelled', 'Cancelled'),
                    ('reopened', 'Reopened'),
                    ('note', 'Staff note'),
                ],
                max_length=24,
            ),
        ),
    ]
