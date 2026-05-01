# Generated manually: three-layer PreprocessingRow + drop ManifestRow ai_suggested_*

from django.contrib.postgres.indexes import GinIndex
from django.db import migrations, models


def _merge_title_into_ai_title(apps, schema_editor):
    PreprocessingRow = apps.get_model('inventory', 'PreprocessingRow')
    batch = []
    for row in PreprocessingRow.objects.exclude(title='').filter(ai_title='').iterator(chunk_size=200):
        row.ai_title = str(row.title)[:300]
        batch.append(row)
        if len(batch) >= 200:
            PreprocessingRow.objects.bulk_update(batch, ['ai_title'])
            batch = []
    if batch:
        PreprocessingRow.objects.bulk_update(batch, ['ai_title'])


def _noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0035_seed_bucket_csv_template_amazon_basic'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='preprocessingrow',
            name='inv_pr_ident_gin',
        ),
        migrations.RemoveIndex(
            model_name='preprocessingrow',
            name='inv_pr_taxonomy_gin',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='description',
            new_name='standard_description',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='brand',
            new_name='standard_brand',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='model',
            new_name='standard_model',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='condition',
            new_name='standard_condition',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='notes',
            new_name='standard_notes',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='identifiers',
            new_name='standard_identifiers',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='taxonomy',
            new_name='standard_taxonomy',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='specifications',
            new_name='standard_specifications',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='tracking',
            new_name='standard_tracking',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='search_tags',
            new_name='standard_search_tags',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='ai_suggested_title',
            new_name='ai_title',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='ai_suggested_brand',
            new_name='ai_brand',
        ),
        migrations.RenameField(
            model_name='preprocessingrow',
            old_name='ai_suggested_model',
            new_name='ai_model',
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_condition',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_notes',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_identifiers',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_taxonomy',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_specifications',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_tracking',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='ai_search_tags',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_title',
            field=models.CharField(blank=True, max_length=300, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_brand',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_model',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_condition',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_notes',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_identifiers',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_taxonomy',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_specifications',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_tracking',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='preprocessingrow',
            name='final_search_tags',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.RunPython(_merge_title_into_ai_title, _noop),
        migrations.RemoveField(
            model_name='preprocessingrow',
            name='title',
        ),
        migrations.AddIndex(
            model_name='preprocessingrow',
            index=GinIndex(fields=['standard_identifiers'], name='inv_pr_ident_gin'),
        ),
        migrations.AddIndex(
            model_name='preprocessingrow',
            index=GinIndex(fields=['standard_taxonomy'], name='inv_pr_taxonomy_gin'),
        ),
        migrations.RemoveField(
            model_name='manifestrow',
            name='ai_suggested_title',
        ),
        migrations.RemoveField(
            model_name='manifestrow',
            name='ai_suggested_brand',
        ),
        migrations.RemoveField(
            model_name='manifestrow',
            name='ai_suggested_model',
        ),
    ]
