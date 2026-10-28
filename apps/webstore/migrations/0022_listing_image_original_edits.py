from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('webstore', '0021_index_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='weblistingimage',
            name='original',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='web_listing_image_originals', to='core.s3file',
            ),
        ),
        migrations.AddField(
            model_name='weblistingimage',
            name='edits',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
