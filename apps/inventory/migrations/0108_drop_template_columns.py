"""Step two of retiring manifest templates (intake_updates Phase 5): drop the old columns and table.

0107 removed them from Django in the release before this one, so no running code reads or writes them any more.
"""
from django.db import migrations

DROP = [
    'ALTER TABLE inventory_purchaseorder DROP COLUMN IF EXISTS template_id',
    'ALTER TABLE inventory_purchaseorder DROP COLUMN IF EXISTS template_name_cache',
    'ALTER TABLE inventory_purchaseorder DROP COLUMN IF EXISTS template_header_signature_cache',
    'ALTER TABLE inventory_purchaseorder DROP COLUMN IF EXISTS template_column_mappings_cache',
    'DROP TABLE IF EXISTS inventory_csvtemplate',
]


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0107_ai_formulas_templates_retired'),
    ]

    operations = [
        migrations.RunSQL(sql=DROP, reverse_sql=migrations.RunSQL.noop),
    ]
