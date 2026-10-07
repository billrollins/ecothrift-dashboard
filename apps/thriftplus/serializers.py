from __future__ import annotations

from rest_framework import serializers

from apps.thriftplus.models import Account, Card, CardBatch, Event, Person
from apps.thriftplus.services.cards import display


class CardSerializer(serializers.ModelSerializer):
    display = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = ['id', 'code', 'display', 'status', 'issued_at', 'dead_at', 'dead_reason']

    def get_display(self, obj) -> str:
        return display(obj.code)


class PersonSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    cards = CardSerializer(many=True, read_only=True)

    class Meta:
        model = Person
        fields = [
            'id', 'role', 'first_name', 'last_name', 'phone', 'photo_url', 'id_checked', 'verified_18',
            'verified_at', 'removed_at', 'cards', 'created_at',
        ]

    def get_photo_url(self, obj) -> str | None:
        return obj.photo.url if obj.photo else None


class EventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    person_name = serializers.SerializerMethodField()
    card_code = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ['id', 'action', 'detail', 'actor_name', 'person_name', 'card_code', 'created_at']

    def get_actor_name(self, obj) -> str:
        return obj.actor.full_name if obj.actor_id else ''

    def get_person_name(self, obj) -> str:
        return str(obj.person) if obj.person_id else ''

    def get_card_code(self, obj) -> str:
        return display(obj.card.code) if obj.card_id else ''


class AccountSerializer(serializers.ModelSerializer):
    people = PersonSerializer(many=True, read_only=True)
    staff = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = ['id', 'status', 'notes', 'revoked_at', 'revoked_reason', 'created_at', 'people', 'staff']

    def get_staff(self, obj):
        """The staff member this membership belongs to (no cover while the owner's switch is on), or None."""
        if not obj.staff_user_id:
            return None
        from apps.thriftplus.services.ledger import staff_free

        user = obj.staff_user
        return {'id': user.pk, 'name': (user.full_name or '').strip() or user.email, 'free': staff_free(obj)}


class AccountDetailSerializer(AccountSerializer):
    events = serializers.SerializerMethodField()

    class Meta(AccountSerializer.Meta):
        fields = AccountSerializer.Meta.fields + ['events']

    def get_events(self, obj) -> list:
        return EventSerializer(obj.events.select_related('actor', 'person', 'card')[:30], many=True).data


class CardBatchSerializer(serializers.ModelSerializer):
    unissued = serializers.SerializerMethodField()
    active = serializers.SerializerMethodField()

    class Meta:
        model = CardBatch
        fields = ['id', 'size', 'note', 'printed_at', 'created_at', 'unissued', 'active']

    def get_unissued(self, obj) -> int:
        return obj.cards.filter(status=Card.STATUS_UNISSUED).count()

    def get_active(self, obj) -> int:
        return obj.cards.filter(status=Card.STATUS_ACTIVE).count()
