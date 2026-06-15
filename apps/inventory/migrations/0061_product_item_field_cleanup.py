import logging
import re

import django.db.models.deletion
from django.contrib.postgres.indexes import GinIndex
from django.db import migrations, models
from django.utils import timezone


logger = logging.getLogger(__name__)
GENERIC_CATEGORY = 'Mixed lots & uncategorized'


def _norm_identifier_key(key):
    text = str(key or '').strip().lower().replace('-', '_')
    text = '_'.join(text.split())
    aliases = {
        'barcode': 'upc',
        'upc/ean': 'upc',
        'vendor_item_number': 'sku',
        'vendor item number': 'sku',
        'item #': 'item_number',
        'item number': 'item_number',
        'part number': 'mpn',
        'manufacturer part number': 'mpn',
        'lot id': 'lot_id',
        'pallet id': 'pallet_id',
    }
    return aliases.get(text, text)


def _norm_identifier_value(key, value):
    text = str(value or '').strip()
    if _norm_identifier_key(key) in {'upc', 'ean', 'gtin'}:
        digits = ''.join(ch for ch in text if ch.isdigit())
        return digits or text
    return text


def _merge_identifiers(*values):
    merged = {}
    for value in values:
        if not isinstance(value, dict):
            continue
        for raw_key, raw_value in value.items():
            key = _norm_identifier_key(raw_key)
            text = _norm_identifier_value(key, raw_value)
            if key and text and key not in merged:
                merged[key] = text
    return merged


def _product_upc(product):
    identifiers = product.identifiers if isinstance(product.identifiers, dict) else {}
    upc = identifiers.get('upc')
    return _norm_identifier_value('upc', upc)


def forwards(apps, schema_editor):
    Product = apps.get_model('inventory', 'Product')
    Item = apps.get_model('inventory', 'Item')
    Category = apps.get_model('inventory', 'Category')

    category_ref, _ = Category.objects.get_or_create(name=GENERIC_CATEGORY)
    counts = {
        'products_normalized': 0,
        'upcs_migrated': 0,
        'null_items_exact_identifier': 0,
        'null_items_exact_identity': 0,
        'null_items_generic_identifier': 0,
        'null_items_generic': 0,
        'rough_products_created': 0,
    }

    def next_product_numbers(count):
        if count <= 0:
            return []
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(MAX(SUBSTRING(product_number FROM 5)::integer), 0)
                FROM inventory_product
                WHERE product_number ~ '^PRD-[0-9]+$'
                """
            )
            start = cursor.fetchone()[0] or 0
        return [f'PRD-{number:05d}' for number in range(start + 1, start + count + 1)]

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE inventory_product
            SET
                identifiers = COALESCE(identifiers, '{}'::jsonb) || jsonb_build_object(
                    'upc',
                    CASE
                        WHEN regexp_replace(btrim(upc), '[^0-9]', '', 'g') != ''
                        THEN regexp_replace(btrim(upc), '[^0-9]', '', 'g')
                        ELSE btrim(upc)
                    END
                ),
                updated_at = NOW()
            WHERE btrim(COALESCE(upc, '')) != ''
              AND NOT (COALESCE(identifiers, '{}'::jsonb) ? 'upc')
            """
        )
        counts['upcs_migrated'] = cursor.rowcount

        cursor.execute(
            """
            UPDATE inventory_product
            SET title = 'Generic Product', updated_at = NOW()
            WHERE title IS NULL OR btrim(title) = ''
            """
        )
        normalized_titles = cursor.rowcount

        cursor.execute(
            """
            UPDATE inventory_product
            SET brand = 'Generic', updated_at = NOW()
            WHERE brand IS NULL OR btrim(brand) = ''
            """
        )
        counts['products_normalized'] = normalized_titles + cursor.rowcount

    generic_product, _ = Product.objects.get_or_create(
        title='Generic Product',
        brand='Generic',
        model='',
        category=GENERIC_CATEGORY,
        defaults={
            'category_ref': category_ref,
            'identifiers': {},
            'tags': [],
            'is_active': True,
        },
    )
    generic_changed = []
    if generic_product.category_ref_id is None:
        generic_product.category_ref = category_ref
        generic_changed.append('category_ref')
    if not generic_product.product_number:
        generic_product.product_number = next_product_numbers(1)[0]
        generic_changed.append('product_number')
    if generic_changed:
        generic_product.save(update_fields=[*generic_changed, 'updated_at'])

    def identity_key(title, brand, model, category):
        return (
            str(title or '').strip().lower(),
            str(brand or '').strip().lower(),
            str(model or '').strip().lower(),
            str(category or '').strip().lower(),
        )

    product_by_identity = {}
    for product_id, title, brand, model, category in Product.objects.values_list(
        'id',
        'title',
        'brand',
        'model',
        'category',
    ).iterator():
        key = identity_key(title, brand, model, category)
        product_by_identity.setdefault(key, product_id)

    null_item_rows = list(
        Item.objects.filter(product_id__isnull=True)
        .order_by('id')
        .values_list('id', 'title', 'brand')
    )
    missing_keys = []
    seen_missing_keys = set()
    for _item_id, raw_title, raw_brand in null_item_rows:
        title = str(raw_title or '').strip()
        if not title:
            continue
        brand = str(raw_brand or '').strip() or 'Generic'
        key = identity_key(title[:300], brand[:200], '', GENERIC_CATEGORY)
        if key in product_by_identity or key in seen_missing_keys:
            continue
        missing_keys.append((key, title[:300], brand[:200]))
        seen_missing_keys.add(key)

    now = timezone.now()
    product_numbers = next_product_numbers(len(missing_keys))
    created_products = [
        Product(
            product_number=product_number,
            title=title,
            brand=brand,
            model='',
            category=GENERIC_CATEGORY,
            category_ref=category_ref,
            identifiers={},
            tags=[],
            created_at=now,
            updated_at=now,
        )
        for product_number, (_key, title, brand) in zip(product_numbers, missing_keys)
    ]
    Product.objects.bulk_create(created_products, batch_size=1000)
    counts['rough_products_created'] = len(created_products)
    for (key, _title, _brand), product in zip(missing_keys, created_products):
        product_by_identity[key] = product.id

    items_to_update = []
    for item_id, raw_title, raw_brand in null_item_rows:
        title = str(raw_title or '').strip()
        if title:
            brand = str(raw_brand or '').strip() or 'Generic'
            key = identity_key(title[:300], brand[:200], '', GENERIC_CATEGORY)
            product_id = product_by_identity.get(key) or generic_product.id
            if product_id == generic_product.id:
                counts['null_items_generic'] += 1
            else:
                counts['null_items_exact_identity'] += 1
        else:
            product_id = generic_product.id
            counts['null_items_generic'] += 1
        items_to_update.append(Item(id=item_id, product_id=product_id, updated_at=now))

    Item.objects.bulk_update(items_to_update, ['product', 'updated_at'], batch_size=1000)

    logger.warning('Product/Item field cleanup backfill counts: %s', counts)


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('inventory', '0060_processingrow_split_transforms_item_unit_count'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='identifiers',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='product',
            name='tags',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.RenameField(
            model_name='item',
            old_name='unit_retail',
            new_name='retail',
        ),
        migrations.AlterField(
            model_name='item',
            name='product',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='items',
                to='inventory.product',
            ),
        ),
        migrations.AlterField(
            model_name='product',
            name='brand',
            field=models.CharField(default='Generic', max_length=200),
        ),
        migrations.RemoveField(model_name='product', name='default_price'),
        migrations.RemoveField(model_name='product', name='upc'),
        migrations.RemoveField(model_name='product', name='times_ordered'),
        migrations.RemoveField(model_name='product', name='total_units_received'),
        migrations.RemoveField(model_name='item', name='batch_group'),
        migrations.RemoveField(model_name='item', name='brand'),
        migrations.RemoveField(model_name='item', name='processing_tier'),
        migrations.RemoveField(model_name='item', name='title'),
        migrations.RemoveField(model_name='item', name='unit_count'),
        migrations.RemoveField(model_name='processingrow', name='units_per_item'),
        migrations.AddConstraint(
            model_name='product',
            constraint=models.CheckConstraint(
                check=~models.Q(('title', '')),
                name='inventory_product_title_nonempty',
            ),
        ),
        migrations.AddConstraint(
            model_name='product',
            constraint=models.CheckConstraint(
                check=~models.Q(('brand', '')),
                name='inventory_product_brand_nonempty',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=GinIndex(fields=['identifiers'], name='inv_product_ident_gin'),
        ),
        migrations.AddIndex(
            model_name='product',
            index=GinIndex(fields=['tags'], name='inv_product_tags_gin'),
        ),
    ]
