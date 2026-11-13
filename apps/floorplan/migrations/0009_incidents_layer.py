from django.db import migrations


def seed_incidents_layer(apps, schema_editor):
    """The Incidents layer of the store map (#131): where each incident report happened. Data only: it adds the layer
    and touches no plan, pin or other layer (a floor plan versions change is in flight)."""
    MapLayer = apps.get_model('floorplan', 'MapLayer')
    MapLayer.objects.get_or_create(
        slug='incidents',
        defaults={
            'name': 'Incidents',
            'description': 'Where each incident report happened (HR > Incidents)',
            'color': '#dc2626',
            'ref_type': 'hr.incident',
            'sort_order': 90,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('floorplan', '0008_floorplan_current_periods'),
    ]

    operations = [
        migrations.RunPython(seed_incidents_layer, migrations.RunPython.noop),
    ]
