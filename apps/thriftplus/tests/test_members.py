"""Thrift+ Phase 1: card codes, member rules, card-back PDFs, and the staff API."""
from __future__ import annotations

import base64
import re

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.thriftplus.models import Account, Card, Event, Person
from apps.thriftplus.services import card_pdf, cards, members
from apps.thriftplus.services.members import MemberError


def _user(email, group):
    user = User.objects.create_user(email, 'Test', 'User', password='x-pass-123')
    user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class CardCodeTests(TestCase):
    def test_codes_carry_a_luhn_check_digit_and_parse_from_any_form(self):
        for _ in range(50):
            code = cards.new_code()
            self.assertTrue(cards.is_valid(code))
            self.assertNotEqual(code[0], '0')
        code = cards.new_code()
        self.assertEqual(cards.parse(f'TP{code}'), code)
        self.assertEqual(cards.parse(cards.display(code)), code)
        self.assertEqual(cards.parse(f'{code[:4]}-{code[4:8]}-{code[8:]}'), code)
        wrong = code[:-1] + str((int(code[-1]) + 1) % 10)
        self.assertIsNone(cards.parse(wrong))
        self.assertEqual(cards.luhn_digit('7992739871'), '3')  # the textbook example

    def test_a_batch_makes_unique_blank_cards(self):
        batch = cards.generate_batch(25, note='first run')
        self.assertEqual(batch.cards.filter(status=Card.STATUS_UNISSUED).count(), 25)
        self.assertEqual(len(set(batch.cards.values_list('code', flat=True))), 25)
        with self.assertRaises(ValueError):
            cards.generate_batch(0)

    def test_card_backs_pdf_has_one_page_per_card_in_jobs_of_ten(self):
        codes = [cards.new_code() for _ in range(23)]
        pdf = card_pdf.card_backs_pdf(codes[:2])
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertEqual(len(re.findall(rb'/Type\s*/Page(?![s\w])', pdf)), 2)
        self.assertEqual(len(card_pdf.pdf_chunks(codes)), 3)


class MemberRuleTests(TestCase):
    def setUp(self):
        self.batch = cards.generate_batch(5)
        self.codes = list(self.batch.cards.values_list('code', flat=True))
        self.cashier = _user('cashier@example.com', 'Employee')

    def test_signup_with_id_attaches_the_card(self):
        account = members.create_account(first_name='Ana', last_name='Diaz', phone='(402) 555-0101', id_checked=True,
                                         verified_18=True, card_code=f'TP{self.codes[0]}', user=self.cashier)
        person = account.people.get()
        self.assertEqual((person.role, person.phone, person.verified_18), (Person.ROLE_PRIMARY, '4025550101', True))
        card = Card.objects.get(code=self.codes[0])
        self.assertEqual((card.status, card.person_id, card.issued_by), (Card.STATUS_ACTIVE, person.pk, self.cashier))
        self.assertEqual(list(Event.objects.filter(account=account).values_list('action', flat=True).order_by('pk')), ['signup', 'card_issued'])
        self.assertEqual(list(members.find(self.codes[0])), [account])
        self.assertEqual(list(members.find('555-0101')), [account])
        self.assertEqual(list(members.find('ana diaz')), [account])

    def test_no_id_means_unverified_and_the_18_flag_needs_an_id_check(self):
        account = members.create_account(first_name='Bo', verified_18=True)
        person = account.people.get()
        self.assertEqual((person.id_checked, person.verified_18), (False, False))
        members.verify(person, verified_18=True, user=self.cashier)
        person.refresh_from_db()
        self.assertEqual((person.id_checked, person.verified_18), (True, True))

    def test_second_adult_rules(self):
        account = members.create_account(first_name='Cy', phone='4025550102')
        with self.assertRaises(MemberError):
            members.add_second_adult(account, both_present=True, primary_approves=False, first_name='Dee')
        second = members.add_second_adult(account, both_present=True, primary_approves=True, first_name='Dee',
                                          card_code=self.codes[1])
        with self.assertRaises(MemberError):
            members.add_second_adult(account, both_present=True, primary_approves=True, first_name='Eve')
        with self.assertRaises(MemberError):
            members.remove_second_adult(second, removed_by='cashier')
        with self.assertRaises(MemberError):
            members.remove_second_adult(account.people.get(role='primary'), removed_by='self')
        members.remove_second_adult(second, removed_by='self')
        self.assertEqual(Card.objects.get(code=self.codes[1]).status, Card.STATUS_DEAD)
        members.add_second_adult(account, both_present=True, primary_approves=True, first_name='Eve')  # the slot is free again

    def test_card_rules_and_revocation(self):
        account = members.create_account(first_name='Fay', card_code=self.codes[2])
        person = account.people.get()
        with self.assertRaises(MemberError):
            members.issue_card(person, self.codes[2])  # already active
        with self.assertRaises(MemberError):
            members.issue_card(person, '123456789012')  # not a real code
        members.issue_card(person, self.codes[3])  # a keychain tag as well
        self.assertEqual(person.cards.filter(status=Card.STATUS_ACTIVE).count(), 2)
        with self.assertRaises(MemberError):
            members.create_account(first_name='Other', phone='', card_code=self.codes[2])
        members.revoke(account, reason='tag switching', user=self.cashier)
        account.refresh_from_db()
        self.assertEqual(account.status, Account.STATUS_REVOKED)
        self.assertFalse(Card.objects.filter(person__account=account, status=Card.STATUS_ACTIVE).exists())
        with self.assertRaises(MemberError):
            members.issue_card(person, self.codes[4])

    def test_one_membership_per_phone(self):
        members.create_account(first_name='Gus', phone='402-555-0103')
        with self.assertRaises(MemberError):
            members.create_account(first_name='Gus again', phone='1 (402) 555-0103')

    def test_the_switch_starts_off(self):
        self.assertFalse(members.is_enabled())


class ThriftPlusApiTests(APITestCase):
    def setUp(self):
        self.cashier = _user('cashier@example.com', 'Employee')
        self.manager = _user('manager@example.com', 'Manager')
        self.batch = cards.generate_batch(3)
        self.codes = list(self.batch.cards.values_list('code', flat=True))

    def test_signup_lookup_and_find(self):
        self.client.force_authenticate(self.cashier)
        res = self.client.post('/api/thriftplus/accounts/', {
            'first_name': 'Hal', 'phone': '4025550104', 'id_checked': 'true', 'verified_18': 'true', 'card_code': self.codes[0],
        }, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['people'][0]['cards'][0]['code'], self.codes[0])
        found = self.client.get('/api/thriftplus/cards/lookup/', {'code': f'TP{self.codes[0]}'}).data
        self.assertEqual((found['person']['first_name'], found['account_status']), ('Hal', 'active'))
        self.assertEqual(len(self.client.get('/api/thriftplus/accounts/', {'q': 'hal'}).data), 1)
        bad = self.client.post('/api/thriftplus/accounts/', {'first_name': 'Hal 2', 'phone': '4025550104'}, format='multipart')
        self.assertEqual(bad.status_code, 400)

    def test_revoke_and_batches_are_for_managers(self):
        account = members.create_account(first_name='Ivy')
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.client.post(f'/api/thriftplus/accounts/{account.pk}/revoke/', {'reason': 'x'}).status_code, 403)
        self.assertEqual(self.client.post('/api/thriftplus/card-batches/', {'size': 5}).status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/thriftplus/accounts/{account.pk}/revoke/', {'reason': 'return abuse'}).data['status'], 'revoked')
        batch = self.client.post('/api/thriftplus/card-batches/', {'size': 12, 'note': 'test'}).data
        jobs = self.client.get(f"/api/thriftplus/card-batches/{batch['id']}/backs/", {'jobs': '1'}).data
        self.assertEqual((jobs['cards'], len(jobs['jobs'])), (12, 2))
        self.assertTrue(base64.b64decode(jobs['jobs'][0]).startswith(b'%PDF'))
        pdf = self.client.get(f"/api/thriftplus/card-batches/{batch['id']}/backs/")
        self.assertEqual(pdf['Content-Type'], 'application/pdf')
