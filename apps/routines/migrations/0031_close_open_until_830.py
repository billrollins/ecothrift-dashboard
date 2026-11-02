from datetime import time

from django.db import migrations


# The closing checklist stays open until 8:30 PM (Carrie, 2026-11-02): two hours after the Close shift ends at 6:30.
# Before this it showed Missed at the shift end. Only the closing checklist changes; the owner can move it in
# Routine Control.
def forwards(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    Routine.objects.filter(system_key='retail.close').update(
        expire_rule='after', expire_count=2, expire_unit='hours', expire_from_time=time(18, 30),
    )


def backwards(apps, schema_editor):
    Routine = apps.get_model('routines', 'Routine')
    Routine.objects.filter(system_key='retail.close').update(
        expire_rule='end_of_day', expire_count=1, expire_unit='hours', expire_from_time=None,
    )


class Migration(migrations.Migration):
    dependencies = [('routines', '0030_social_post_routine')]

    operations = [migrations.RunPython(forwards, backwards)]
