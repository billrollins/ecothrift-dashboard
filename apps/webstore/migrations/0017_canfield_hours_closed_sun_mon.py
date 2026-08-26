"""Canfield store hours: closed Sunday and Monday."""

from django.db import migrations


def update_hours(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='online_sales.hours').first()
    if row is None:
        return
    value = dict(row.value) if isinstance(row.value, dict) else {}
    value['closed_weekdays'] = [0, 6]
    value.setdefault('timezone', 'America/Chicago')
    value.setdefault('open', '09:00')
    value.setdefault('close', '18:00')
    row.value = value
    row.description = 'Online Sales hold expiry hours (Canfield Tue–Sat 9–6, closed Sun & Mon).'
    row.save(update_fields=['value', 'description'])


def revert_hours(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='online_sales.hours').first()
    if row is None:
        return
    value = dict(row.value) if isinstance(row.value, dict) else {}
    value['closed_weekdays'] = [6]
    row.value = value
    row.description = 'Online Sales hold expiry hours (Canfield Mon–Sat 9–6, closed Sunday).'
    row.save(update_fields=['value', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0016_reservation_webstore_re_email_63d1ce_idx'),
        ('core', '0002_enhancement_request'),
    ]

    operations = [
        migrations.RunPython(update_hours, revert_hours),
    ]
