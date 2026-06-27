(function () {
  "use strict";

  const MAX_MINUTES = 120;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 120;

  const PHASE = {
    IDLE: "idle",
    FOCUS: "focus",
    BREAK: "break",
    AWAITING_START: "awaiting_start",
  };

  const state = {
    phase: PHASE.IDLE,
    baseMinutes: 25,
    extraMinutes: 0,
    focusMinutes: 25,
    breakMinutes: 5,
    secondsLeft: 25 * 60,
    totalSeconds: 25 * 60,
    running: false,
    intervalId: null,
    sessionStart: null,
    warningShown: false,
    sound: true,
  };

  const els = {
    body: document.body,
    timerDisplay: document.getElementById("timer-display"),
    timerLabel: document.getElementById("timer-label"),
    ringProgress: document.getElementById("ring-progress"),
    btnStart: document.getElementById("btn-start"),
    btnPause: document.getElementById("btn-pause"),
    btnReset: document.getElementById("btn-reset"),
    btnAddTime: document.getElementById("btn-add-time"),
    durationPicker: document.getElementById("duration-picker"),
    durationBtns: document.querySelectorAll(".duration-btn[data-minutes]"),
    durationTotal: document.getElementById("duration-total"),
    controlsNormal: document.getElementById("controls-normal"),
    startPrompt: document.getElementById("start-prompt"),
    startInput: document.getElementById("start-input"),
    startHint: document.getElementById("start-hint"),
    sessionStatus: document.getElementById("session-status"),
    taskInput: document.getElementById("task-input"),
    warningInline: document.getElementById("warning-inline"),
    btnWarningOk: document.getElementById("btn-warning-ok"),
    statTodayTime: document.getElementById("stat-today-time"),
    statTodayPomodoros: document.getElementById("stat-today-pomodoros"),
    statWeekTime: document.getElementById("stat-week-time"),
    statTotalTime: document.getElementById("stat-total-time"),
    historyList: document.getElementById("history-list"),
  };

  function getTotalFocusMinutes() {
    return state.baseMinutes + state.extraMinutes;
  }

  function getBreakMinutes(focusMin) {
    return focusMin >= 60 ? 10 : 5;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function updateRing() {
    const progress = state.totalSeconds > 0 ? state.secondsLeft / state.totalSeconds : 0;
    els.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  }

  function updateDurationDisplay() {
    const total = getTotalFocusMinutes();
    els.durationTotal.textContent = `total: ${total} min`;
    els.durationTotal.classList.toggle("over-limit", total > MAX_MINUTES);
  }

  function setFocusDuration(baseMinutes, extraMinutes = state.extraMinutes) {
    state.baseMinutes = baseMinutes;
    state.extraMinutes = extraMinutes;
    state.focusMinutes = getTotalFocusMinutes();
    state.breakMinutes = getBreakMinutes(state.focusMinutes);

    els.durationBtns.forEach((btn) => {
      btn.classList.toggle("active", parseInt(btn.dataset.minutes, 10) === baseMinutes);
    });

    updateDurationDisplay();

    if (state.phase === PHASE.IDLE || state.phase === PHASE.AWAITING_START) {
      applyFocusTimer();
    }

    if (state.focusMinutes > MAX_MINUTES && !state.warningShown) {
      showWarning();
    }
  }

  function applyFocusTimer() {
    state.totalSeconds = state.focusMinutes * 60;
    state.secondsLeft = state.totalSeconds;
    els.timerDisplay.textContent = formatTime(state.secondsLeft);
    els.timerLabel.textContent = "focus session";
    updateRing();
  }

  function applyBreakTimer() {
    state.totalSeconds = state.breakMinutes * 60;
    state.secondsLeft = state.totalSeconds;
    els.timerDisplay.textContent = formatTime(state.secondsLeft);
    els.timerLabel.textContent = `${state.breakMinutes} min break`;
    updateRing();
  }

  function setPhase(phase) {
    state.phase = phase;
    els.body.classList.remove("mode-focus", "mode-break", "awaiting-start");

    if (phase === PHASE.BREAK) {
      els.body.classList.add("mode-break");
    } else {
      els.body.classList.add("mode-focus");
    }

    if (phase === PHASE.AWAITING_START) {
      els.body.classList.add("awaiting-start");
    }

    const locked = phase === PHASE.FOCUS || phase === PHASE.BREAK;
    els.durationPicker.classList.toggle("locked", locked);

    els.startPrompt.classList.toggle("is-hidden", phase !== PHASE.AWAITING_START);
    els.controlsNormal.classList.toggle("is-hidden", phase === PHASE.AWAITING_START);

    if (phase === PHASE.AWAITING_START) {
      els.startInput.value = "";
      els.startInput.classList.remove("valid");
      els.startHint.textContent = "stay focused — type start when ready";
      els.startHint.classList.remove("error");
      els.startInput.focus();
    }

    updateStatusText();
  }

  function updateStatusText() {
    switch (state.phase) {
      case PHASE.IDLE:
        els.sessionStatus.textContent = "pick a length & hit start";
        break;
      case PHASE.FOCUS:
        els.sessionStatus.textContent = state.running
          ? `studying — ${state.focusMinutes} min session`
          : "paused";
        break;
      case PHASE.BREAK:
        els.sessionStatus.textContent = state.running
          ? `break time — ${state.breakMinutes} min`
          : "break paused";
        break;
      case PHASE.AWAITING_START:
        els.sessionStatus.textContent = "type start to begin next session";
        break;
    }
  }

  function toggleControls(running) {
    els.btnStart.hidden = running;
    els.btnPause.hidden = !running;
  }

  function tick() {
    if (state.secondsLeft <= 0) {
      onTimerComplete();
      return;
    }
    state.secondsLeft -= 1;
    els.timerDisplay.textContent = formatTime(state.secondsLeft);
    updateRing();
    document.title = `${formatTime(state.secondsLeft)} — POMODORO`;
  }

  function startTimer() {
    if (state.running) return;
    if (state.phase === PHASE.AWAITING_START) return;

    state.running = true;
    state.sessionStart = new Date();
    toggleControls(true);
    updateStatusText();

    state.intervalId = setInterval(tick, 1000);
    document.title = `${formatTime(state.secondsLeft)} — POMODORO`;
  }

  function pauseTimer() {
    if (!state.running) return;
    state.running = false;
    clearInterval(state.intervalId);
    state.intervalId = null;
    toggleControls(false);
    updateStatusText();
    document.title = "POMODORO — BY BADDA";
  }

  function stopInterval() {
    state.running = false;
    clearInterval(state.intervalId);
    state.intervalId = null;
    toggleControls(false);
  }

  function resetAll() {
    stopInterval();
    state.sessionStart = null;
    state.extraMinutes = 0;
    state.warningShown = false;
    hideWarning();
    setFocusDuration(25, 0);
    setPhase(PHASE.IDLE);
    document.title = "POMODORO — BY BADDA";
  }

  async function logSession(sessionType, durationSeconds, completed) {
    const startedAt = state.sessionStart
      ? state.sessionStart.toISOString()
      : new Date(Date.now() - durationSeconds * 1000).toISOString();

    try {
      await fetch("/api/sessions/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: els.taskInput.value.trim(),
          session_type: sessionType,
          duration_seconds: durationSeconds,
          completed,
          started_at: startedAt,
        }),
      });
    } catch (err) {
      console.warn("Failed to log session:", err);
    }
  }

  function playCompleteSound() {
    if (!state.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "square";
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    } catch {
      /* audio unavailable */
    }
  }

  async function onTimerComplete() {
    stopInterval();
    playCompleteSound();

    const duration = state.totalSeconds;

    if (state.phase === PHASE.FOCUS) {
      await logSession("focus", duration, true);
      state.breakMinutes = getBreakMinutes(state.focusMinutes);
      applyBreakTimer();
      setPhase(PHASE.BREAK);
      await refreshStats();
      state.sessionStart = new Date();
      startTimer();
    } else if (state.phase === PHASE.BREAK) {
      await logSession("short_break", duration, true);
      applyFocusTimer();
      setPhase(PHASE.AWAITING_START);
      await refreshStats();
      state.sessionStart = null;
      document.title = "POMODORO — BY BADDA";
    }
  }

  function showWarning() {
    state.warningShown = true;
    els.warningInline.classList.remove("is-hidden");
    els.warningInline.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideWarning() {
    els.warningInline.classList.add("is-hidden");
  }

  function addTenMinutes() {
    if (state.phase === PHASE.FOCUS || state.phase === PHASE.BREAK) return;
    state.extraMinutes += 10;
    state.focusMinutes = getTotalFocusMinutes();
    state.breakMinutes = getBreakMinutes(state.focusMinutes);
    updateDurationDisplay();

    if (state.phase === PHASE.IDLE || state.phase === PHASE.AWAITING_START) {
      applyFocusTimer();
    }

    if (state.focusMinutes > MAX_MINUTES && !state.warningShown) {
      showWarning();
    }
  }

  function handleStartInput() {
    const val = els.startInput.value.trim().toLowerCase();
    if (val === "start") {
      els.startInput.classList.add("valid");
      els.startHint.textContent = "let's go ♡";
      els.startHint.classList.remove("error");
      setPhase(PHASE.FOCUS);
      applyFocusTimer();
      state.sessionStart = null;
      startTimer();
    } else if (val.length > 0) {
      els.startInput.classList.remove("valid");
      els.startHint.textContent = 'type exactly "start"';
      els.startHint.classList.add("error");
    } else {
      els.startInput.classList.remove("valid");
      els.startHint.textContent = "stay focused — type start when ready";
      els.startHint.classList.remove("error");
    }
  }

  async function refreshStats() {
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        fetch("/api/stats/"),
        fetch("/api/sessions/"),
      ]);

      if (statsRes.ok) {
        const stats = await statsRes.json();
        els.statTodayTime.textContent = formatDuration(stats.today_seconds);
        els.statTodayPomodoros.textContent = stats.today_pomodoros;
        els.statWeekTime.textContent = formatDuration(stats.week_seconds);
        els.statTotalTime.textContent = formatDuration(stats.total_seconds);
      }

      if (sessionsRes.ok) {
        const { sessions } = await sessionsRes.json();
        renderHistory(sessions);
      }
    } catch (err) {
      console.warn("Failed to load stats:", err);
    }
  }

  function renderHistory(sessions) {
    if (!sessions.length) {
      els.historyList.innerHTML = '<li class="history-empty">no sessions yet ♡</li>';
      return;
    }

    els.historyList.innerHTML = sessions
      .map((s) => {
        const date = new Date(s.started_at);
        const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const typeLabel = s.session_type.replace("_", " ");
        const task = s.task || "untitled";
        return `
          <li class="history-item">
            <span class="history-item-task" title="${escapeHtml(task)}">${escapeHtml(task)}</span>
            <span class="history-item-meta">
              <span class="history-item-type ${s.session_type}">${typeLabel}</span><br>
              ${formatDuration(s.duration_seconds)} · ${timeStr}
            </span>
          </li>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  els.btnStart.addEventListener("click", () => {
    if (state.phase === PHASE.IDLE) {
      setPhase(PHASE.FOCUS);
      applyFocusTimer();
    }
    startTimer();
  });

  els.btnPause.addEventListener("click", pauseTimer);
  els.btnReset.addEventListener("click", resetAll);
  els.btnAddTime.addEventListener("click", addTenMinutes);

  els.durationBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.phase === PHASE.FOCUS || state.phase === PHASE.BREAK) return;
      const mins = parseInt(btn.dataset.minutes, 10);
      setFocusDuration(mins, 0);
    });
  });

  els.startInput.addEventListener("input", handleStartInput);
  els.startInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleStartInput();
  });

  els.btnWarningOk.addEventListener("click", hideWarning);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.running) {
      els.timerDisplay.textContent = formatTime(state.secondsLeft);
      updateRing();
    }
  });

  setFocusDuration(25, 0);
  setPhase(PHASE.IDLE);
  refreshStats();
})();
