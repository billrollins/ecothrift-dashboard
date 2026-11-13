"""Incident reports (Samantha + Bill, Dash Updates #131, 2026-11-13): HR -> Incidents.

Any staff member files a report on a phone right after something happens on site and sees their own; managers and
the owner see every report, add follow-up notes and close or reopen one. The owner gets a Dash message on each new
report. Nothing is deleted: an edit keeps the old text in the report's history.

    GET  /api/hr/incidents/                 {can_manage, reports: [...]}   ?status=open|closed
    POST /api/hr/incidents/                 multipart or JSON; ``photos`` files; ``map`` = {"plan", "x", "y"}
    GET  /api/hr/incidents/<id>/
    PATCH /api/hr/incidents/<id>/           the reporter while open, or a manager; each change is kept
    POST /api/hr/incidents/<id>/notes/      {body}
    POST /api/hr/incidents/<id>/photos/     more photos
    GET  /api/hr/incidents/<id>/photos/<photo_id>/
    POST /api/hr/incidents/<id>/close/  and  /reopen/   managers; {note} optional
"""
import json
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember
from apps.core.files import save_upload, stream_s3

from .models import IncidentNote, IncidentPhoto, IncidentReport

logger = logging.getLogger(__name__)

MAX_PHOTOS = 8
MAX_PHOTO_BYTES = 15 * 1024 * 1024
INCIDENT_LAYER = 'incidents'
PIN_REF_TYPE = 'hr.incident'
ROLES = ('customer', 'visitor', 'staff', 'vendor', 'other')
# Fields an edit may change, in the order the form shows them.
EDITABLE = (
    'occurred_at', 'kind', 'place', 'place_detail', 'people', 'what_happened', 'injuries', 'first_aid',
    'called_911', 'witnesses', 'cameras', 'follow_up',
)


def _name(user) -> str:
    return (getattr(user, 'full_name', '') or getattr(user, 'email', '') or '').strip() if user else ''


def _pin_payload(pin) -> dict | None:
    if pin is None:
        return None
    return {'id': pin.pk, 'plan': pin.plan_id, 'x': pin.x, 'y': pin.y}


def _shown_pin(row: IncidentReport):
    """The report's pin on the Current map (#130 copies pins onto a newly Current plan), else the one it was marked on."""
    from apps.floorplan.models import MapPin

    if row.map_pin_id is None:
        return None
    current = MapPin.objects.filter(ref_type=PIN_REF_TYPE, ref_id=row.pk, plan__is_current=True).order_by('-id').first()
    return current or row.map_pin


def report_payload(row: IncidentReport, *, full: bool = True) -> dict:
    out = {
        'id': row.pk,
        'occurred_at': row.occurred_at.isoformat(),
        'kind': row.kind,
        'kind_label': row.get_kind_display(),
        'place': row.place,
        'place_label': row.get_place_display(),
        'place_detail': row.place_detail,
        'people': row.people or [],
        'what_happened': row.what_happened,
        'injuries': row.injuries,
        'first_aid': row.first_aid,
        'called_911': row.called_911,
        'status': row.status,
        'reported_by': row.reported_by_id,
        'reported_by_name': _name(row.reported_by),
        'created_at': row.created_at.isoformat(),
        'closed_by_name': _name(row.closed_by),
        'closed_at': row.closed_at.isoformat() if row.closed_at else None,
        'photo_count': len(row.photos.all()),
        'note_count': sum(1 for n in row.notes.all() if n.kind == IncidentNote.KIND_NOTE),
    }
    if full:
        out.update({
            'witnesses': row.witnesses,
            'cameras': row.cameras,
            'follow_up': row.follow_up,
            'map_pin': _pin_payload(_shown_pin(row)),
            'photos': [p.pk for p in row.photos.all()],
            'notes': [
                {
                    'id': n.pk, 'kind': n.kind, 'body': n.body, 'changes': n.changes,
                    'author_name': _name(n.author), 'created_at': n.created_at.isoformat(),
                }
                for n in row.notes.all()
            ],
        })
    return out


class PersonSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ROLES)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    contact = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')


class MapSpotSerializer(serializers.Serializer):
    plan = serializers.IntegerField()
    x = serializers.FloatField()
    y = serializers.FloatField()


class IncidentWriteSerializer(serializers.Serializer):
    occurred_at = serializers.DateTimeField()
    kind = serializers.ChoiceField(choices=IncidentReport.KIND_CHOICES)
    place = serializers.ChoiceField(choices=IncidentReport.PLACE_CHOICES)
    place_detail = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    people = PersonSerializer(many=True, required=False, default=list)
    what_happened = serializers.CharField(max_length=6000)
    injuries = serializers.CharField(max_length=3000, required=False, allow_blank=True, default='')
    first_aid = serializers.BooleanField(required=False, default=False)
    called_911 = serializers.BooleanField(required=False, default=False)
    witnesses = serializers.CharField(max_length=3000, required=False, allow_blank=True, default='')
    cameras = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')
    follow_up = serializers.CharField(max_length=3000, required=False, allow_blank=True, default='')
    map = MapSpotSerializer(required=False, allow_null=True, default=None)
    photos = serializers.ListField(child=serializers.ImageField(), required=False, max_length=MAX_PHOTOS)

    def validate_what_happened(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Say what happened.')
        return value

    def validate_occurred_at(self, value):
        if value > timezone.now() + timedelta(minutes=10):
            raise serializers.ValidationError('That time is in the future.')
        return value

    def validate_people(self, value):
        # A row with nothing but a role still says who was involved; keep it.
        return [{k: str(p.get(k) or '').strip() for k in ('role', 'name', 'contact')} for p in value][:20]

    def validate_photos(self, value):
        for photo in value:
            if (getattr(photo, 'size', 0) or 0) > MAX_PHOTO_BYTES:
                raise serializers.ValidationError('Photo too large (max 15 MB).')
        return value


def _form_data(request) -> dict:
    """Multipart sends ``people`` and ``map`` as JSON text and booleans as 'true'/'false'; JSON sends them as is."""
    raw = request.data
    if not hasattr(raw, 'getlist'):
        return dict(raw)
    data = {key: raw.get(key) for key in raw.keys() if key not in ('photos', 'photo')}
    for key in ('people', 'map'):
        if isinstance(data.get(key), str):
            text = data[key].strip()
            try:
                data[key] = json.loads(text) if text else None
            except ValueError:
                raise serializers.ValidationError({key: 'Could not read this.'})
    if data.get('people') is None:
        data.pop('people', None)
    photos = request.FILES.getlist('photos') + request.FILES.getlist('photo')
    if photos:
        data['photos'] = photos
    return data


def _pin_name(report: IncidentReport) -> str:
    when = timezone.localtime(report.occurred_at)
    return f'{report.get_kind_display()} · {when:%b} {when.day}'[:120]


def notify_owner(report: IncidentReport) -> None:
    """The owner's Dash message (the bell's Messages row) on a new report. A failure never loses the report."""
    from apps.accounts.models import User
    from apps.accounts.services import staff_messages

    reporter = report.reported_by
    when = timezone.localtime(report.occurred_at)
    subject = f'Incident report: {report.get_kind_display()}, {report.get_place_display()}'
    lines = [
        f'{_name(reporter)} filed an incident report.',
        f'When: {when:%a %b} {when.day}, {when:%I:%M %p}'.replace(' 0', ' '),
        f'Where: {report.get_place_display()}' + (f' ({report.place_detail})' if report.place_detail else ''),
        f'What happened: {report.what_happened[:600]}',
    ]
    if report.called_911:
        lines.append('911 was called.')
    lines.append(f'Open it in HR > Incidents: /hr/incidents?report={report.pk}')
    body = '\n'.join(lines)
    for owner in User.objects.filter(is_superuser=True, is_active=True).exclude(pk=reporter.pk).order_by('pk'):
        try:
            staff_messages.start_thread(reporter, subject=subject, body=body, to_user=owner, system=True)
        except Exception:  # noqa: BLE001 - the report is saved; the notice is a courtesy
            logger.exception('incident %s: owner notice failed', report.pk)


class IncidentReportViewSet(viewsets.GenericViewSet):
    permission_classes = [IsTeamMember]
    pagination_class = None
    lookup_value_regex = r'\d+'

    def _can_manage(self) -> bool:
        return IsManagerOrAdmin().has_permission(self.request, self)

    def get_queryset(self):
        qs = IncidentReport.objects.select_related('reported_by', 'closed_by', 'map_pin').prefetch_related(
            'photos', 'notes__author',
        )
        if not self._can_manage():
            qs = qs.filter(reported_by=self.request.user)
        return qs

    def _out(self, row_id: int, code=status.HTTP_200_OK):
        return Response(report_payload(self.get_queryset().get(pk=row_id)), status=code)

    def list(self, request):
        qs = self.get_queryset()
        status_ = request.query_params.get('status')
        if status_ in (IncidentReport.STATUS_OPEN, IncidentReport.STATUS_CLOSED):
            qs = qs.filter(status=status_)
        return Response({
            'can_manage': self._can_manage(),
            'reports': [report_payload(r, full=False) for r in qs[:500]],
        })

    def retrieve(self, request, pk=None):
        return Response(report_payload(self.get_object()))

    def create(self, request):
        serializer = IncidentWriteSerializer(data=_form_data(request))
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        photos = data.pop('photos', None) or []
        spot = data.pop('map', None)
        with transaction.atomic():
            row = IncidentReport.objects.create(reported_by=request.user, **data)
            pin = _place_pin_for(row, spot, request.user)
            if pin is not None:
                row.map_pin = pin
                row.save(update_fields=['map_pin'])
            for position, upload in enumerate(photos):
                IncidentPhoto.objects.create(
                    report=row, position=position, added_by=request.user,
                    file=save_upload(upload, user=request.user, key_prefix='incidents'),
                )
            transaction.on_commit(lambda: notify_owner(IncidentReport.objects.select_related('reported_by').get(pk=row.pk)))
        return self._out(row.pk, status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        row = self.get_object()
        if not self._can_manage() and not (row.reported_by_id == request.user.pk and row.status == row.STATUS_OPEN):
            raise PermissionDenied('A manager edits a closed report.')
        current = {f: getattr(row, f) for f in EDITABLE}
        merged = {**{f: (v.isoformat() if f == 'occurred_at' else v) for f, v in current.items()}, **_form_data(request)}
        merged.pop('photos', None)
        spot_given = 'map' in request.data
        serializer = IncidentWriteSerializer(data=merged)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        spot = data.pop('map', None)
        data.pop('photos', None)
        changes = {}
        for field in EDITABLE:
            old, new = current[field], data[field]
            if old != new:
                changes[field] = {
                    'old': old.isoformat() if field == 'occurred_at' else old,
                    'new': new.isoformat() if field == 'occurred_at' else new,
                }
                setattr(row, field, new)
        with transaction.atomic():
            if spot_given:
                old_pin = _pin_payload(_shown_pin(row))
                new_spot = (spot['plan'], spot['x'], spot['y']) if spot else None
                old_spot = (old_pin['plan'], old_pin['x'], old_pin['y']) if old_pin else None
                if new_spot != old_spot:
                    # The old spot is kept in the history. On the Current map the report has one pin (a past
                    # version keeps the pin it had: #130 copies pins onto a newly Current plan).
                    _clear_current_pins(row)
                    row.map_pin = _place_pin_for(row, spot, request.user)
                    changes['map'] = {'old': old_pin, 'new': _pin_payload(row.map_pin)}
            if changes:
                row.save()
                IncidentNote.objects.create(report=row, kind=IncidentNote.KIND_EDIT, changes=changes, author=request.user)
        return self._out(row.pk)

    @action(detail=True, methods=['post'])
    def notes(self, request, pk=None):
        row = self.get_object()
        body = str(request.data.get('body') or '').strip()
        if not body:
            return Response({'body': 'Write a note.'}, status=status.HTTP_400_BAD_REQUEST)
        IncidentNote.objects.create(report=row, kind=IncidentNote.KIND_NOTE, body=body[:4000], author=request.user)
        return self._out(row.pk, status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path=r'photos/(?P<photo_id>[0-9]+)')
    def photo(self, request, pk=None, photo_id=None):
        row = self.get_object()
        photo = row.photos.filter(pk=photo_id).select_related('file').first()
        if photo is None:
            return Response({'detail': 'No photo.'}, status=status.HTTP_404_NOT_FOUND)
        return stream_s3(photo.file)

    @action(detail=True, methods=['post'], url_path='photos')
    def add_photos(self, request, pk=None):
        row = self.get_object()
        files = request.FILES.getlist('photos') + request.FILES.getlist('photo')
        room = MAX_PHOTOS - row.photos.count()
        if not files:
            return Response({'photos': 'Add a photo.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > room:
            return Response({'photos': f'A report holds {MAX_PHOTOS} photos.'}, status=status.HTTP_400_BAD_REQUEST)
        field = serializers.ListField(child=serializers.ImageField())
        try:
            files = field.run_validation(files)
        except serializers.ValidationError as exc:
            return Response({'photos': exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        if any((getattr(f, 'size', 0) or 0) > MAX_PHOTO_BYTES for f in files):
            return Response({'photos': 'Photo too large (max 15 MB).'}, status=status.HTTP_400_BAD_REQUEST)
        start = row.photos.count()
        with transaction.atomic():
            for i, upload in enumerate(files):
                IncidentPhoto.objects.create(
                    report=row, position=start + i, added_by=request.user,
                    file=save_upload(upload, user=request.user, key_prefix='incidents'),
                )
            IncidentNote.objects.create(
                report=row, kind=IncidentNote.KIND_PHOTO, author=request.user,
                body=f'{len(files)} photo{"s" if len(files) != 1 else ""} added',
            )
        return self._out(row.pk, status.HTTP_201_CREATED)

    def _set_status(self, request, new_status: str, kind: str):
        if not self._can_manage():
            raise PermissionDenied('A manager or the owner closes a report.')
        row = self.get_object()
        if row.status == new_status:
            return self._out(row.pk)
        note = str(request.data.get('note') or '').strip()[:4000]
        with transaction.atomic():
            row.status = new_status
            row.closed_by = request.user if new_status == row.STATUS_CLOSED else None
            row.closed_at = timezone.now() if new_status == row.STATUS_CLOSED else None
            row.save(update_fields=['status', 'closed_by', 'closed_at', 'updated_at'])
            IncidentNote.objects.create(report=row, kind=kind, body=note, author=request.user)
        return self._out(row.pk)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        return self._set_status(request, IncidentReport.STATUS_CLOSED, IncidentNote.KIND_CLOSED)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        return self._set_status(request, IncidentReport.STATUS_OPEN, IncidentNote.KIND_REOPENED)


def _clear_current_pins(report: IncidentReport) -> None:
    """Take the report's pins off the Current plan (its own pin or #130's copies of it). Past versions keep theirs."""
    from apps.floorplan.models import MapPin

    MapPin.objects.filter(ref_type=PIN_REF_TYPE, ref_id=report.pk, plan__is_current=True).delete()


def _place_pin_for(report: IncidentReport, spot: dict | None, user):
    from apps.floorplan.models import FloorPlan, MapLayer, MapPin

    if not spot:
        return None
    layer = MapLayer.objects.filter(slug=INCIDENT_LAYER, is_active=True).first()
    plan = FloorPlan.objects.filter(pk=spot['plan'], is_active=True, is_current=True).first()
    if layer is None or plan is None:
        raise serializers.ValidationError({'map': 'That store map is not available any more. Pick the spot again.'})
    from apps.floorplan.serializers import PIN_MARGIN

    settings_ = (plan.data or {}).get('settings') or {}
    for key, limit in (('x', settings_.get('planWidth')), ('y', settings_.get('planHeight'))):
        limit = float(limit or 0) or 100_000
        if not (-PIN_MARGIN <= spot[key] <= limit + PIN_MARGIN):
            raise serializers.ValidationError({'map': 'That spot is off the map.'})
    return MapPin.objects.create(
        plan=plan, layer=layer, x=spot['x'], y=spot['y'], name=_pin_name(report),
        ref_type=PIN_REF_TYPE, ref_id=report.pk, created_by=user,
    )
