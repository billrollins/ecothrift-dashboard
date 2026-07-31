"""Drive the demo_script.md journey against the local DB (DEBUG only).

Usage:
    set ONLINE_SALES_ENABLED=true
    python manage.py walk_online_sales_demo
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.webstore.models import Conversation, Reservation, WebListing
from apps.webstore.services.reservations import complete_reservation


class Command(BaseCommand):
    help = 'Walk the Online Sales demo journey via the API (DEBUG only).'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Refusing walk_online_sales_demo when DEBUG=False.')
        if not settings.ONLINE_SALES_ENABLED:
            raise CommandError('Set ONLINE_SALES_ENABLED=true before walking the demo.')

        client = APIClient()
        steps = []

        # Config
        r = client.get('/api/webstore/config/')
        assert r.status_code == 200 and r.json()['online_sales_enabled'], r.content
        steps.append('config: online_sales_enabled')

        # Catalog
        r = client.get('/api/webstore/catalog/')
        assert r.status_code == 200, r.content
        steps.append(f'catalog: {len(r.json().get("results", r.json()))} listings')

        slug = 'demo-os-f2-multi'
        listing = WebListing.objects.get(slug=slug)

        # Ask about item
        r = client.post(
            f'/api/webstore/catalog/{slug}/ask/',
            {
                'name': 'Walk Guest',
                'email': 'walk.guest@ecothrift.example',
                'body': 'Is this still available for Saturday?',
            },
            format='json',
        )
        assert r.status_code == 201, r.content
        ask_token = r.json()['public_token']
        steps.append(f'ask: thread {ask_token[:8]}...')

        # Hold request
        r = client.post(
            '/api/webstore/holds/',
            {
                'slug': slug,
                'quantity': 1,
                'customer_name': 'Walk Guest',
                'email': 'walk.guest@ecothrift.example',
                'phone': '4025550100',
                'note': 'Walkthrough hold',
            },
            format='json',
        )
        assert r.status_code == 201, r.content
        hold = r.json()
        status_token = hold['status_token']
        thread_token = hold['thread']['public_token']
        steps.append(
            f'hold: {status_token[:8]}... unread={hold["thread"]["customer_unread"]}'
        )

        # Staff reply → unread should appear on GET without clearing
        group, _ = Group.objects.get_or_create(name='Manager')
        mgr, _ = User.objects.get_or_create(
            email='walk.mgr@ecothrift.example',
            defaults={'first_name': 'Walk', 'last_name': 'Mgr', 'is_staff': True},
        )
        mgr.groups.add(group)
        client.force_authenticate(mgr)
        conv = Conversation.objects.get(public_token=thread_token)
        reply = client.post(
            f'/api/webstore/conversations/{conv.id}/reply/',
            {'body': 'Yes — we will stage it for you.'},
            format='json',
        )
        assert reply.status_code == 200, reply.content
        client.force_authenticate(None)

        r = client.get(f'/api/webstore/holds/{status_token}/')
        assert r.status_code == 200, r.content
        unread = r.json()['thread']['customer_unread']
        assert unread > 0, 'GET hold status cleared unread (regression)'
        steps.append(f'hold GET survives unread={unread}')

        r = client.post(f'/api/webstore/threads/{thread_token}/read/')
        assert r.status_code == 200 and r.json()['customer_unread'] == 0
        steps.append('thread mark-read clears unread')

        # Confirm + stage
        client.force_authenticate(mgr)
        res = Reservation.objects.get(status_token=status_token)
        conf = client.post(f'/api/webstore/reservations/{res.id}/confirm/')
        assert conf.status_code == 200, conf.content
        stage = client.post(f'/api/webstore/reservations/{res.id}/stage/')
        assert stage.status_code == 200, stage.content
        assert stage.json()['status'] == 'ready_for_pickup'
        steps.append('confirm + stage -> ready_for_pickup')

        # Magic link for demo customer
        client.force_authenticate(None)
        ml = client.post(
            '/api/auth/magic-link/request/',
            {'email': 'demo.customer@ecothrift.example'},
            format='json',
        )
        assert ml.status_code == 200, ml.content
        debug_token = ml.json().get('debug_token')
        assert debug_token, 'DEBUG should return debug_token'
        consume = client.post(
            '/api/auth/magic-link/consume/',
            {'token': debug_token},
            format='json',
        )
        assert consume.status_code == 200, consume.content
        steps.append('magic-link consume ok')

        # Complete via service (POS path)
        listing.refresh_from_db()
        reserved_before = listing.reserved
        complete_reservation(Reservation.objects.get(status_token=status_token), user=mgr)
        listing.refresh_from_db()
        res.refresh_from_db()
        assert res.status == 'completed'
        assert listing.reserved == reserved_before - 1
        steps.append(f'complete: reserved {reserved_before}->{listing.reserved}')

        # Sales log
        client.force_authenticate(mgr)
        sales = client.get('/api/webstore/sales-log/')
        assert sales.status_code == 200, sales.content
        steps.append('sales-log ok')

        # Expire dry-run
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        call_command('expire_online_holds', '--dry-run', stdout=out)
        steps.append(f'expire dry-run: {out.getvalue().strip()}')

        self.stdout.write(self.style.SUCCESS('Walkthrough OK:'))
        for s in steps:
            self.stdout.write(f'  - {s}')
        self.stdout.write(f'  ask thread kept for staff: {ask_token}')
