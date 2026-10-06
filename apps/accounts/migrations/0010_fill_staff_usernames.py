"""Give every staff user a username (T61, Bill 2026-10-06): the first name in lower case, the last initial on a clash.

Active staff first (oldest first), so a switched-off person never takes a working person's plain first name.
Customers get none. Reverse: clears them.
"""
from django.db import migrations
from django.db.models import Q


def fill(apps, schema_editor):
    from apps.accounts.services.usernames import make_username

    User = apps.get_model('accounts', 'User')
    taken = set(User.objects.exclude(username__isnull=True).values_list('username', flat=True))
    staff = (
        User.objects.filter(Q(is_superuser=True) | Q(groups__name__iregex=r'^(admin|manager|employee)$'))
        .filter(username__isnull=True).distinct().order_by('-is_active', 'date_joined', 'pk')
    )
    for user in staff:
        name = make_username(user.first_name, user.last_name, user.email, taken)
        taken.add(name)
        User.objects.filter(pk=user.pk).update(username=name)


def clear(apps, schema_editor):
    apps.get_model('accounts', 'User').objects.update(username=None)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0009_usernames_account_events')]
    operations = [migrations.RunPython(fill, clear)]
