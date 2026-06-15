from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


CANONICAL_CATEGORY_NAMES = (
    'Kitchen & dining',
    'Furniture',
    'Outdoor & patio furniture',
    'Home décor & lighting',
    'Household & cleaning',
    'Bedding & bath',
    'Storage & organization',
    'Toys & games',
    'Sports & outdoors',
    'Tools & hardware',
    'Office & school supplies',
    'Electronics',
    'Baby & kids',
    'Health, beauty & personal care',
    'Apparel & accessories',
    'Books & media',
    'Pet supplies',
    'Party, seasonal & novelty',
    'Mixed lots & uncategorized',
)

MIXED_LOTS_UNCATEGORIZED = 'Mixed lots & uncategorized'

SLUG_TO_CANONICAL = {
    'electronics': 'Electronics',
    'laptops-computers': 'Electronics',
    'tablets': 'Electronics',
    'smartphones': 'Electronics',
    'tvs-monitors': 'Electronics',
    'audio-headphones': 'Electronics',
    'gaming-consoles': 'Electronics',
    'smart-home-networking': 'Electronics',
    'cameras-photography': 'Electronics',
    'car-electronics-accessories': 'Electronics',
    'small-kitchen-appliances': 'Kitchen & dining',
    'large-kitchen-appliances': 'Kitchen & dining',
    'home-kitchen': 'Kitchen & dining',
    'cookware-bakeware': 'Kitchen & dining',
    'kitchen-dining': 'Kitchen & dining',
    'appliances': 'Kitchen & dining',
    'power-tools': 'Tools & hardware',
    'hand-tools': 'Tools & hardware',
    'outdoor-garden-tools': 'Tools & hardware',
    'tools-hardware': 'Tools & hardware',
    'exercise-fitness-equipment': 'Sports & outdoors',
    'cycling': 'Sports & outdoors',
    'camping-hiking': 'Sports & outdoors',
    'sports-outdoors': 'Sports & outdoors',
    'board-games-puzzles': 'Toys & games',
    'building-stem-toys': 'Toys & games',
    'toys-games': 'Toys & games',
    'personal-care-appliances': 'Health, beauty & personal care',
    'health-beauty': 'Health, beauty & personal care',
    'health-beauty-personal-care': 'Health, beauty & personal care',
    'furniture': 'Furniture',
    'office-school': 'Office & school supplies',
    'office-school-supplies': 'Office & school supplies',
    'miscellaneous': MIXED_LOTS_UNCATEGORIZED,
    'general-merchandise': MIXED_LOTS_UNCATEGORIZED,
    'mixed-lots-uncategorized': MIXED_LOTS_UNCATEGORIZED,
    'automotive': MIXED_LOTS_UNCATEGORIZED,
    'outdoor-patio-furniture': 'Outdoor & patio furniture',
    'home-decor-lighting': 'Home décor & lighting',
    'household-cleaning': 'Household & cleaning',
    'bedding-bath': 'Bedding & bath',
    'storage-organization': 'Storage & organization',
    'baby-kids': 'Baby & kids',
    'apparel-accessories': 'Apparel & accessories',
    'books-media': 'Books & media',
    'pet-supplies': 'Pet supplies',
    'party-seasonal-novelty': 'Party, seasonal & novelty',
}

for _name in CANONICAL_CATEGORY_NAMES:
    SLUG_TO_CANONICAL.setdefault(slugify(_name), _name)


def _canonical_name(value):
    text = str(value or '').strip()
    if not text:
        return MIXED_LOTS_UNCATEGORIZED
    if text in CANONICAL_CATEGORY_NAMES:
        return text
    return SLUG_TO_CANONICAL.get(slugify(text), MIXED_LOTS_UNCATEGORIZED)


def seed_and_backfill_product_categories(apps, schema_editor):
    Category = apps.get_model('inventory', 'Category')
    Product = apps.get_model('inventory', 'Product')

    canonical_slugs = {slugify(name) for name in CANONICAL_CATEGORY_NAMES}
    for legacy in Category.objects.exclude(name__in=CANONICAL_CATEGORY_NAMES):
        if legacy.slug in canonical_slugs:
            legacy.slug = f'legacy-{legacy.id}-{legacy.slug}'[:200]
            legacy.save(update_fields=['slug'])

    canonical_by_name = {}
    for name in CANONICAL_CATEGORY_NAMES:
        wanted_slug = slugify(name)
        category, _ = Category.objects.get_or_create(
            name=name,
            defaults={
                'slug': wanted_slug,
                'spec_template': [],
            },
        )
        update_fields = []
        if category.slug != wanted_slug:
            category.slug = wanted_slug
            update_fields.append('slug')
        if category.spec_template != []:
            category.spec_template = []
            update_fields.append('spec_template')
        if update_fields:
            category.save(update_fields=update_fields)
        canonical_by_name[name] = category

    fallback = canonical_by_name[MIXED_LOTS_UNCATEGORIZED]
    legacy_categories = {
        c.id: c
        for c in Category.objects.all()
    }

    updates = []
    for product in Product.objects.all().iterator(chunk_size=2000):
        source = ''
        legacy_ref_id = getattr(product, 'category_ref_id', None)
        if legacy_ref_id and legacy_ref_id in legacy_categories:
            source = legacy_categories[legacy_ref_id].name
        if not source:
            source = getattr(product, 'category', '') or ''
        product.category_new_id = canonical_by_name.get(_canonical_name(source), fallback).id
        updates.append(product)
        if len(updates) >= 2000:
            Product.objects.bulk_update(updates, ['category_new'])
            updates.clear()
    if updates:
        Product.objects.bulk_update(updates, ['category_new'])


def prune_noncanonical_categories(apps, schema_editor):
    Category = apps.get_model('inventory', 'Category')
    Category.objects.exclude(name__in=CANONICAL_CATEGORY_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0061_product_item_field_cleanup'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='category_new',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='inventory.category',
            ),
        ),
        migrations.RunPython(seed_and_backfill_product_categories, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='category',
            name='parent',
        ),
        migrations.RemoveField(
            model_name='manifestrow',
            name='description',
        ),
        migrations.RemoveField(
            model_name='preprocessingrow',
            name='standard_description',
        ),
        migrations.RemoveField(
            model_name='preprocessingrow',
            name='ai_description',
        ),
        migrations.RemoveField(
            model_name='preprocessingrow',
            name='final_description',
        ),
        migrations.RemoveField(
            model_name='processingrow',
            name='description',
        ),
        migrations.RemoveField(
            model_name='product',
            name='category_ref',
        ),
        migrations.RemoveField(
            model_name='product',
            name='category',
        ),
        migrations.RemoveField(
            model_name='product',
            name='description',
        ),
        migrations.RenameField(
            model_name='product',
            old_name='category_new',
            new_name='category',
        ),
        migrations.AlterField(
            model_name='product',
            name='category',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='products',
                to='inventory.category',
            ),
        ),
        migrations.RunPython(prune_noncanonical_categories, migrations.RunPython.noop),
    ]
