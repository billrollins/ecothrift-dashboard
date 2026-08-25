from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0085_restorationaction_restorationjob_current_action_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='restorationpartsrequestline',
            name='section',
            field=models.CharField(
                choices=[('parts', 'Parts'), ('supplies', 'Supplies'), ('ffe', 'FFE')],
                db_index=True,
                default='parts',
                max_length=16,
            ),
        ),
    ]
