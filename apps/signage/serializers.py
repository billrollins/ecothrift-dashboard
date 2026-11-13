from rest_framework import serializers

from .models import Sign, SignNote


class SignNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = SignNote
        fields = ['id', 'author', 'author_name', 'text', 'created_at']
        read_only_fields = fields

    def get_author_name(self, obj):
        if not obj.author_id:
            return 'Someone'
        return obj.author.full_name or obj.author.email


class SignSerializer(serializers.ModelSerializer):
    """A store sign. ``pins`` = spots on the Current store maps and ``pins_up`` = those marked Up (filled by the
    view); the PDF is its own endpoint. #129: the sign itself is only Draft or Production (``stage``); To hang / Up
    lives on each spot (``MapPin.status``). ``Sign.status`` and ``copies_up`` stay in the table but are not served.

    Drafts (#122) carry the reader's own votes and, once they have voted, everyone's results (``votes``, filled by
    the view). Versions are listed in their upload order; the page sorts them by average rank.
    """
    pdf_name = serializers.SerializerMethodField()
    pdf_size = serializers.SerializerMethodField()
    pins = serializers.SerializerMethodField()
    pins_up = serializers.SerializerMethodField()
    versions = serializers.SerializerMethodField()
    preview_version = serializers.SerializerMethodField()
    votes = serializers.SerializerMethodField()
    notes = SignNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Sign
        fields = [
            'id', 'name', 'stage', 'kind', 'slug', 'dash_update', 'location',  'quantity', 'note',
            'pdf_name', 'pdf_size', 'pins', 'pins_up', 'versions', 'chosen_version', 'preview_version', 'votes', 'notes',
            'approved_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['slug', 'dash_update', 'chosen_version', 'approved_at', 'created_at', 'updated_at']

    def get_pdf_name(self, obj):
        return obj.pdf.filename if obj.pdf_id else None

    def get_pdf_size(self, obj):
        return obj.pdf.size if obj.pdf_id else None

    def get_pins(self, obj):
        return (self.context.get('pin_counts') or {}).get(obj.id, (0, 0))[0]

    def get_pins_up(self, obj):
        return (self.context.get('pin_counts') or {}).get(obj.id, (0, 0))[1]

    def _votes(self, obj):
        return (self.context.get('votes') or {}).get(obj.id)

    def get_versions(self, obj):
        votes = self._votes(obj) or {}
        mine = votes.get('my_ranks') or {}
        per = ((votes.get('results') or {}).get('versions')) or {}
        return [
            {
                'id': v.id,
                'label': v.label,
                'position': v.position,
                'has_pdf': bool(v.pdf_id),
                'has_preview': bool(v.preview_id),
                'pdf_name': v.pdf.filename if v.pdf_id else None,
                'my_rank': mine.get(v.id),
                # Everyone's numbers only after this person has voted.
                'avg_rank': per.get(v.id, {}).get('avg_rank'),
                'rankers': per.get(v.id, {}).get('rankers'),
                'firsts': per.get(v.id, {}).get('firsts'),
            }
            for v in obj.versions.all()
        ]

    def get_preview_version(self, obj):
        """The version whose PNG stands for the sign on the list: the chosen one, else the first with a preview."""
        if obj.chosen_version_id:
            return obj.chosen_version_id
        return next((v.id for v in obj.versions.all() if v.preview_id), None)

    def get_votes(self, obj):
        votes = self._votes(obj)
        if not votes:
            return None
        block = votes.get('approve_block')
        return {k: v for k, v in votes.items() if k in ('my_needed', 'has_voted')} | {
            # #128: why this reader cannot approve yet (button text), or None. Only managers see the button.
            'approve_block': block['label'] if block else None,
            'results': None if not votes['results'] else {
                k: votes['results'][k]
                for k in ('needed_yes', 'needed_no', 'needed_pct', 'voters', 'top_version_id', 'top_version_label')
            },
        }

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Give the sign a name.')
        return value

    def validate_location(self, value):
        return (value or '').strip()

    def validate_quantity(self, value):
        if value > 500:
            raise serializers.ValidationError('That is more copies than the store has walls.')
        return value

