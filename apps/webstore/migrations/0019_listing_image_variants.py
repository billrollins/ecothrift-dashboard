from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_enhancement_request'),
        ('webstore', '0018_announcement_hours_override'),
    ]

    operations = [
        migrations.AddField(
            model_name='weblistingimage',
            name='display_file',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='web_listing_display_images',
                to='core.s3file',
            ),
        ),
        migrations.AddField(
            model_name='weblistingimage',
            name='display_crop',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='weblistingimage',
            name='width',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='weblistingimage',
            name='height',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
