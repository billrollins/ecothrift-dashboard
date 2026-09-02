from django.contrib import admin

from .models import Document, DocumentAssignment, DocumentField, DocumentRecipient


class DocumentFieldInline(admin.TabularInline):
    model = DocumentField
    extra = 0


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'mode', 'page_count', 'is_active')
    list_filter = ('mode', 'is_active')
    search_fields = ('title',)
    inlines = [DocumentFieldInline]


@admin.register(DocumentAssignment)
class DocumentAssignmentAdmin(admin.ModelAdmin):
    list_display = ('document', 'audience', 'assigned_by', 'created_at')


@admin.register(DocumentRecipient)
class DocumentRecipientAdmin(admin.ModelAdmin):
    list_display = ('assignment', 'user', 'status', 'completed_at')
    list_filter = ('status',)
