from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0017_ai_questions_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='application',
            name='booking_code',
            field=models.CharField(blank=True, db_index=True, default='', max_length=12),
        ),
    ]
