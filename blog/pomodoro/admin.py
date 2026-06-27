from django.contrib import admin

from .models import StudySession


@admin.register(StudySession)
class StudySessionAdmin(admin.ModelAdmin):
    list_display = ("task", "session_type", "duration_seconds", "completed", "started_at")
    list_filter = ("session_type", "completed")
    search_fields = ("task",)
