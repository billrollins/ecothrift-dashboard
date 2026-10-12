from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0016_outreach'),
    ]

    operations = [
        migrations.AlterField(
            model_name='hiringaijob',
            name='kind',
            field=models.CharField(choices=[('careers', 'Whole careers file'), ('job', 'One role'), ('email', 'One email'),
                                            ('questions', "One role's interview questions")], max_length=10),
        ),
    ]
