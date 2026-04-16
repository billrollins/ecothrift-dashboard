"""SQL taxonomy bucket CASE must match ``taxonomy_bucket_for_item`` (Gate 0)."""

from __future__ import annotations

from django.db import connection
from django.test import TestCase

from apps.buying.services.category_need import taxonomy_bucket_for_item
from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED
from apps.inventory.models import Item, Product


def _bucket_from_sql(item_id: int) -> str:
    case = taxonomy_bucket_case_sql()
    sql = f"""
        SELECT ({case}) AS bucket
        FROM inventory_item i
        LEFT JOIN inventory_product p ON i.product_id = p.id
        WHERE i.id = %s
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [item_id])
        row = cursor.fetchone()
    return row[0]


class TaxonomyBucketSqlParityTests(TestCase):
    def _assert_parity(self, item: Item) -> None:
        item.refresh_from_db()
        py = taxonomy_bucket_for_item(item)
        sql = _bucket_from_sql(item.pk)
        self.assertEqual(
            py,
            sql,
            msg=f'Python={py!r} SQL={sql!r} item_id={item.pk} category={item.category!r} product_id={item.product_id}',
        )

    def test_item_category_in_taxonomy(self):
        it = Item.objects.create(
            sku='ITMTBKT01',
            title='t',
            category='Electronics',
        )
        self._assert_parity(it)

    def test_item_category_trims_like_python_strip(self):
        it = Item.objects.create(
            sku='ITMTBKT02',
            title='t',
            category='  Electronics  ',
        )
        self._assert_parity(it)

    def test_product_fallback_when_item_not_in_taxonomy(self):
        prod = Product.objects.create(title='p', category='Electronics')
        it = Item.objects.create(
            sku='ITMTBKT03',
            title='t',
            category='not-a-taxonomy-label',
            product=prod,
        )
        self._assert_parity(it)

    def test_item_category_wins_over_product(self):
        prod = Product.objects.create(title='p2', category='Electronics')
        it = Item.objects.create(
            sku='ITMTBKT04',
            title='t',
            category='Books & media',
            product=prod,
        )
        self._assert_parity(it)

    def test_mixed_when_neither_maps(self):
        prod = Product.objects.create(title='p3', category='unknown-cat')
        it = Item.objects.create(
            sku='ITMTBKT05',
            title='t',
            category='also-unknown',
            product=prod,
        )
        self._assert_parity(it)
        self.assertEqual(taxonomy_bucket_for_item(it), MIXED_LOTS_UNCATEGORIZED)

    def test_no_product_falls_back_to_mixed(self):
        it = Item.objects.create(
            sku='ITMTBKT06',
            title='t',
            category='x',
        )
        self._assert_parity(it)
