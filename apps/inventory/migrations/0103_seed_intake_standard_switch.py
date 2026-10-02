from django.db import migrations


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    AppSetting.objects.get_or_create(
        key='product_standard_at_intake',
        defaults={
            'value': False,
            'description': (
                'Intake: write the product standard (title, tag name, brand, category, specs, vector) during AI '
                'cleanup, match lines to products by meaning, and give new products their profile at check-in. '
                'Off until the owner turns it on. true = on, false = off.'
            ),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0102_dedupe_decision'),
        ('core', '0008_approval_request'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
