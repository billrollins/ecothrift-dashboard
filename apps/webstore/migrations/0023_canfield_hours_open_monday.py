"""Canfield store hours: open Monday again (from 2026-11-02). Sunday stays closed.

Same hours as Tuesday (nothing else changes). Only touches a row that still has the old Sunday + Monday closure
([0, 6]); a row the owner already edited in Admin -> Settings is left alone.
"""

from django.db import migrations


def open_monday(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='online_sales.hours').first()
    if row is None or not isinstance(row.value, dict):
        return
    value = dict(row.value)
    if sorted(value.get('closed_weekdays') or []) != [0, 6]:
        return
    value['closed_weekdays'] = [6]
    row.value = value
    row.description = 'Online Sales hold expiry hours (Canfield Mon-Sat 9-6, closed Sunday).'
    row.save(update_fields=['value', 'description'])


def close_monday(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='online_sales.hours').first()
    if row is None or not isinstance(row.value, dict):
        return
    value = dict(row.value)
    if sorted(value.get('closed_weekdays') or []) != [6]:
        return
    value['closed_weekdays'] = [0, 6]
    row.value = value
    row.description = 'Online Sales hold expiry hours (Canfield Tue-Sat 9-6, closed Sun & Mon).'
    row.save(update_fields=['value', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0022_listing_image_original_edits'),
    ]

    operations = [
        migrations.RunPython(open_monday, close_monday),
    ]
