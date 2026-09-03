from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_alter_magiclinktoken_purpose'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='language',
            field=models.CharField(
                choices=[('en', 'English'), ('es', 'Spanish')],
                default='en',
                max_length=8,
            ),
        ),
    ]
