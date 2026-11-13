from django.db import transaction
from django.db.models import Count, Max, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.core.files import save_upload, stream_s3, validate_pdf
from apps.floorplan.models import MapPin

from .files import save_version_files, validate_png
from .models import SIGN_REF_TYPE, Sign, SignNeedVote, SignNote, SignVersion, SignVersionRank
from .serializers import SignSerializer
from .voting import approve_block_now, pick_next, vote_context


def current_pin_counts(sign_ids=None):
    """Spots per sign on the Current store maps (pins on other plans are history, not where a sign hangs)."""
    qs = MapPin.objects.filter(ref_type=SIGN_REF_TYPE, plan__is_current=True, plan__is_active=True)
    if sign_ids is not None:
        qs = qs.filter(ref_id__in=sign_ids)
    return dict(qs.values('ref_id').annotate(n=Count('id')).values_list('ref_id', 'n'))


# What every staff member may do; everything else is a manager's.
STAFF_ACTIONS = {'list', 'retrieve', 'vote', 'rank', 'notes', 'note_detail', 'version_file'}


class SignViewSet(viewsets.ModelViewSet):
    """Store signs (#106) with drafts and staff voting (#122).

    - ``GET signs/?stage=draft|production&status=to_make|printed|up``.
    - ``GET signs/{id}/pdf/`` streams the print PDF (``?download=1`` as a file); ``POST`` a multipart ``file`` to set or
      replace it; ``DELETE`` takes it off. Files live in the shared file store (``core.S3File``).
    - Drafts: ``POST signs/{id}/vote/ {needed}``; ``POST signs/{id}/rank/ {version}`` gives that version the person's
      next rank (``{clear: true}`` starts over); ``POST signs/{id}/notes/ {text}``, ``DELETE signs/{id}/notes/{nid}/``.
    - Versions (managers): ``POST signs/{id}/versions/`` multipart ``pdf`` (+ ``png`` preview, drawn from the PDF when
      missing) and ``label``; ``DELETE signs/{id}/versions/{vid}/``. Anyone on staff:
      ``GET signs/{id}/versions/{vid}/pdf/`` or ``.../preview/``.
    - ``POST signs/{id}/approve/ {version}`` (managers): a draft goes to production with that version; on a production
      sign it switches the version in use. The version's PDF becomes the sign's print PDF. A draft needs 3 people's
      full votes, the approver's among them (#128); a theme is the owner's alone, draft or production.
    - Delete hides the sign and drops its pins from the store map. Renaming a sign renames its pins.
    """
    lookup_value_regex = r'\d+'
    serializer_class = SignSerializer
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in STAFF_ACTIONS or (self.action == 'pdf' and self.request.method == 'GET'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = (
            Sign.objects.filter(is_active=True)
            .select_related('pdf')
            .prefetch_related(
                Prefetch('versions', queryset=SignVersion.objects.select_related('pdf')),
                Prefetch('notes', queryset=SignNote.objects.select_related('author')),
            )
        )
        stage = self.request.query_params.get('stage')
        if stage in dict(Sign.STAGE_CHOICES):
            qs = qs.filter(stage=stage)
        wanted = self.request.query_params.get('status')
        if wanted in dict(Sign.STATUS_CHOICES):
            qs = qs.filter(status=wanted)
        return qs

    def _context_for(self, signs):
        context = self.get_serializer_context()
        context['pin_counts'] = current_pin_counts([s.id for s in signs])
        context['votes'] = vote_context([s for s in signs if s.stage == Sign.STAGE_DRAFT], self.request.user)
        return context

    def _out(self, sign, code=status.HTTP_200_OK):
        sign = self.get_queryset().get(pk=sign.pk)
        return Response(SignSerializer(sign, context=self._context_for([sign])).data, status=code)

    def list(self, request, *args, **kwargs):
        signs = list(self.get_queryset())
        return Response(SignSerializer(signs, many=True, context=self._context_for(signs)).data)

    def retrieve(self, request, *args, **kwargs):
        return self._out(self.get_object())

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sign = serializer.save(created_by=request.user)
        return self._out(sign, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        sign = self.get_object()
        old_name = sign.name
        serializer = self.get_serializer(sign, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        sign = serializer.save()
        if sign.name != old_name:
            MapPin.objects.filter(ref_type=SIGN_REF_TYPE, ref_id=sign.id).update(name=sign.name)
        return self._out(sign)

    def destroy(self, request, *args, **kwargs):
        sign = self.get_object()
        with transaction.atomic():
            MapPin.objects.filter(ref_type=SIGN_REF_TYPE, ref_id=sign.id).delete()
            sign.is_active = False
            sign.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='pdf')
    def pdf(self, request, pk=None):
        sign = self.get_object()
        if request.method == 'GET':
            if not sign.pdf_id:
                return Response({'detail': 'This sign has no PDF yet.'}, status=status.HTTP_404_NOT_FOUND)
            return stream_s3(sign.pdf, as_attachment=request.query_params.get('download') == '1')
        if request.method == 'DELETE':
            sign.pdf = None
            sign.save(update_fields=['pdf', 'updated_at'])
            return self._out(sign)
        uploaded = request.FILES.get('file')
        problem = validate_pdf(uploaded)
        if problem:
            return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        sign.pdf = save_upload(uploaded, user=request.user, key_prefix='signage')
        sign.save(update_fields=['pdf', 'updated_at'])
        return self._out(sign)

    # ---- staff voting on drafts ----

    def _draft(self):
        sign = self.get_object()
        if sign.stage != Sign.STAGE_DRAFT:
            return sign, Response({'detail': 'Voting is for drafts; this sign is in production.'},
                                  status=status.HTTP_400_BAD_REQUEST)
        return sign, None

    @action(detail=True, methods=['post'])
    def vote(self, request, pk=None):
        sign, refused = self._draft()
        if refused:
            return refused
        needed = request.data.get('needed')
        if not isinstance(needed, bool):
            return Response({'detail': 'Say yes or no.'}, status=status.HTTP_400_BAD_REQUEST)
        SignNeedVote.objects.update_or_create(sign=sign, user=request.user, defaults={'needed': needed})
        return self._out(sign)

    @action(detail=True, methods=['post'])
    def rank(self, request, pk=None):
        sign, refused = self._draft()
        if refused:
            return refused
        with transaction.atomic():
            if request.data.get('clear'):
                SignVersionRank.objects.filter(sign=sign, user=request.user).delete()
            else:
                version = sign.versions.filter(pk=request.data.get('version')).first()
                if not version:
                    return Response({'detail': 'Pick one of this sign\'s versions.'}, status=status.HTTP_400_BAD_REQUEST)
                pick_next(sign, request.user, version)
        return self._out(sign)

    @action(detail=True, methods=['post'])
    def notes(self, request, pk=None):
        sign = self.get_object()
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'Write the note first.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(text) > 2000:
            return Response({'detail': 'Keep the note under 2,000 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        SignNote.objects.create(sign=sign, author=request.user, text=text)
        return self._out(sign, status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'notes/(?P<note_id>\d+)')
    def note_detail(self, request, pk=None, note_id=None):
        sign = self.get_object()
        note = get_object_or_404(SignNote, pk=note_id, sign=sign)
        if note.author_id != request.user.id and not IsManagerOrAdmin().has_permission(request, self):
            return Response({'detail': 'Only the writer or a manager can take a note off.'},
                            status=status.HTTP_403_FORBIDDEN)
        note.delete()
        return self._out(sign)

    # ---- versions ----

    @action(detail=True, methods=['post'])
    def versions(self, request, pk=None):
        sign = self.get_object()
        pdf, png = request.FILES.get('pdf'), request.FILES.get('png')
        problem = validate_pdf(pdf) or (validate_png(png) if png else None)
        if problem:
            return Response({'detail': problem}, status=status.HTTP_400_BAD_REQUEST)
        label = (request.data.get('label') or '').strip()[:120]
        if not label:
            label = (pdf.name or 'Version').rsplit('.', 1)[0][:120]
        with transaction.atomic():
            pdf_file, preview = save_version_files(pdf, png, user=request.user)
            position = (sign.versions.aggregate(m=Max('position'))['m'] or 0) + 1
            SignVersion.objects.create(
                sign=sign, label=label, pdf=pdf_file, preview=preview, position=position, created_by=request.user,
            )
        return self._out(sign, status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'versions/(?P<version_id>\d+)')
    def version_detail(self, request, pk=None, version_id=None):
        sign = self.get_object()
        version = get_object_or_404(SignVersion, pk=version_id, sign=sign)
        if sign.chosen_version_id == version.id:
            return Response({'detail': 'This is the version in use. Choose another one first.'},
                            status=status.HTTP_400_BAD_REQUEST)
        version.delete()
        return self._out(sign)

    @action(detail=True, methods=['get'], url_path=r'versions/(?P<version_id>\d+)/(?P<kind>pdf|preview)')
    def version_file(self, request, pk=None, version_id=None, kind=None):
        sign = self.get_object()
        version = get_object_or_404(SignVersion, pk=version_id, sign=sign)
        s3 = version.pdf if kind == 'pdf' else version.preview
        if not s3:
            return Response({'detail': 'This version has no such file.'}, status=status.HTTP_404_NOT_FOUND)
        return stream_s3(s3, as_attachment=request.query_params.get('download') == '1')

    # ---- a manager's approval ----

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        sign = self.get_object()
        version = sign.versions.filter(pk=request.data.get('version')).first()
        if not version:
            return Response({'detail': 'Pick the winning version.'}, status=status.HTTP_400_BAD_REQUEST)
        if sign.kind == Sign.KIND_THEME and not request.user.is_superuser:
            return Response({'detail': 'Only the owner approves a theme.'}, status=status.HTTP_403_FORBIDDEN)
        if sign.stage == Sign.STAGE_DRAFT:
            block = approve_block_now(sign, request.user)
            if block:
                return Response({'detail': block['detail']}, status=status.HTTP_400_BAD_REQUEST)
        fields = ['chosen_version', 'pdf', 'updated_at']
        sign.chosen_version = version
        sign.pdf = version.pdf
        if sign.stage == Sign.STAGE_DRAFT:
            sign.stage = Sign.STAGE_PRODUCTION
            sign.status = Sign.STATUS_TO_MAKE
            sign.approved_by = request.user
            sign.approved_at = timezone.now()
            fields += ['stage', 'status', 'approved_by', 'approved_at']
        sign.save(update_fields=fields)
        return self._out(sign)
