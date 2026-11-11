from django.db import migrations, models


class Migration(migrations.Migration):
    """Why each returned item came back (Bill 2026-11-10, Dash Update #90): a reason and a short note per returned line."""

    dependencies = [
        ('thriftplus', '0032_price_fix_and_use_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='returnrecord',
            name='reason',
            field=models.CharField(
                blank=True,
                choices=[
                    ('not_working', 'Does not work'),
                    ('damaged', 'Broken or damaged'),
                    ('missing_parts', 'Missing parts'),
                    ('not_as_described', 'Not as described'),
                    ('changed_mind', 'Changed mind'),
                    ('other', 'Other'),
                ],
                db_default='',
                default='',
                help_text='Why this item came back. Blank on returns taken before reasons were asked.',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='returnrecord',
            name='reason_note',
            field=models.CharField(blank=True, db_default='', default='', help_text="The cashier's words about this item.",
                                   max_length=200),
        ),
    ]
