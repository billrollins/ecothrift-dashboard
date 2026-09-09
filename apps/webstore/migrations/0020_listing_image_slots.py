from django.db import migrations, models
import django.db.models.deletion


def display_to_main_variant(apps, schema_editor):
    WebListingImage = apps.get_model('webstore', 'WebListingImage')
    WebListingImageVariant = apps.get_model('webstore', 'WebListingImageVariant')
    for im in WebListingImage.objects.exclude(display_file_id=None).iterator():
        crop = im.display_crop if isinstance(im.display_crop, dict) else {}
        WebListingImageVariant.objects.create(
            image=im,
            slot='main',
            s3_file_id=im.display_file_id,
            crop={
                'x': crop.get('x', 0),
                'y': crop.get('y', 0),
                'w': crop.get('w', 0),
                'h': crop.get('h', 0),
                'derived': False,
            },
            width=1200,
            height=900,
        )


def main_variant_to_display(apps, schema_editor):
    WebListingImage = apps.get_model('webstore', 'WebListingImage')
    WebListingImageVariant = apps.get_model('webstore', 'WebListingImageVariant')
    for variant in WebListingImageVariant.objects.filter(slot='main').iterator():
        WebListingImage.objects.filter(pk=variant.image_id).update(
            display_file_id=variant.s3_file_id,
            display_crop=variant.crop,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_enhancement_request'),
        ('webstore', '0019_listing_image_variants'),
    ]

    operations = [
        migrations.CreateModel(
            name='WebListingImageVariant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slot', models.CharField(choices=[('main', 'Main'), ('grid', 'Grid'), ('thumb', 'Thumb')], max_length=12)),
                ('crop', models.JSONField(blank=True, null=True)),
                ('width', models.PositiveIntegerField(default=0)),
                ('height', models.PositiveIntegerField(default=0)),
                ('image', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='variants',
                    to='webstore.weblistingimage',
                )),
                ('s3_file', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='web_listing_image_variants',
                    to='core.s3file',
                )),
            ],
            options={
                'ordering': ['image_id', 'slot'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='weblistingimagevariant',
            unique_together={('image', 'slot')},
        ),
        migrations.RunPython(display_to_main_variant, main_variant_to_display),
        migrations.RemoveField(
            model_name='weblistingimage',
            name='display_crop',
        ),
        migrations.RemoveField(
            model_name='weblistingimage',
            name='display_file',
        ),
    ]
