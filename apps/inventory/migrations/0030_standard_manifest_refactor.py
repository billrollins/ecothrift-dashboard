"""Standard manifest refactor (Postgres idempotent DDL + Django state)."""

import django.contrib.postgres.indexes
from django.db import migrations, models


def forwards_copy_flat_to_buckets(apps, schema_editor):
    ManifestRow = apps.get_model('inventory', 'ManifestRow')
    PreprocessingRow = apps.get_model('inventory', 'PreprocessingRow')

    def merge_ids(existing, upc=None, vin=None):
        d = dict(existing or {})
        if upc:
            u = str(upc).strip()
            if u:
                d['upc'] = u
        if vin:
            v = str(vin).strip()
            if v:
                if v.startswith('B0') and len(v) >= 10:
                    d.setdefault('asin', v)
                else:
                    d.setdefault('sku', v)
        return d

    def merge_tax(cat, existing_tx):
        tx = dict(existing_tx or {})
        if cat:
            c = str(cat).strip()
            if c:
                tx['category'] = c
        return tx

    for r in ManifestRow.objects.all().iterator():
        r.identifiers = merge_ids(r.identifiers, getattr(r, 'upc', None), getattr(r, 'vendor_item_number', None))
        r.taxonomy = merge_tax(getattr(r, 'category', None), r.taxonomy)
        r.save(update_fields=['identifiers', 'taxonomy'])

    for r in PreprocessingRow.objects.all().iterator():
        r.identifiers = merge_ids(r.identifiers, getattr(r, 'upc', None), getattr(r, 'vendor_item_number', None))
        r.taxonomy = merge_tax(getattr(r, 'category', None), r.taxonomy)
        r.save(update_fields=['identifiers', 'taxonomy'])


def forwards_search_tags_to_json(apps, schema_editor):
    from django.utils.text import slugify as dj_slugify

    ManifestRow = apps.get_model('inventory', 'ManifestRow')
    PreprocessingRow = apps.get_model('inventory', 'PreprocessingRow')

    def text_to_slug_list(txt):
        text = txt or ''
        if not isinstance(text, str):
            text = str(text)
        raw = []
        for part in text.split(','):
            p = part.strip().lower()
            if not p:
                continue
            slug = dj_slugify(p.replace('_', '-'))
            if slug and slug not in raw:
                raw.append(slug)
        return raw

    for Model in (ManifestRow, PreprocessingRow):
        for row in Model.objects.iterator(chunk_size=500):
            legacy = getattr(row, 'search_tags', None)
            if legacy is None:
                row.search_tags_tmp = []
                row.save(update_fields=['search_tags_tmp'])
                continue
            if isinstance(legacy, list):
                row.search_tags_tmp = legacy
                row.save(update_fields=['search_tags_tmp'])
                continue
            row.search_tags_tmp = text_to_slug_list(legacy)
            row.save(update_fields=['search_tags_tmp'])


def delete_seed_templates(apps, schema_editor):
    CSVTemplate = apps.get_model('inventory', 'CSVTemplate')
    CSVTemplate.objects.filter(pk__in=(1, 2, 3)).delete()


def noop_reverse(apps, schema_editor):
    pass


ADD_JSON_MR_IDENTIFIERS_SQL = """
ALTER TABLE inventory_manifestrow
  ADD COLUMN IF NOT EXISTS identifiers jsonb NOT NULL DEFAULT '{}'::jsonb;
"""

ADD_JSON_MR_TAX_SQL = """
ALTER TABLE inventory_manifestrow
  ADD COLUMN IF NOT EXISTS taxonomy jsonb NOT NULL DEFAULT '{}'::jsonb;
"""

ADD_JSON_PR_IDENTIFIERS_SQL = """
ALTER TABLE inventory_preprocessingrow
  ADD COLUMN IF NOT EXISTS identifiers jsonb NOT NULL DEFAULT '{}'::jsonb;
"""

ADD_JSON_PR_TAX_SQL = """
ALTER TABLE inventory_preprocessingrow
  ADD COLUMN IF NOT EXISTS taxonomy jsonb NOT NULL DEFAULT '{}'::jsonb;
"""

# Separate RunSQL chunks: batched DDL + rename hits "cannot ALTER TABLE … pending
# trigger events" on Postgres/Heroku.
RENAME_MR_UNIT_RETAIL_SQL = """
DO $$
DECLARE
  sch text;
BEGIN
  SELECT c.table_schema INTO sch FROM information_schema.columns c
  WHERE c.table_name = 'inventory_manifestrow' AND c.column_name = 'retail_value'
  ORDER BY CASE c.table_schema WHEN 'ecothrift' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  IF sch IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN retail_value TO unit_retail', sch, 'inventory_manifestrow');
  END IF;
END $$;
"""

RENAME_PR_UNIT_RETAIL_SQL = """
DO $$
DECLARE
  sch text;
BEGIN
  SELECT c.table_schema INTO sch FROM information_schema.columns c
  WHERE c.table_name = 'inventory_preprocessingrow' AND c.column_name = 'retail_value'
  ORDER BY CASE c.table_schema WHEN 'ecothrift' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  IF sch IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN retail_value TO unit_retail', sch, 'inventory_preprocessingrow');
  END IF;
END $$;
"""

RENAME_ITM_UNIT_RETAIL_SQL = """
DO $$
DECLARE
  sch text;
BEGIN
  SELECT c.table_schema INTO sch FROM information_schema.columns c
  WHERE c.table_name = 'inventory_item' AND c.column_name = 'retail_value'
  ORDER BY CASE c.table_schema WHEN 'ecothrift' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  IF sch IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN retail_value TO unit_retail', sch, 'inventory_item');
  END IF;
END $$;
"""

ADD_MR_SEARCH_TAGS_TMP_SQL = """
ALTER TABLE inventory_manifestrow
  ADD COLUMN IF NOT EXISTS search_tags_tmp jsonb NOT NULL DEFAULT '[]'::jsonb;
"""

ADD_PR_SEARCH_TAGS_TMP_SQL = """
ALTER TABLE inventory_preprocessingrow
  ADD COLUMN IF NOT EXISTS search_tags_tmp jsonb NOT NULL DEFAULT '[]'::jsonb;
"""

DROP_MR_LEGACY_SEARCH_TAGS_SQL = """
ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS search_tags;
"""

DROP_PR_LEGACY_SEARCH_TAGS_SQL = """
ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS search_tags;
"""

RENAME_MR_SEARCH_TAGS_TMP_SQL = """
DO $$
DECLARE
  sch text;
BEGIN
  SELECT c.table_schema INTO sch FROM information_schema.columns c
  WHERE c.table_name = 'inventory_manifestrow' AND c.column_name = 'search_tags_tmp'
  ORDER BY CASE c.table_schema WHEN 'ecothrift' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  IF sch IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN search_tags_tmp TO search_tags', sch, 'inventory_manifestrow');
  END IF;
END $$;
"""

RENAME_PR_SEARCH_TAGS_TMP_SQL = """
DO $$
DECLARE
  sch text;
BEGIN
  SELECT c.table_schema INTO sch FROM information_schema.columns c
  WHERE c.table_name = 'inventory_preprocessingrow' AND c.column_name = 'search_tags_tmp'
  ORDER BY CASE c.table_schema WHEN 'ecothrift' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  IF sch IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN search_tags_tmp TO search_tags', sch, 'inventory_preprocessingrow');
  END IF;
END $$;
"""

DROP_MR_UPC_SQL = """ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS upc CASCADE;"""
DROP_MR_VENDOR_ITEM_SQL = (
    """ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS vendor_item_number CASCADE;"""
)
DROP_MR_CAT_SQL = """ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS category CASCADE;"""
DROP_PR_UPC_SQL = """ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS upc CASCADE;"""
DROP_PR_VENDOR_ITEM_SQL = """ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS vendor_item_number CASCADE;"""
DROP_PR_CAT_SQL = """ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS category CASCADE;"""
DROP_ITM_CAT_SQL = """ALTER TABLE inventory_item DROP COLUMN IF EXISTS category CASCADE;"""

# One CREATE INDEX statement per migration op (migration.atomic=False) — avoids
# "cannot ALTER TABLE … pending trigger events" when GIN batches with other DDL.

INV_MR_IDENT_GIN_SQL = """CREATE INDEX IF NOT EXISTS inv_mr_ident_gin ON inventory_manifestrow USING gin (identifiers);"""
INV_MR_IDENT_GIN_DROP = """DROP INDEX IF EXISTS inv_mr_ident_gin;"""
INV_MR_TAX_GIN_SQL = """CREATE INDEX IF NOT EXISTS inv_mr_taxonomy_gin ON inventory_manifestrow USING gin (taxonomy);"""
INV_MR_TAX_GIN_DROP = """DROP INDEX IF EXISTS inv_mr_taxonomy_gin;"""
INV_PR_IDENT_GIN_SQL = """CREATE INDEX IF NOT EXISTS inv_pr_ident_gin ON inventory_preprocessingrow USING gin (identifiers);"""
INV_PR_IDENT_GIN_DROP = """DROP INDEX IF EXISTS inv_pr_ident_gin;"""
INV_PR_TAX_GIN_SQL = """CREATE INDEX IF NOT EXISTS inv_pr_taxonomy_gin ON inventory_preprocessingrow USING gin (taxonomy);"""
INV_PR_TAX_GIN_DROP = """DROP INDEX IF EXISTS inv_pr_taxonomy_gin;"""
INV_MR_UPC_SQL = """CREATE INDEX IF NOT EXISTS inv_mr_ident_upc ON inventory_manifestrow ((identifiers->>'upc'));"""
INV_MR_UPC_DROP = """DROP INDEX IF EXISTS inv_mr_ident_upc;"""
INV_MR_ASIN_SQL = """CREATE INDEX IF NOT EXISTS inv_mr_ident_asin ON inventory_manifestrow ((identifiers->>'asin'));"""
INV_MR_ASIN_DROP = """DROP INDEX IF EXISTS inv_mr_ident_asin;"""


class Migration(migrations.Migration):

    # PG can raise "pending trigger events" mixing ADD COLUMN + RENAME within one txn.
    atomic = False

    dependencies = [
        ('inventory', '0029_describe_your_change'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(ADD_JSON_MR_IDENTIFIERS_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(ADD_JSON_MR_TAX_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(ADD_JSON_PR_IDENTIFIERS_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(ADD_JSON_PR_TAX_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(RENAME_MR_UNIT_RETAIL_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(RENAME_PR_UNIT_RETAIL_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(RENAME_ITM_UNIT_RETAIL_SQL, migrations.RunSQL.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='manifestrow',
                    name='identifiers',
                    field=models.JSONField(blank=True, default=dict),
                ),
                migrations.AddField(
                    model_name='manifestrow',
                    name='taxonomy',
                    field=models.JSONField(blank=True, default=dict),
                ),
                migrations.AddField(
                    model_name='preprocessingrow',
                    name='identifiers',
                    field=models.JSONField(blank=True, default=dict),
                ),
                migrations.AddField(
                    model_name='preprocessingrow',
                    name='taxonomy',
                    field=models.JSONField(blank=True, default=dict),
                ),
                migrations.RenameField(
                    model_name='manifestrow',
                    old_name='retail_value',
                    new_name='unit_retail',
                ),
                migrations.RenameField(
                    model_name='preprocessingrow',
                    old_name='retail_value',
                    new_name='unit_retail',
                ),
                migrations.RenameField(
                    model_name='item',
                    old_name='retail_value',
                    new_name='unit_retail',
                ),
            ],
        ),
        migrations.RunPython(forwards_copy_flat_to_buckets, noop_reverse),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(ADD_MR_SEARCH_TAGS_TMP_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(ADD_PR_SEARCH_TAGS_TMP_SQL, migrations.RunSQL.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='manifestrow',
                    name='search_tags_tmp',
                    field=models.JSONField(blank=True, default=list),
                ),
                migrations.AddField(
                    model_name='preprocessingrow',
                    name='search_tags_tmp',
                    field=models.JSONField(blank=True, default=list),
                ),
            ],
        ),
        migrations.RunPython(forwards_search_tags_to_json, noop_reverse),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(DROP_MR_LEGACY_SEARCH_TAGS_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_PR_LEGACY_SEARCH_TAGS_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(RENAME_MR_SEARCH_TAGS_TMP_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(RENAME_PR_SEARCH_TAGS_TMP_SQL, migrations.RunSQL.noop),
            ],
            state_operations=[
                migrations.RemoveField(model_name='manifestrow', name='search_tags'),
                migrations.RemoveField(model_name='preprocessingrow', name='search_tags'),
                migrations.RenameField(
                    model_name='manifestrow',
                    old_name='search_tags_tmp',
                    new_name='search_tags',
                ),
                migrations.RenameField(
                    model_name='preprocessingrow',
                    old_name='search_tags_tmp',
                    new_name='search_tags',
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(DROP_MR_UPC_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_MR_VENDOR_ITEM_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_MR_CAT_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_PR_UPC_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_PR_VENDOR_ITEM_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_PR_CAT_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(DROP_ITM_CAT_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(
                    'DROP INDEX IF EXISTS inventory_i_status_a1a330_idx;',
                    migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.RemoveField(model_name='manifestrow', name='upc'),
                migrations.RemoveField(model_name='manifestrow', name='vendor_item_number'),
                migrations.RemoveField(model_name='manifestrow', name='category'),
                migrations.RemoveField(model_name='preprocessingrow', name='upc'),
                migrations.RemoveField(model_name='preprocessingrow', name='vendor_item_number'),
                migrations.RemoveField(model_name='preprocessingrow', name='category'),
                migrations.RemoveIndex(
                    model_name='item',
                    name='inventory_i_status_a1a330_idx',
                ),
                migrations.RemoveField(model_name='item', name='category'),
            ],
        ),
        migrations.RunPython(delete_seed_templates, noop_reverse),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(INV_MR_IDENT_GIN_SQL, INV_MR_IDENT_GIN_DROP),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name='manifestrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['identifiers'],
                        name='inv_mr_ident_gin',
                    ),
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(INV_MR_TAX_GIN_SQL, INV_MR_TAX_GIN_DROP),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name='manifestrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['taxonomy'],
                        name='inv_mr_taxonomy_gin',
                    ),
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(INV_PR_IDENT_GIN_SQL, INV_PR_IDENT_GIN_DROP),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name='preprocessingrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['identifiers'],
                        name='inv_pr_ident_gin',
                    ),
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(INV_PR_TAX_GIN_SQL, INV_PR_TAX_GIN_DROP),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name='preprocessingrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['taxonomy'],
                        name='inv_pr_taxonomy_gin',
                    ),
                ),
            ],
        ),
        migrations.RunSQL(INV_MR_UPC_SQL, INV_MR_UPC_DROP),
        migrations.RunSQL(INV_MR_ASIN_SQL, INV_MR_ASIN_DROP),
    ]
