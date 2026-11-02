"""Dash Fixes: one list of everything planned for Dash.

Staff report an issue and watch the line. The owner (superuser) accepts, orders and finishes items.
Visibility is enforced here, in the queryset, never only in the UI:
  * superuser sees everything;
  * everyone else sees their own items (any status) plus every non-private item that is
    accepted, working, done or declined. Other people's "new" items stay hidden until accepted;
  * private items are superuser-only.
"""
from django.db import transaction
from django.db.models import F, Max, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff

from .files import save_upload, stream_s3
from . import dash_fix_json
from .models import DashFix, DashFixNote, DashFixPhoto

MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_PHOTOS = 3
PUBLIC_STATUSES = (
    DashFix.STATUS_ACCEPTED, DashFix.STATUS_WORKING, DashFix.STATUS_ALMOST, DashFix.STATUS_HOLD,
    DashFix.STATUS_DONE, DashFix.STATUS_DECLINED,
)


def _is_owner(user) -> bool:
    return bool(getattr(user, 'is_authenticated', False) and getattr(user, 'is_superuser', False))


def visible_fixes(user):
    qs = DashFix.objects.select_related('submitted_by').prefetch_related('notes__author', 'photos', 'depends_on')
    if _is_owner(user):
        return qs
    return qs.filter(private=False).filter(Q(status__in=PUBLIC_STATUSES) | Q(submitted_by=user))


def unanswered_questions():
    return DashFix.objects.exclude(question_for_owner='').filter(owner_answer='').exclude(
        status__in=(DashFix.STATUS_DONE, DashFix.STATUS_DECLINED))


def dash_fix_counts(user) -> int:
    """Bell number. Owner: items waiting for acceptance. Everyone else: own items that changed
    status since they last opened Dash Fixes."""
    if _is_owner(user):
        return (
            DashFix.objects.filter(status=DashFix.STATUS_NEW).count()
            + unanswered_questions().count()
        )
    return (
        DashFix.objects.filter(submitted_by=user, private=False)
        .filter(Q(submitter_seen_at__isnull=True) | Q(status_changed_at__gt=F('submitter_seen_at')))
        .count()
    )


def make_title(details: str) -> str:
    first = (details or '').strip().splitlines()[0].strip() if (details or '').strip() else ''
    return first if len(first) <= 120 else first[:119].rstrip() + '…'


def _repack_line():
    """Keep line ranks 1..n with no gaps (working items keep their place)."""
    rows = list(
        DashFix.objects.filter(status__in=DashFix.LINE_STATUSES).order_by('rank', 'accepted_at', 'id')
    )
    for index, row in enumerate(rows, start=1):
        if row.rank != index:
            DashFix.objects.filter(pk=row.pk).update(rank=index)


def _next_rank() -> int:
    top = DashFix.objects.filter(status__in=DashFix.LINE_STATUSES).aggregate(top=Max('rank'))['top']
    return (top or 0) + 1


class DashFixNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True, default=None)

    class Meta:
        model = DashFixNote
        fields = ['id', 'body', 'author', 'author_name', 'created_at']
        read_only_fields = fields


class DashFixSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source='submitted_by.full_name', read_only=True, default=None)
    notes = DashFixNoteSerializer(many=True, read_only=True)
    photos = serializers.SerializerMethodField()
    depends_on = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    unseen = serializers.SerializerMethodField()

    class Meta:
        model = DashFix
        fields = [
            'id', 'title', 'details', 'page_path', 'kind', 'status', 'rank', 'private',
            'decline_reason', 'done_version', 'done_at', 'accepted_at', 'status_changed_at',
            'created_at', 'submitted_by', 'submitted_by_name', 'photos', 'is_mine', 'unseen', 'notes',
            'size', 'depends_on', 'coder_notes', 'parent', 'project', 'step', 'waiting_on',
            'question_for_owner', 'owner_answer', 'answered_at',
        ]
        read_only_fields = fields

    def _user(self):
        request = self.context.get('request')
        return getattr(request, 'user', None)

    def get_photos(self, obj):
        return [photo.id for photo in obj.photos.all()]

    def get_depends_on(self, obj):
        owner = _is_owner(self._user())
        return sorted(dep.id for dep in obj.depends_on.all() if owner or not dep.private)

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if not _is_owner(self._user()):
            # The coder's notes and the request/task link are the owner's.
            for key in ('coder_notes', 'question_for_owner', 'owner_answer', 'answered_at'):
                data.pop(key, None)
            data.pop('parent', None)
        return data

    def get_is_mine(self, obj):
        user = self._user()
        return bool(user and obj.submitted_by_id == getattr(user, 'pk', None))

    def get_unseen(self, obj):
        if not self.get_is_mine(obj):
            return False
        return obj.submitter_seen_at is None or obj.status_changed_at > obj.submitter_seen_at


class DashFixWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    details = serializers.CharField(max_length=4000, required=False, allow_blank=True, default='')
    page_path = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')
    kind = serializers.ChoiceField(choices=DashFix.KIND_CHOICES, required=False, default=DashFix.KIND_PROBLEM)
    private = serializers.BooleanField(required=False, default=False)
    photos = serializers.ListField(
        child=serializers.ImageField(), required=False, max_length=MAX_PHOTOS,
    )

    def validate_photos(self, value):
        for photo in value:
            if (getattr(photo, 'size', 0) or 0) > MAX_PHOTO_BYTES:
                raise serializers.ValidationError('Photo too large (max 10 MB).')
        return value

    def validate(self, attrs):
        title = (attrs.get('title') or '').strip()
        details = (attrs.get('details') or '').strip()
        if not title and not details:
            raise serializers.ValidationError({'details': 'Say what you need.'})
        if not title:
            title = make_title(details)
        attrs['title'] = title
        return attrs


class NoteWriteSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)

    def validate_body(self, value):
        text = str(value or '').strip()
        if not text:
            raise serializers.ValidationError('Write a note.')
        return text


class DeclineSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000)

    def validate_reason(self, value):
        text = str(value or '').strip()
        if not text:
            raise serializers.ValidationError('Say why.')
        return text


class DoneSerializer(serializers.Serializer):
    version = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')


class AnswerSerializer(serializers.Serializer):
    answer = serializers.CharField(max_length=4000)

    def validate_answer(self, value):
        text = str(value or '').strip()
        if not text:
            raise serializers.ValidationError('Write an answer.')
        return text


class PrivateSerializer(serializers.Serializer):
    private = serializers.BooleanField()


class ReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class DashFixViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsStaff]
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return visible_fixes(self.request.user)

    # -- helpers ------------------------------------------------------------
    def _owner_only(self):
        if not _is_owner(self.request.user):
            raise PermissionDenied('Only the owner can do that.')

    def _out(self, row, code=status.HTTP_200_OK):
        row = visible_fixes(self.request.user).get(pk=row.pk)
        return Response(DashFixSerializer(row, context={'request': self.request}).data, status=code)

    @staticmethod
    def _set_status(row, new_status):
        row.status = new_status
        row.status_changed_at = timezone.now()

    # -- reads --------------------------------------------------------------
    def list(self, request):
        data = DashFixSerializer(self.get_queryset(), many=True, context={'request': request}).data
        return Response(data)

    def retrieve(self, request, pk=None):
        return self._out(self.get_object())

    @action(detail=False, methods=['get'])
    def counts(self, request):
        return Response({'count': dash_fix_counts(request.user)})

    @action(detail=False, methods=['post'])
    def seen(self, request):
        """Opening Dash Fixes marks the person's own items seen (clears their bell number)."""
        DashFix.objects.filter(submitted_by=request.user).update(submitter_seen_at=timezone.now())
        return Response({'count': dash_fix_counts(request.user)})

    @action(detail=True, methods=['get'], url_path=r'photos/(?P<photo_id>[0-9]+)')
    def photo(self, request, pk=None, photo_id=None):
        row = self.get_object()
        photo = row.photos.filter(pk=photo_id).select_related('file').first()
        if photo is None:
            return Response({'detail': 'No photo.'}, status=status.HTTP_404_NOT_FOUND)
        return stream_s3(photo.file)

    # -- reporting ----------------------------------------------------------
    def create(self, request):
        raw = request.data
        if hasattr(raw, 'getlist'):
            raw = {key: raw.get(key) for key in raw.keys() if key not in ('photos', 'photo')}
            raw['photos'] = request.FILES.getlist('photos') + request.FILES.getlist('photo')
        serializer = DashFixWriteSerializer(data=raw)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        now = timezone.now()
        row = DashFix.objects.create(
            title=data['title'],
            details=(data.get('details') or '').strip(),
            page_path=(data.get('page_path') or '').strip(),
            kind=data['kind'],
            private=bool(data.get('private')) and _is_owner(request.user),
            submitted_by=request.user,
            status_changed_at=now,
            submitter_seen_at=now,
        )
        for position, upload in enumerate(data.get('photos') or []):
            DashFixPhoto.objects.create(
                fix=row, position=position,
                file=save_upload(upload, user=request.user, key_prefix='dash-fixes'),
            )
        return self._out(row, status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def notes(self, request, pk=None):
        row = self.get_object()
        if request.method == 'GET':
            return Response(DashFixNoteSerializer(row.notes.all(), many=True).data)
        serializer = NoteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        DashFixNote.objects.create(fix=row, author=request.user, body=serializer.validated_data['body'])
        return self._out(row, status.HTTP_201_CREATED)

    # -- owner actions ------------------------------------------------------
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        self._owner_only()
        with transaction.atomic():
            row = self.get_object()
            if row.status not in DashFix.LINE_STATUSES:
                self._set_status(row, DashFix.STATUS_ACCEPTED)
                row.rank = _next_rank()
                row.accepted_at = timezone.now()
                row.decline_reason = ''
                row.done_at = None
                row.done_version = ''
                row.save()
                _repack_line()
        return self._out(row)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        self._owner_only()
        serializer = DeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            row = self.get_object()
            self._set_status(row, DashFix.STATUS_DECLINED)
            row.decline_reason = serializer.validated_data['reason']
            row.rank = 0
            row.save()
            _repack_line()
        return self._out(row)

    @action(detail=True, methods=['post'])
    def working(self, request, pk=None):
        self._owner_only()
        with transaction.atomic():
            row = self.get_object()
            was_in_line = row.status in DashFix.LINE_STATUSES
            self._set_status(row, DashFix.STATUS_WORKING)
            if not was_in_line:
                row.rank = _next_rank()
                row.accepted_at = row.accepted_at or timezone.now()
                row.decline_reason = ''
                row.done_at = None
                row.done_version = ''
            row.save()
            _repack_line()
        return self._out(row)

    @action(detail=True, methods=['post'])
    def done(self, request, pk=None):
        self._owner_only()
        serializer = DoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            row = self.get_object()
            now = timezone.now()
            self._set_status(row, DashFix.STATUS_DONE)
            row.done_version = (serializer.validated_data.get('version') or '').strip()
            row.done_at = now
            row.accepted_at = row.accepted_at or now
            row.rank = 0
            row.save()
            _repack_line()
        return self._out(row)

    @action(detail=True, methods=['post'])
    def answer(self, request, pk=None):
        self._owner_only()
        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = self.get_object()
        row.owner_answer = serializer.validated_data['answer']
        row.answered_at = timezone.now()
        row.save(update_fields=['owner_answer', 'answered_at', 'updated_at'])
        return self._out(row)

    @action(detail=True, methods=['post'], url_path='private')
    def set_private(self, request, pk=None):
        self._owner_only()
        serializer = PrivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = self.get_object()
        row.private = serializer.validated_data['private']
        row.save(update_fields=['private', 'updated_at'])
        return self._out(row)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Body: {ids: [...]} the line, first to last. Line items left out keep their order after."""
        self._owner_only()
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            line = {r.pk: r for r in DashFix.objects.filter(status__in=DashFix.LINE_STATUSES)}
            ordered = []
            for pk in serializer.validated_data['ids']:
                if pk in line and pk not in ordered:
                    ordered.append(pk)
            rest = [r.pk for r in sorted(line.values(), key=lambda r: (r.rank, r.pk)) if r.pk not in ordered]
            for index, pk in enumerate(ordered + rest, start=1):
                if line[pk].rank != index:
                    DashFix.objects.filter(pk=pk).update(rank=index)
        data = DashFixSerializer(self.get_queryset(), many=True, context={'request': request}).data
        return Response(data)

    # -- AI-first editing (owner) -------------------------------------------
    @action(detail=False, methods=['get'])
    def export(self, request):
        self._owner_only()
        return Response(dash_fix_json.build_bundle())

    @action(detail=False, methods=['post'], url_path='import-check')
    def import_check(self, request):
        self._owner_only()
        result = dash_fix_json.check_doc(request.data.get('doc'), allow_blocked=bool(request.data.get('allow_blocked')))
        return Response({key: result[key] for key in ('ok', 'errors', 'warnings', 'blocked', 'changes')})

    @action(detail=False, methods=['post'], name='import', url_path='import')
    def import_doc(self, request):
        self._owner_only()
        result = dash_fix_json.check_doc(request.data.get('doc'), allow_blocked=bool(request.data.get('allow_blocked')))
        if not result['ok']:
            return Response({key: result[key] for key in ('ok', 'errors', 'warnings', 'blocked', 'changes')},
                            status=status.HTTP_400_BAD_REQUEST)
        dash_fix_json.apply_plan(result['plan'], user=request.user)
        return Response({'ok': True, 'changes': result['changes'], 'warnings': result['warnings']})
