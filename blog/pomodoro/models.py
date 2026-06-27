from django.db import models


class StudySession(models.Model):
    SESSION_FOCUS = "focus"
    SESSION_SHORT_BREAK = "short_break"
    SESSION_LONG_BREAK = "long_break"
    SESSION_CHOICES = [
        (SESSION_FOCUS, "Focus"),
        (SESSION_SHORT_BREAK, "Short Break"),
        (SESSION_LONG_BREAK, "Long Break"),
    ]

    task = models.CharField(max_length=200, blank=True, default="")
    session_type = models.CharField(max_length=20, choices=SESSION_CHOICES)
    duration_seconds = models.PositiveIntegerField()
    completed = models.BooleanField(default=True)
    started_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.get_session_type_display()} — {self.duration_seconds}s"
