from django.db import migrations

SIGN_REF_TYPE = 'signage.sign'


def pins_from_signs(apps, schema_editor):
    """#129: a spot on the map now says To hang or Up. Carry over what each sign said.

    A sign marked Up has every spot up; otherwise its "copies up" count marks that many of its spots up (oldest
    first). Sign.status and Sign.copies_up stay in the table, unused, as the record.
    """
    Sign = apps.get_model('signage', 'Sign')
    MapPin = apps.get_model('floorplan', 'MapPin')
    for sign in Sign.objects.all().only('id', 'status', 'copies_up'):
        pins = MapPin.objects.filter(ref_type=SIGN_REF_TYPE, ref_id=sign.id).order_by('id')
        if sign.status == 'up':
            pins.update(status='up')
            continue
        if sign.copies_up:
            ids = list(pins.values_list('id', flat=True)[: sign.copies_up])
            MapPin.objects.filter(id__in=ids).update(status='up')


class Migration(migrations.Migration):

    dependencies = [
        ('floorplan', '0007_mappin_status'),
        ('signage', '0002_sign_drafts_voting'),
    ]

    operations = [
        migrations.RunPython(pins_from_signs, migrations.RunPython.noop),
    ]
