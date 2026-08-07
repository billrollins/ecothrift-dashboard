# Hold clarity: release_reason, staff-note events, wider event notes.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0007_reservation_event'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservation',
            name='release_reason',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
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
                    ('note', 'Staff note'),
                ],
                max_length=24,
            ),
        ),
        migrations.AlterField(
            model_name='reservationevent',
            name='note',
            field=models.TextField(blank=True, default=''),
        ),
    ]
