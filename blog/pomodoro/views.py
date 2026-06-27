import json
from datetime import timedelta

from django.db.models import Sum
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import StudySession


def index(request):
    return render(request, "pomodoro/index.html")


def _session_to_dict(session):
    return {
        "id": session.id,
        "task": session.task,
        "session_type": session.session_type,
        "duration_seconds": session.duration_seconds,
        "completed": session.completed,
        "started_at": session.started_at.isoformat(),
    }


@require_http_methods(["GET"])
def stats(request):
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    focus_qs = StudySession.objects.filter(
        session_type=StudySession.SESSION_FOCUS, completed=True
    )

    today_seconds = (
        focus_qs.filter(started_at__gte=today_start).aggregate(
            total=Sum("duration_seconds")
        )["total"]
        or 0
    )
    week_seconds = (
        focus_qs.filter(started_at__gte=week_start).aggregate(
            total=Sum("duration_seconds")
        )["total"]
        or 0
    )
    total_seconds = focus_qs.aggregate(total=Sum("duration_seconds"))["total"] or 0
    today_pomodoros = focus_qs.filter(started_at__gte=today_start).count()

    return JsonResponse(
        {
            "today_seconds": today_seconds,
            "week_seconds": week_seconds,
            "total_seconds": total_seconds,
            "today_pomodoros": today_pomodoros,
        }
    )


@require_http_methods(["GET", "POST"])
@csrf_exempt
def sessions(request):
    if request.method == "GET":
        recent = StudySession.objects.all()[:20]
        return JsonResponse({"sessions": [_session_to_dict(s) for s in recent]})

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    required = ("session_type", "duration_seconds", "started_at")
    for field in required:
        if field not in data:
            return JsonResponse({"error": f"Missing field: {field}"}, status=400)

    started_at = parse_datetime(data["started_at"])
    if started_at is None:
        return JsonResponse({"error": "Invalid started_at"}, status=400)
    if timezone.is_naive(started_at):
        started_at = timezone.make_aware(started_at)

    session = StudySession.objects.create(
        task=data.get("task", ""),
        session_type=data["session_type"],
        duration_seconds=int(data["duration_seconds"]),
        completed=data.get("completed", True),
        started_at=started_at,
    )
    return JsonResponse({"session": _session_to_dict(session)}, status=201)
