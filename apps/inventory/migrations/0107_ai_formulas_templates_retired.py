"""Manifest templates retired; the AI's formulas live on the order (intake_updates Phase 5).

Two steps, so the old code never breaks during a deploy (the release phase runs this while the old dynos still serve):
- this migration removes the template fields and ``CSVTemplate`` from Django only, and lets the old columns take NULL,
  so new code that no longer writes them can still insert orders;
- the next release's migration drops the columns and the table.
"""
from django.db import migrations, models

NULLABLE = [
    'ALTER TABLE inventory_purchaseorder ALTER COLUMN template_name_cache DROP NOT NULL',
    'ALTER TABLE inventory_purchaseorder ALTER COLUMN template_header_signature_cache DROP NOT NULL',
    'ALTER TABLE inventory_purchaseorder ALTER COLUMN template_column_mappings_cache DROP NOT NULL',
]


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0106_bulk_price_change_and_shelf_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseorder',
            name='ai_formulas',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name='purchaseorder', name='template'),
                migrations.RemoveField(model_name='purchaseorder', name='template_name_cache'),
                migrations.RemoveField(model_name='purchaseorder', name='template_header_signature_cache'),
                migrations.RemoveField(model_name='purchaseorder', name='template_column_mappings_cache'),
                migrations.DeleteModel(name='CSVTemplate'),
            ],
            database_operations=[
                migrations.RunSQL(sql=NULLABLE, reverse_sql=migrations.RunSQL.noop),
            ],
        ),
    ]
