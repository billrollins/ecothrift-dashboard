# Generated for intake_processing_improvements: ManifestRow spine link.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0052_item_po_status_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='preprocessingrow',
            name='manifest_row',
            field=models.ForeignKey(
                blank=True,
                help_text='Stable standardized manifest line this preprocessing overlay belongs to.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='preprocessing_rows',
                to='inventory.manifestrow',
            ),
        ),
        migrations.AddConstraint(
            model_name='preprocessingrow',
            constraint=models.UniqueConstraint(
                condition=models.Q(manifest_row__isnull=False),
                fields=('manifest_row',),
                name='inventory_preproc_unique_manifest_row',
            ),
        ),
        migrations.AddIndex(
            model_name='preprocessingrow',
            index=models.Index(fields=['manifest_row'], name='inv_pr_manifest_row_idx'),
        ),
    ]
