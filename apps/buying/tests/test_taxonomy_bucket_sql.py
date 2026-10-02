"""SQL taxonomy bucket CASE must match ``taxonomy_bucket_for_item`` (Gate 0)."""

from __future__ import annotations

from django.db import connection
from django.test import TestCase

from apps.buying.services.category_need import taxonomy_bucket_for_item
from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED
from apps.inventory.models import Category, Item, ManifestRow, Product, PurchaseOrder, Vendor


def _bucket_from_sql(item_id: int) -> str:
    case = taxonomy_bucket_case_sql()
    sql = f"""
        SELECT ({case}) AS bucket
        FROM inventory_item i
        LEFT JOIN inventory_product p ON i.product_id = p.id
        LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
        WHERE i.id = %s
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [item_id])
        row = cursor.fetchone()
    return row[0]


class TaxonomyBucketSqlParityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.vendor = Vendor.objects.create(name='TaxVendor', code='TV-TAX')
        cls.po = PurchaseOrder.objects.create(
            vendor=cls.vendor,
            order_number='PO-TAX-01',
            ordered_date='2025-06-01',
            status='ordered',
        )

    def _assert_parity(self, item: Item) -> None:
        item.refresh_from_db()
        py = taxonomy_bucket_for_item(item)
        sql = _bucket_from_sql(item.pk)
        self.assertEqual(
            py,
            sql,
            msg=(
                f'Python={py!r} SQL={sql!r} item_id={item.pk} '
                f'product_id={item.product_id} manifest_row_id={item.manifest_row_id}'
            ),
        )

    def _category(self, name: str) -> Category:
        category, _ = Category.objects.get_or_create(name=name.strip())
        return category

    def test_product_category_in_taxonomy(self):
        prod = Product.objects.create(title='p', category=self._category('Electronics'))
        it = Item.objects.create(sku='ITMTBKT01', product=prod, purchase_order=self.po)
        self._assert_parity(it)

    def test_product_category_trims_like_python_strip(self):
        prod = Product.objects.create(title='p', category=self._category('Electronics'))
        it = Item.objects.create(sku='ITMTBKT02', product=prod, purchase_order=self.po)
        self._assert_parity(it)

    def test_manifest_row_fallback_when_product_not_in_taxonomy(self):
        mr = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=1,
            title='d',
            category='Electronics',
        )
        prod = Product.objects.create(title='p', category=self._category('Mixed lots & uncategorized'))
        it = Item.objects.create(
            sku='ITMTBKT03',
            product=prod,
            manifest_row=mr,
            purchase_order=self.po,
        )
        self._assert_parity(it)

    def test_product_category_wins_over_manifest_row(self):
        mr = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=2,
            title='d',
            category='Books & media',
        )
        prod = Product.objects.create(title='p2', category=self._category('Electronics'))
        it = Item.objects.create(
            sku='ITMTBKT04',
            product=prod,
            manifest_row=mr,
            purchase_order=self.po,
        )
        self._assert_parity(it)

    def test_mixed_when_neither_maps(self):
        mr = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=3,
            title='d',
            category='unknown-cat',
        )
        prod = Product.objects.create(title='p3', category=self._category('Mixed lots & uncategorized'))
        it = Item.objects.create(
            sku='ITMTBKT05',
            product=prod,
            manifest_row=mr,
            purchase_order=self.po,
        )
        self._assert_parity(it)
        self.assertEqual(taxonomy_bucket_for_item(it), MIXED_LOTS_UNCATEGORIZED)

    def test_mixed_product_without_manifest_row_falls_back_to_mixed(self):
        prod = Product.objects.create(title='p6', category=self._category(MIXED_LOTS_UNCATEGORIZED))
        it = Item.objects.create(sku='ITMTBKT06', product=prod, purchase_order=self.po)
        self._assert_parity(it)


class ProfileCategorySwitchTests(TaxonomyBucketSqlParityTests):
    """ITM-15: with the owner's switch on, a real profile category wins; off, nothing changes."""

    def _item(self, sku, profile_category):
        from apps.inventory.models import ProductProfile

        prod = Product.objects.create(title='p', category=self._category(MIXED_LOTS_UNCATEGORIZED))
        ProductProfile.objects.create(product=prod, category=profile_category)
        return Item.objects.create(sku=sku, product=prod, purchase_order=self.po)

    def _switch(self, on):
        from apps.core.models import AppSetting
        from apps.inventory.services import effective_category

        AppSetting.objects.update_or_create(key=effective_category.SWITCH_KEY, defaults={'value': on})

    def test_switch_off_keeps_the_product_category(self):
        it = self._item('ITMTBKT90', 'Toys & games')
        self.assertNotIn('productprofile', taxonomy_bucket_case_sql())
        self.assertEqual(_bucket_from_sql(it.pk), MIXED_LOTS_UNCATEGORIZED)
        self._assert_parity(it)

    def test_switch_on_uses_a_real_profile_category_in_sql_and_python(self):
        self._switch(True)
        it = self._item('ITMTBKT91', 'Toys & games')
        self.assertEqual(_bucket_from_sql(it.pk), 'Toys & games')
        self._assert_parity(it)

    def test_switch_on_ignores_a_mixed_or_unknown_profile_category(self):
        self._switch(True)
        for sku, cat in (('ITMTBKT92', MIXED_LOTS_UNCATEGORIZED), ('ITMTBKT93', 'Gadgets'), ('ITMTBKT94', '')):
            it = self._item(sku, cat)
            self.assertEqual(_bucket_from_sql(it.pk), MIXED_LOTS_UNCATEGORIZED)
            self._assert_parity(it)
