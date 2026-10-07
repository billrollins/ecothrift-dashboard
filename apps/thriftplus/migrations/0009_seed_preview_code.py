"""Seed the staff preview code (owner, 2026-10-07): with Thrift+ off, /scan?preview=<code> opens the scanner on a
staff phone. Random; the Super User sees and changes it in Settings -> Store -> Thrift+."""
import secrets
import string

from django.db import migrations


def seed(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    if AppSetting.objects.filter(key='thrift_plus_preview_code').exists():
        return
    alphabet = string.ascii_lowercase + string.digits
    AppSetting.objects.create(
        key='thrift_plus_preview_code', value=''.join(secrets.choice(alphabet) for _ in range(8)),
        description='With Thrift+ off, /scan?preview=<this code> opens the scanner on a staff phone.',
    )


def unseed(apps, schema_editor):
    apps.get_model('core', 'AppSetting').objects.filter(key='thrift_plus_preview_code').delete()


class Migration(migrations.Migration):
    dependencies = [('thriftplus', '0008_member_app'), ('core', '0001_initial')]
    operations = [migrations.RunPython(seed, unseed)]
