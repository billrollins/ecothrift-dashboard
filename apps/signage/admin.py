from django.contrib import admin

from .models import Sign, SignNeedVote, SignNote, SignVersion, SignVersionRank


class SignVersionInline(admin.TabularInline):
    model = SignVersion
    extra = 0
    fields = ('label', 'position', 'pdf', 'preview')
    raw_id_fields = ('pdf', 'preview')


@admin.register(Sign)
class SignAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'stage', 'status', 'quantity', 'copies_up', 'pdf', 'is_active', 'updated_at')
    list_filter = ('stage', 'status', 'is_active')
    search_fields = ('name', 'location', 'note')
    raw_id_fields = ('pdf', 'chosen_version')
    inlines = [SignVersionInline]


@admin.register(SignNeedVote)
class SignNeedVoteAdmin(admin.ModelAdmin):
    list_display = ('sign', 'user', 'needed', 'updated_at')


@admin.register(SignVersionRank)
class SignVersionRankAdmin(admin.ModelAdmin):
    list_display = ('sign', 'version', 'user', 'rank')


@admin.register(SignNote)
class SignNoteAdmin(admin.ModelAdmin):
    list_display = ('sign', 'author', 'created_at')
