"""CardX record-only credit surcharge on cart complete."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, Drawer, Register
from apps.pos.services.card_surcharge import surcharge_for
from apps.pos.services.sale_mode import set_labor_day_override


class _CartCardSurchargeFixtures:
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-surcharge@example.com',
            first_name='Pos',
            last_name='Card',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        set_labor_day_override(False)
        AppSetting.objects.update_or_create(
            key='pos.card_surcharge',
            defaults={'value': {'enabled': True, 'percent': 3}, 'description': 'test'},
        )
        AppSetting.objects.update_or_create(
            key='tax_rate',
            defaults={'value': 0, 'description': 'test tax'},
        )

        self.location = WorkLocation.objects.create(name='POS Surcharge Loc')
        self.register = Register.objects.create(
            location=self.location,
            name='Register C',
            code='POS-C1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        cat = Category.objects.create(name='POS Surcharge Cat', slug='pos-surcharge-cat')
        product = Product.objects.create(title='Surcharge Item', brand='QA', category=cat)
        self.item = Item.objects.create(
            sku='POSTESTSURCH1',
            product=product,
            price=Decimal('100.00'),
            status='on_shelf',
        )

    def _open_cart_with_item(self, sku=None):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        cid = r.data['id']
        add = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': sku or self.item.sku},
            format='json',
        )
        self.assertEqual(add.status_code, 200, add.content)
        return cid, add.data

    def _complete(self, cid, payload):
        return self.client.post(f'/api/pos/carts/{cid}/complete/', payload, format='json')


class CartCardSurchargeAPITests(_CartCardSurchargeFixtures, TestCase):
    def test_credit_adds_three_percent(self):
        cid, cart = self._open_cart_with_item()
        total = Decimal(cart['total'])
        extra = surcharge_for(total, Decimal('0.03'))
        r = self._complete(cid, {
            'payment_method': 'card',
            'card_amount': str(total),
            'card_type': 'credit',
            'card_charged_total': str(total + extra),
        })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(r.data['total']), total)
        self.assertEqual(r.data['card_type'], 'credit')
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), extra)
        self.assertEqual(Decimal(r.data['card_charged_total']), total + extra)
        self.assertEqual(Decimal(r.data['card_surcharge_rate']), Decimal('0.0300'))
        from apps.pos.services.card_surcharge import drawer_card_totals
        totals = drawer_card_totals(self.drawer)
        self.assertEqual(totals['card_sales_total'], total)
        self.assertEqual(totals['card_surcharge_total'], extra)

    def test_debit_adds_zero(self):
        cid, cart = self._open_cart_with_item()
        total = cart['total']
        r = self._complete(cid, {
            'payment_method': 'card',
            'card_amount': total,
            'card_type': 'debit',
            'card_charged_total': total,
        })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['card_type'], 'debit')
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(r.data['card_charged_total']), Decimal(total))

    def test_cash_complete_without_card_type(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {
            'payment_method': 'cash',
            'cash_tendered': cart['total'],
        })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['card_type'], '')
        self.assertIsNone(r.data['card_charged_total'])

    def test_cash_rejects_card_type(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {
            'payment_method': 'cash',
            'cash_tendered': cart['total'],
            'card_type': 'credit',
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn('card_type', r.data['detail'])

    def test_card_requires_card_type(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {
            'payment_method': 'card',
            'card_amount': cart['total'],
        })
        self.assertEqual(r.status_code, 400)

    def test_invalid_payment_method(self):
        cid, _ = self._open_cart_with_item()
        r = self._complete(cid, {'payment_method': 'bitcoin'})
        self.assertEqual(r.status_code, 400)

    def test_split_surcharges_only_card_portion(self):
        cid, cart = self._open_cart_with_item()
        total = Decimal(cart['total'])
        card_base = (total * Decimal('0.60')).quantize(Decimal('0.01'))
        cash = total - card_base
        extra = surcharge_for(card_base, Decimal('0.03'))
        r = self._complete(cid, {
            'payment_method': 'split',
            'cash_tendered': str(cash),
            'card_amount': str(card_base),
            'card_type': 'credit',
            'card_charged_total': str(card_base + extra),
        })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), extra)
        self.assertEqual(Decimal(r.data['card_charged_total']), card_base + extra)
        self.assertEqual(Decimal(r.data['total']), total)

    def test_mismatched_client_total_is_400(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {
            'payment_method': 'card',
            'card_amount': cart['total'],
            'card_type': 'credit',
            'card_charged_total': '999.00',
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn('card_charged_total', r.data['detail'])

    def test_disabled_setting_yields_zero(self):
        AppSetting.objects.filter(key='pos.card_surcharge').update(
            value={'enabled': False, 'percent': 3},
        )
        cid, cart = self._open_cart_with_item()
        total = cart['total']
        preview = self.client.get(f'/api/pos/carts/{cid}/card-preview/')
        self.assertEqual(preview.status_code, 200)
        self.assertFalse(preview.data['enabled'])
        self.assertEqual(Decimal(preview.data['surcharge_amount']), Decimal('0.00'))
        self.assertEqual(preview.data['no_surcharge'], preview.data['with_surcharge'])

        r = self._complete(cid, {
            'payment_method': 'card',
            'card_amount': total,
            'card_type': 'credit',
            'card_charged_total': total,
        })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(r.data['card_charged_total']), Decimal(total))

    def test_card_preview_matches_server_math(self):
        cid, cart = self._open_cart_with_item()
        r = self.client.get(
            f'/api/pos/carts/{cid}/card-preview/',
            {'payment_method': 'card', 'card_amount': cart['total']},
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['enabled'])
        self.assertEqual(r.data['card_base'], cart['total'])
        self.assertEqual(
            Decimal(r.data['with_surcharge']),
            Decimal(cart['total']) + surcharge_for(Decimal(cart['total']), Decimal('0.03')),
        )

    def test_rounding_half_up(self):
        self.assertEqual(surcharge_for(Decimal('10.15'), Decimal('0.03')), Decimal('0.30'))
        self.assertEqual(surcharge_for(Decimal('10.25'), Decimal('0.03')), Decimal('0.31'))

        cheap = Item.objects.create(
            sku='POSTESTSURCH2',
            product=self.item.product,
            price=Decimal('10.15'),
            status='on_shelf',
        )
        cid, cart = self._open_cart_with_item(sku=cheap.sku)
        total = Decimal(cart['total'])
        extra = surcharge_for(total, Decimal('0.03'))
        r = self._complete(cid, {
            'payment_method': 'card',
            'card_amount': str(total),
            'card_type': 'credit',
            'card_charged_total': str(total + extra),
        })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), extra)


class CartCardTypeFixAPITests(_CartCardSurchargeFixtures, TestCase):
    def _set_card_type(self, cid, card_type):
        return self.client.post(
            f'/api/pos/carts/{cid}/card-type/',
            {'card_type': card_type},
            format='json',
        )

    def _complete_card(self, card_type='credit', payment_method='card', card_base=None):
        cid, cart = self._open_cart_with_item()
        total = Decimal(cart['total'])
        base = card_base if card_base is not None else total
        extra = surcharge_for(base, Decimal('0.03')) if card_type == 'credit' else Decimal('0.00')
        payload = {
            'payment_method': payment_method,
            'card_amount': str(base),
            'card_type': card_type,
            'card_charged_total': str(base + extra),
        }
        if payment_method == 'split':
            payload['cash_tendered'] = str(total - base)
        r = self._complete(cid, payload)
        self.assertEqual(r.status_code, 200, r.content)
        return cid, r.data

    def test_credit_to_debit_zeroes_surcharge(self):
        cid, cart = self._complete_card('credit')
        total = Decimal(cart['total'])
        r = self._set_card_type(cid, 'debit')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['card_type'], 'debit')
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(r.data['card_charged_total']), Decimal(cart['card_amount']))
        self.assertEqual(Decimal(r.data['card_charged_total']), total)
        self.assertEqual(Decimal(r.data['total']), total)
        self.assertIsNotNone(r.data['card_type_fixed_at'])
        self.assertEqual(r.data['card_type_fixed_by_name'], self.user.full_name)
        self.assertIsNotNone(r.data['card_type_fix_deadline'])

    def test_debit_to_credit_adds_three_percent(self):
        cid, cart = self._complete_card('debit')
        total = Decimal(cart['total'])
        extra = surcharge_for(total, Decimal('0.03'))
        r = self._set_card_type(cid, 'credit')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['card_type'], 'credit')
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), extra)
        self.assertEqual(Decimal(r.data['card_charged_total']), total + extra)
        self.assertEqual(Decimal(r.data['total']), total)
        self.assertEqual(r.data['card_type_fixed_by_name'], self.user.full_name)

    def test_cash_cart_is_400(self):
        cid, cart = self._open_cart_with_item()
        done = self._complete(cid, {
            'payment_method': 'cash',
            'cash_tendered': cart['total'],
        })
        self.assertEqual(done.status_code, 200, done.content)
        r = self._set_card_type(cid, 'credit')
        self.assertEqual(r.status_code, 400)
        self.assertIsNone(done.data['card_type_fix_deadline'])

    def test_voided_cart_is_400(self):
        cid, _ = self._complete_card('credit')
        Cart.objects.filter(pk=cid).update(status='voided')
        r = self._set_card_type(cid, 'debit')
        self.assertEqual(r.status_code, 400)

    def test_same_type_is_400(self):
        cid, _ = self._complete_card('credit')
        r = self._set_card_type(cid, 'credit')
        self.assertEqual(r.status_code, 400)

    def test_split_recomputes_card_portion_only(self):
        cid, opened = self._open_cart_with_item()
        total = Decimal(opened['total'])
        card_base = (total * Decimal('0.60')).quantize(Decimal('0.01'))
        extra = surcharge_for(card_base, Decimal('0.03'))
        done = self._complete(cid, {
            'payment_method': 'split',
            'cash_tendered': str(total - card_base),
            'card_amount': str(card_base),
            'card_type': 'credit',
            'card_charged_total': str(card_base + extra),
        })
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(Decimal(done.data['card_surcharge_amount']), extra)
        r = self._set_card_type(cid, 'debit')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(r.data['card_surcharge_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(r.data['card_charged_total']), card_base)
        self.assertEqual(Decimal(r.data['total']), total)
        self.assertEqual(Decimal(r.data['card_amount']), card_base)

    def test_past_window_403_employee_200_superuser(self):
        cid, _ = self._complete_card('credit')
        Cart.objects.filter(pk=cid).update(
            completed_at=timezone.now() - timedelta(minutes=16),
        )
        r = self._set_card_type(cid, 'debit')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data['code'], 'CARD_TYPE_FIX_LOCKED')

        group, _ = Group.objects.get_or_create(name='Employee')
        superuser = User.objects.create_superuser(
            email='bill-rollins@example.com',
            first_name='Bill',
            last_name='Rollins',
            password='test-pass-123',
        )
        superuser.groups.add(group)
        self.client.force_authenticate(user=superuser)
        r2 = self._set_card_type(cid, 'debit')
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertEqual(r2.data['card_type'], 'debit')
        self.assertEqual(r2.data['card_type_fixed_by_name'], 'Bill Rollins')
        self.assertEqual(Decimal(r2.data['card_surcharge_amount']), Decimal('0.00'))
