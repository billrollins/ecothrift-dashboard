import logging
import re

import django.db.models.deletion
from django.contrib.postgres.indexes import GinIndex
from django.db import migrations, models


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

    for product in Product.objects.all().iterator():
        changed = []
        identifiers = product.identifiers if isinstance(product.identifiers, dict) else {}
        upc = str(getattr(product, 'upc', '') or '').strip()
        merged_identifiers = _merge_identifiers(identifiers, {'upc': upc} if upc else {})
        if merged_identifiers != identifiers:
            product.identifiers = merged_identifiers
            changed.append('identifiers')
            if upc:
                counts['upcs_migrated'] += 1
        if not str(product.title or '').strip():
            product.title = 'Generic Product'
            changed.append('title')
        if not str(product.brand or '').strip():
            product.brand = 'Generic'
            changed.append('brand')
        if changed:
            product.save(update_fields=[*dict.fromkeys(changed), 'updated_at'])
            counts['products_normalized'] += 1

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
    if generic_product.category_ref_id is None:
        generic_product.category_ref = category_ref
        generic_product.save(update_fields=['category_ref', 'updated_at'])

    def exact_identifier_product(identifiers):
        upc = _norm_identifier_value('upc', identifiers.get('upc') if isinstance(identifiers, dict) else '')
        if upc:
            hit = Product.objects.filter(identifiers__upc=upc).order_by('id').first()
            if hit:
                return hit
        return None

    def exact_identity_product(title, brand, model, category):
        if not title:
            return None
        return Product.objects.filter(
            title__iexact=title,
            brand__iexact=brand,
            model__iexact=model,
            category__iexact=category,
        ).order_by('id').first()

    null_items = Item.objects.filter(product_id__isnull=True).order_by('id')
    for item in null_items.iterator():
        title = str(getattr(item, 'title', '') or '').strip()
        brand = str(getattr(item, 'brand', '') or '').strip() or 'Generic'
        model = ''
        category = GENERIC_CATEGORY
        identifiers = {}
        product = exact_identifier_product(identifiers)
        bucket = ''
        if product:
            bucket = 'null_items_exact_identifier'
        if product is None:
            product = exact_identity_product(title, brand, model, category)
            if product:
                bucket = 'null_items_exact_identity'
        if product is None and title:
            product = Product.objects.create(
                title=title[:300],
                brand=brand[:200],
                model=model,
                category=category,
                category_ref=category_ref,
                identifiers=identifiers,
                tags=[],
            )
            counts['rough_products_created'] += 1
            bucket = 'rough_products_created'
        if product is None:
            product = generic_product
            bucket = 'null_items_generic'
        item.product = product
        item.save(update_fields=['product', 'updated_at'])
        if bucket in counts:
            counts[bucket] += 1

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
