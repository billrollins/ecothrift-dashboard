"""The purchase-order stats annotation must stay cheap: one small count per relation, never a multi-table join."""

from datetime import date

from django.test import TestCase

from apps.inventory.models import BatchGroup, Item, ManifestRow, Product, PurchaseOrder, Vendor
from apps.inventory.views import _annotate_purchase_order_stats

CHILD_TABLES = ('inventory_item', 'inventory_manifestrow', 'inventory_batchgroup')


class PurchaseOrderStatsQueryTests(TestCase):
    def setUp(self):
        vendor = Vendor.objects.create(name='Stats Vendor', code='STV')
        self.po = PurchaseOrder.objects.create(vendor=vendor, order_number='STATS-1', ordered_date=date(2026, 9, 1))
        self.other = PurchaseOrder.objects.create(vendor=vendor, order_number='STATS-2', ordered_date=date(2026, 9, 1))
        product = Product.objects.create(title='Widget')
        for i in range(4):
            ManifestRow.objects.create(purchase_order=self.po, row_number=i + 1, title=f'Row {i}')
        statuses = ['intake', 'intake', 'processing', 'on_shelf', 'on_shelf', 'on_shelf', 'sold', 'lost']
        for i, status in enumerate(statuses):
            Item.objects.create(sku=f'ITM09{i:05d}', product=product, purchase_order=self.po, status=status, price='5.00')
        BatchGroup.objects.create(batch_number='B-1', purchase_order=self.po, status='pending')
        BatchGroup.objects.create(batch_number='B-2', purchase_order=self.po, status='complete')
        BatchGroup.objects.create(batch_number='B-3', purchase_order=self.po, status='complete')
        Item.objects.create(sku='ITM0999999', product=product, purchase_order=self.other, status='sold', price='5.00')

    def test_counts_are_right_and_do_not_multiply(self):
        po = _annotate_purchase_order_stats(PurchaseOrder.objects.filter(pk=self.po.pk)).get()
        self.assertEqual(
            (po._items_intake, po._items_processing, po._items_on_shelf, po._items_sold,
             po._items_returned, po._items_scrapped, po._items_lost),
            (2, 1, 3, 1, 0, 0, 1),
        )
        self.assertEqual((po._manifest_row_count, po._batch_groups_total, po._batch_groups_pending), (4, 3, 1))
        other = _annotate_purchase_order_stats(PurchaseOrder.objects.filter(pk=self.other.pk)).get()
        self.assertEqual((other._items_sold, other._items_intake, other._manifest_row_count, other._batch_groups_total), (1, 0, 0, 0))

    def test_no_join_on_the_child_tables(self):
        """A JOIN on items, manifest rows or batch groups multiplies rows and spills to disk on big orders."""
        sql = str(_annotate_purchase_order_stats(PurchaseOrder.objects.filter(pk=self.po.pk)).query).lower()
        for table in CHILD_TABLES:
            self.assertNotIn(f'join "{table}"', sql, f'{table} is joined; count it in a subquery instead')
        self.assertNotIn('group by "inventory_purchaseorder"', sql)

    def test_each_subquery_reads_one_child_table(self):
        sql = str(_annotate_purchase_order_stats(PurchaseOrder.objects.filter(pk=self.po.pk)).query).lower()
        for sub in sql.split('(select ')[1:]:
            body = sub.split(' from ', 1)[1]
            used = [tbl for tbl in CHILD_TABLES if f'"{tbl}"' in body.split(')')[0] or body.startswith(f'"{tbl}"')]
            self.assertEqual(len(used), 1, sub[:200])
