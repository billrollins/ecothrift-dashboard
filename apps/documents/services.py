"""Assign a document to people and resolve the audience."""
from __future__ import annotations

from django.contrib.auth import get_user_model

from apps.routines.schedule import STAFF_GROUPS

from .models import DocumentAssignment, DocumentRecipient

User = get_user_model()


def staff_queryset():
    return User.objects.filter(
        is_active=True,
        groups__name__in=STAFF_GROUPS,
    ).distinct()


def audience_users(assignment: DocumentAssignment):
    if assignment.audience == DocumentAssignment.AUDIENCE_PERSON:
        if assignment.assigned_user_id and assignment.assigned_user.is_active:
            return User.objects.filter(pk=assignment.assigned_user_id)
        return User.objects.none()
    qs = staff_queryset()
    if assignment.audience == DocumentAssignment.AUDIENCE_ROLE and assignment.assigned_role:
        if assignment.assigned_role != 'Staff':
            qs = qs.filter(groups__name=assignment.assigned_role)
    elif assignment.audience == DocumentAssignment.AUDIENCE_DEPARTMENT:
        if assignment.assigned_department_id:
            qs = qs.filter(employee__department_id=assignment.assigned_department_id)
        else:
            return User.objects.none()
    return qs


def fan_out_recipients(assignment: DocumentAssignment) -> int:
    created = 0
    for user in audience_users(assignment):
        _, was_created = DocumentRecipient.objects.get_or_create(
            assignment=assignment,
            user=user,
        )
        if was_created:
            created += 1
    return created
