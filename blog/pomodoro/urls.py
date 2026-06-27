from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="pomodoro_index"),
    path("api/stats/", views.stats, name="pomodoro_stats"),
    path("api/sessions/", views.sessions, name="pomodoro_sessions"),
]
