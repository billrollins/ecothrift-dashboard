from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('thriftplus', '0011_person_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='is_practice',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
