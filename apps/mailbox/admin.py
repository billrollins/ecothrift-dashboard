from django.contrib import admin

from .models import EmailTemplate, MailMessage, MailSyncState


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'key', 'active', 'updated_at')
    list_filter = ('active',)
    search_fields = ('name', 'key', 'subject')


@admin.register(MailMessage)
class MailMessageAdmin(admin.ModelAdmin):
    list_display = ('subject', 'from_email', 'classification', 'received_at', 'is_read')
    list_filter = ('classification', 'is_read')
    search_fields = ('subject', 'from_email', 'graph_message_id')
    readonly_fields = (
        'graph_message_id', 'graph_conversation_id', 'from_email', 'to_emails',
        'subject', 'html_body', 'text_body', 'received_at', 'is_read',
        'classification', 'conversation', 'attachment_names', 'created_at', 'updated_at',
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MailSyncState)
class MailSyncStateAdmin(admin.ModelAdmin):
    list_display = ('singleton_key', 'last_sync_at')
    readonly_fields = ('singleton_key', 'last_sync_at', 'delta_link')

    def has_add_permission(self, request):
        return False
