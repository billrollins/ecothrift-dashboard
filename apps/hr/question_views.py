"""HR questions (Bill, Dash Updates #59, 2026-11-03): anyone on the team asks HR a question from the HR app's Requests
tab and sees the answer there; anyone with People at Manage (``hr.questions:answer``) sees everyone's and answers."""
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsTeamMember

from .models import HrQuestion


def question_payload(row: HrQuestion) -> dict:
    return {
        'id': row.pk, 'employee': row.employee_id, 'employee_name': row.employee.full_name,
        'question': row.question, 'status': row.status, 'answer': row.answer,
        'answered_by_name': row.answered_by.full_name if row.answered_by_id else '',
        'answered_at': row.answered_at.isoformat() if row.answered_at else None,
        'created_at': row.created_at.isoformat(),
    }


class HrQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = HrQuestion
        fields = ['question']

    def validate_question(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Write your question.')
        return value


class HrQuestionViewSet(viewsets.GenericViewSet):
    """Ask (for yourself) and list: your own, or everyone's for those who answer. ``?status=open`` filters.
    ``answer`` takes ``{answer}``; answering again replaces it."""
    permission_classes = [IsTeamMember]
    serializer_class = HrQuestionSerializer
    pagination_class = None

    def get_queryset(self):
        qs = HrQuestion.objects.select_related('employee', 'answered_by')
        if not IsManagerOrAdmin().has_permission(self.request, self):
            qs = qs.filter(employee=self.request.user)
        status_ = self.request.query_params.get('status')
        return qs.filter(status=status_) if status_ else qs

    def list(self, request):
        return Response([question_payload(r) for r in self.get_queryset()])

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = serializer.save(employee=request.user)
        return Response(question_payload(HrQuestion.objects.select_related('employee').get(pk=row.pk)),
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def answer(self, request, pk=None):
        row = HrQuestion.objects.select_related('employee').filter(pk=pk).first()
        if row is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        text = str(request.data.get('answer') or '').strip()
        if not text:
            return Response({'answer': 'Write the answer.'}, status=status.HTTP_400_BAD_REQUEST)
        row.answer, row.status = text[:1000], HrQuestion.ANSWERED
        row.answered_by, row.answered_at = request.user, timezone.now()
        row.save(update_fields=['answer', 'status', 'answered_by', 'answered_at'])
        return Response(question_payload(row))
