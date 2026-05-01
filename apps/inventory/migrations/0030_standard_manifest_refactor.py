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


ADD_JSON_AND_RENAME_SQL = """
ALTER TABLE inventory_manifestrow
  ADD COLUMN IF NOT EXISTS identifiers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory_manifestrow
  ADD COLUMN IF NOT EXISTS taxonomy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory_preprocessingrow
  ADD COLUMN IF NOT EXISTS identifiers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory_preprocessingrow
  ADD COLUMN IF NOT EXISTS taxonomy jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_manifestrow' AND column_name = 'retail_value'
  ) THEN
    ALTER TABLE inventory_manifestrow RENAME COLUMN retail_value TO unit_retail;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_preprocessingrow' AND column_name = 'retail_value'
  ) THEN
    ALTER TABLE inventory_preprocessingrow RENAME COLUMN retail_value TO unit_retail;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_item' AND column_name = 'retail_value'
  ) THEN
    ALTER TABLE inventory_item RENAME COLUMN retail_value TO unit_retail;
  END IF;
END $$;
"""

ADD_SEARCH_TAGS_TMP_SQL = """
ALTER TABLE inventory_manifestrow
  ADD COLUMN IF NOT EXISTS search_tags_tmp jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE inventory_preprocessingrow
  ADD COLUMN IF NOT EXISTS search_tags_tmp jsonb NOT NULL DEFAULT '[]'::jsonb;
"""

DROP_LEGACY_TEXT_SEARCH_TAGS_SQL = """
ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS search_tags;
ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS search_tags;
"""

RENAME_SEARCH_TAGS_TMP_SQL = """
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_manifestrow' AND column_name = 'search_tags_tmp'
  ) THEN
    ALTER TABLE inventory_manifestrow RENAME COLUMN search_tags_tmp TO search_tags;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_preprocessingrow' AND column_name = 'search_tags_tmp'
  ) THEN
    ALTER TABLE inventory_preprocessingrow RENAME COLUMN search_tags_tmp TO search_tags;
  END IF;
END $$;
"""

DROP_LEGACY_FLAT_SQL = """
ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS upc CASCADE;
ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS vendor_item_number CASCADE;
ALTER TABLE inventory_manifestrow DROP COLUMN IF EXISTS category CASCADE;
ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS upc CASCADE;
ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS vendor_item_number CASCADE;
ALTER TABLE inventory_preprocessingrow DROP COLUMN IF EXISTS category CASCADE;
ALTER TABLE inventory_item DROP COLUMN IF EXISTS category CASCADE;
"""

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS inv_mr_ident_gin ON inventory_manifestrow USING gin (identifiers);
CREATE INDEX IF NOT EXISTS inv_mr_taxonomy_gin ON inventory_manifestrow USING gin (taxonomy);
CREATE INDEX IF NOT EXISTS inv_pr_ident_gin ON inventory_preprocessingrow USING gin (identifiers);
CREATE INDEX IF NOT EXISTS inv_pr_taxonomy_gin ON inventory_preprocessingrow USING gin (taxonomy);
CREATE INDEX IF NOT EXISTS inv_mr_ident_upc ON inventory_manifestrow ((identifiers->>'upc'));
CREATE INDEX IF NOT EXISTS inv_mr_ident_asin ON inventory_manifestrow ((identifiers->>'asin'));
"""

DROP_INDEX_SQL = """
DROP INDEX IF EXISTS inv_mr_ident_gin;
DROP INDEX IF EXISTS inv_mr_taxonomy_gin;
DROP INDEX IF EXISTS inv_pr_ident_gin;
DROP INDEX IF EXISTS inv_pr_taxonomy_gin;
DROP INDEX IF EXISTS inv_mr_ident_upc;
DROP INDEX IF EXISTS inv_mr_ident_asin;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0029_describe_your_change'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(ADD_JSON_AND_RENAME_SQL, migrations.RunSQL.noop),
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
                migrations.RunSQL(ADD_SEARCH_TAGS_TMP_SQL, migrations.RunSQL.noop),
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
                migrations.RunSQL(DROP_LEGACY_TEXT_SEARCH_TAGS_SQL, migrations.RunSQL.noop),
                migrations.RunSQL(RENAME_SEARCH_TAGS_TMP_SQL, migrations.RunSQL.noop),
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
                migrations.RunSQL(DROP_LEGACY_FLAT_SQL, migrations.RunSQL.noop),
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
                migrations.RunSQL(INDEX_SQL, DROP_INDEX_SQL),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name='manifestrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['identifiers'],
                        name='inv_mr_ident_gin',
                    ),
                ),
                migrations.AddIndex(
                    model_name='manifestrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['taxonomy'],
                        name='inv_mr_taxonomy_gin',
                    ),
                ),
                migrations.AddIndex(
                    model_name='preprocessingrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['identifiers'],
                        name='inv_pr_ident_gin',
                    ),
                ),
                migrations.AddIndex(
                    model_name='preprocessingrow',
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=['taxonomy'],
                        name='inv_pr_taxonomy_gin',
                    ),
                ),
            ],
        ),
    ]
