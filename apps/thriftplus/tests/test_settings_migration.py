"""The 10-12 policy's settings migration (0017): it retires the cover keys, keeps an owner's edit, and puts open
sales back to kept."""
from importlib import import_module

from django.apps import apps as django_apps
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.pos.models import Cart, Drawer, Register
from apps.thriftplus.models import AppCart, CartMember
from apps.thriftplus.services import cards, members

migration = import_module('apps.thriftplus.migrations.0017_settings_10_12')


def _set(key, value):
    AppSetting.objects.update_or_create(key=key, defaults={'value': value})


class SettingsMigrationTests(TestCase):
    def test_the_cover_goes_the_shares_change_and_open_sales_go_back_to_kept(self):
        _set('thrift_plus_cover_amount', '10.00')
        _set('thrift_plus_bank_bonus', '0.05')
        _set('thrift_plus_return_credit_share', '0.95')
        _set('thrift_plus_nonreturnable_words', ['as is', 'crossbow', 'untested'])
        _set('pos.staff_purchases', {'payroll_deduction': True, 'payroll_max_percent': 25, 'thrift_plus_free': True})
        AppSetting.objects.filter(key__in=['thrift_plus_instant_share', 'thrift_plus_return_min_price']).delete()
        clerk = User.objects.create_user('clerk@example.com', 'Pat', 'Clerk', password='x-pass-123')
        clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        register = Register.objects.create(location=WorkLocation.objects.create(name='Store'), name='R', code='R1')
        drawer = Drawer.objects.create(register=register, date=timezone.localdate(), current_cashier=clerk,
                                       opened_by=clerk, opened_at=timezone.now(), status='open')
        code = cards.generate_batch(1).cards.get().code
        account = members.create_account(first_name='Ana', phone='4025550101', card_code=code)
        card = account.people.get().cards.get()
        open_cart = Cart.objects.create(drawer=drawer, cashier=clerk)
        done_cart = Cart.objects.create(drawer=drawer, cashier=clerk, status='completed')
        for cart in (open_cart, done_cart):
            CartMember.objects.create(cart=cart, account=account, person=card.person, card=card, reward_choice='instant')
        AppCart.objects.create(account=account, reward_choice='instant', choice_at=timezone.now())

        migration.forward(django_apps, None)

        values = dict(AppSetting.objects.values_list('key', 'value'))
        self.assertNotIn('thrift_plus_cover_amount', values)
        self.assertNotIn('thrift_plus_bank_bonus', values)
        self.assertEqual((values['thrift_plus_return_credit_share'], values['thrift_plus_instant_share'],
                          values['thrift_plus_return_min_price']), ('0.80', '0.50', '10.00'))
        self.assertEqual(values['thrift_plus_nonreturnable_words'], ['as is', 'untested'])
        self.assertEqual(values['pos.staff_purchases'], {'payroll_deduction': True, 'payroll_max_percent': 25})
        self.assertEqual(CartMember.objects.get(cart=open_cart).reward_choice, 'bank')
        self.assertEqual(CartMember.objects.get(cart=done_cart).reward_choice, 'instant')  # history stays
        self.assertEqual(AppCart.objects.values_list('reward_choice', 'choice_at').get(), ('', None))

    def test_an_owner_edit_to_the_return_share_is_kept(self):
        _set('thrift_plus_return_credit_share', '0.90')
        migration.forward(django_apps, None)
        self.assertEqual(AppSetting.objects.get(key='thrift_plus_return_credit_share').value, '0.90')
