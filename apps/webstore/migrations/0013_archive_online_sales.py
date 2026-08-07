"""Archive tier for Online Sales: archived_at/archived_by on Reservation and
Conversation.

The HoldConfirmation index rename and confirmed_via choices alter are unrelated
state drift left over from 0012; they ride along because makemigrations emits
them with the next change.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0082_receiving_photo_thumbnails_and_overrides'),
        ('pos', '0025_qualityaudit_updated_at'),
        ('webstore', '0012_hold_confirmation'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='holdconfirmation',
            new_name='webstore_ho_reserva_485b4a_idx',
            old_name='webstore_ho_reserva_7c8a1e_idx',
        ),
        migrations.AddField(
            model_name='conversation',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='conversation',
            name='archived_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='reservation',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='reservation',
            name='archived_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='holdconfirmation',
            name='confirmed_via',
            field=models.CharField(blank=True, choices=[('code', 'Code'), ('link', 'Link')], default='', max_length=8),
        ),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['archived_at', 'state'], name='webstore_co_archive_779b5d_idx'),
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['archived_at', 'status'], name='webstore_re_archive_79af3e_idx'),
        ),
    ]
