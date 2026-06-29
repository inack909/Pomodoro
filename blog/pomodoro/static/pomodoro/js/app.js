(function () {
  "use strict";

  const MAX_MINUTES = 120;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 120;
  const STORAGE_TODOS = "pomodoro_todos";
  const STORAGE_SESSIONS = "pomodoro_sessions";
  const STORAGE_ACTIVE_TODO = "pomodoro_active_todo";

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
    todos: [],
    sessions: [],
    activeTodoId: null,
    historyTab: "recent",
  };

  const els = {
    body: document.body,
    timerDisplay: document.getElementById("timer-display"),
    timerLabel: document.getElementById("timer-label"),
    ringProgress: document.getElementById("ring-progress"),
    btnStart: document.getElementById("btn-start"),
    btnPause: document.getElementById("btn-pause"),
    btnStop: document.getElementById("btn-stop"),
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
    activeTaskLabel: document.getElementById("active-task-label"),
    activeTaskName: document.getElementById("active-task-name"),
    warningInline: document.getElementById("warning-inline"),
    btnWarningOk: document.getElementById("btn-warning-ok"),
    statTodayTime: document.getElementById("stat-today-time"),
    statTodayPomodoros: document.getElementById("stat-today-pomodoros"),
    statWeekTime: document.getElementById("stat-week-time"),
    statTotalTime: document.getElementById("stat-total-time"),
    historyList: document.getElementById("history-list"),
    taskSummaryList: document.getElementById("task-summary-list"),
    historyTabs: document.querySelectorAll(".history-tab"),
    todoForm: document.getElementById("todo-form"),
    todoInput: document.getElementById("todo-input"),
    todoList: document.getElementById("todo-list"),
  };

  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function loadFromStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveTodos() {
    localStorage.setItem(STORAGE_TODOS, JSON.stringify(state.todos));
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(state.sessions));
  }

  function saveActiveTodo() {
    if (state.activeTodoId) {
      localStorage.setItem(STORAGE_ACTIVE_TODO, state.activeTodoId);
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_TODO);
    }
  }

  function getActiveTaskTitle() {
    const todo = state.todos.find((t) => t.id === state.activeTodoId);
    return todo ? todo.title : "";
  }

  function getElapsedFocusSeconds() {
    if (state.phase !== PHASE.FOCUS || !state.sessionStart) return 0;
    return Math.max(0, state.totalSeconds - state.secondsLeft);
  }

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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function updateActiveTaskDisplay() {
    const title = getActiveTaskTitle();
    if (title) {
      els.activeTaskLabel.classList.remove("is-hidden");
      els.activeTaskName.textContent = title;
    } else {
      els.activeTaskLabel.classList.add("is-hidden");
    }
  }

  function addTodo(title) {
    const trimmed = title.trim();
    if (!trimmed) return;
    state.todos.unshift({
      id: uid(),
      title: trimmed,
      done: false,
      studySeconds: 0,
      createdAt: new Date().toISOString(),
    });
    if (!state.activeTodoId) {
      state.activeTodoId = state.todos[0].id;
      saveActiveTodo();
    }
    saveTodos();
    renderTodos();
    updateActiveTaskDisplay();
    els.todoInput.value = "";
  }

  function toggleTodo(id) {
    const todo = state.todos.find((t) => t.id === id);
    if (todo) {
      todo.done = !todo.done;
      saveTodos();
      renderTodos();
    }
  }

  function deleteTodo(id) {
    state.todos = state.todos.filter((t) => t.id !== id);
    if (state.activeTodoId === id) {
      state.activeTodoId = state.todos.find((t) => !t.done)?.id || state.todos[0]?.id || null;
      saveActiveTodo();
    }
    saveTodos();
    renderTodos();
    updateActiveTaskDisplay();
  }

  function selectTodo(id) {
    state.activeTodoId = id;
    saveActiveTodo();
    renderTodos();
    updateActiveTaskDisplay();
  }

  function addStudyTimeToTodo(taskTitle, seconds) {
    if (!taskTitle || seconds <= 0) return;
    const todo = state.todos.find((t) => t.title === taskTitle);
    if (todo) {
      todo.studySeconds += seconds;
      saveTodos();
      renderTodos();
    }
  }

  function renderTodos() {
    if (!state.todos.length) {
      els.todoList.innerHTML = '<li class="todo-empty">no tasks yet — add one above</li>';
      return;
    }

    els.todoList.innerHTML = state.todos
      .map((todo) => {
        const selected = todo.id === state.activeTodoId;
        const timeLabel =
          todo.studySeconds > 0 ? `${formatDuration(todo.studySeconds)} studied` : "not started";
        return `
          <li class="todo-item${selected ? " selected" : ""}${todo.done ? " done" : ""}" data-id="${todo.id}">
            <button type="button" class="todo-check" data-action="toggle" aria-label="mark done">${todo.done ? "✓" : ""}</button>
            <button type="button" class="todo-body" data-action="select">
              <span class="todo-title">${escapeHtml(todo.title)}</span>
              <span class="todo-time">${timeLabel}</span>
            </button>
            <button type="button" class="todo-delete" data-action="delete" aria-label="delete">×</button>
          </li>`;
      })
      .join("");
  }

  function addLocalSession(session) {
    state.sessions.unshift(session);
    state.sessions = state.sessions.slice(0, 50);
    saveSessions();
    if (session.session_type === "focus") {
      addStudyTimeToTodo(session.task, session.duration_seconds);
    }
    renderHistory();
    renderTaskSummary();
    updateStatsFromSessions();
  }

  function computeStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const focusSessions = state.sessions.filter((s) => s.session_type === "focus");

    let todaySeconds = 0;
    let weekSeconds = 0;
    let totalSeconds = 0;
    let todayCount = 0;

    focusSessions.forEach((s) => {
      const started = new Date(s.started_at);
      totalSeconds += s.duration_seconds;
      if (started >= weekStart) weekSeconds += s.duration_seconds;
      if (started >= todayStart) {
        todaySeconds += s.duration_seconds;
        todayCount += 1;
      }
    });

    return { todaySeconds, weekSeconds, totalSeconds, todayCount };
  }

  function updateStatsFromSessions() {
    const stats = computeStats();
    els.statTodayTime.textContent = formatDuration(stats.todaySeconds);
    els.statTodayPomodoros.textContent = stats.todayCount;
    els.statWeekTime.textContent = formatDuration(stats.weekSeconds);
    els.statTotalTime.textContent = formatDuration(stats.totalSeconds);
  }

  function renderHistory() {
    const focusSessions = state.sessions.filter((s) => s.session_type === "focus");

    if (!focusSessions.length) {
      els.historyList.innerHTML = '<li class="history-empty">no sessions yet ♡</li>';
      return;
    }

    els.historyList.innerHTML = focusSessions
      .slice(0, 20)
      .map((s) => {
        const date = new Date(s.started_at);
        const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const task = s.task || "general study";
        const partialClass = s.completed ? "" : " partial";
        const typeLabel = s.completed ? "focus" : "partial";
        return `
          <li class="history-item${partialClass}">
            <span class="history-item-task" title="${escapeHtml(task)}">${escapeHtml(task)}</span>
            <span class="history-item-meta">
              <span class="history-item-type focus">${typeLabel}</span><br>
              ${formatDuration(s.duration_seconds)} · ${timeStr}
            </span>
          </li>`;
      })
      .join("");
  }

  function renderTaskSummary() {
    const totals = {};

    state.sessions
      .filter((s) => s.session_type === "focus")
      .forEach((s) => {
        const name = s.task || "general study";
        totals[name] = (totals[name] || 0) + s.duration_seconds;
      });

    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      els.taskSummaryList.innerHTML = '<li class="history-empty">no study time yet</li>';
      return;
    }

    els.taskSummaryList.innerHTML = entries
      .map(
        ([name, seconds]) => `
        <li class="task-summary-item">
          <span class="task-summary-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <span class="task-summary-time">${formatDuration(seconds)}</span>
        </li>`
      )
      .join("");
  }

  function switchHistoryTab(tab) {
    state.historyTab = tab;
    els.historyTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    els.historyList.classList.toggle("is-hidden", tab !== "recent");
    els.taskSummaryList.classList.toggle("is-hidden", tab !== "tasks");
  }

  async function logSession(sessionType, durationSeconds, completed) {
    if (durationSeconds <= 0) return;

    const task = getActiveTaskTitle() || "general study";
    const startedAt = state.sessionStart
      ? state.sessionStart.toISOString()
      : new Date(Date.now() - durationSeconds * 1000).toISOString();

    const session = {
      id: uid(),
      task,
      session_type: sessionType,
      duration_seconds: durationSeconds,
      completed,
      started_at: startedAt,
    };

    addLocalSession(session);

    try {
      await fetch("/api/sessions/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: session.task,
          session_type: session.session_type,
          duration_seconds: session.duration_seconds,
          completed: session.completed,
          started_at: session.started_at,
        }),
      });
    } catch {
      /* localStorage is the source of truth */
    }
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

    updateControlButtons();
    updateStatusText();
  }

  function updateControlButtons() {
    const inFocus = state.phase === PHASE.FOCUS;
    els.btnStop.hidden = !inFocus;
    if (!state.running) {
      els.btnStart.hidden = state.phase === PHASE.AWAITING_START;
      els.btnPause.hidden = true;
    }
  }

  function updateStatusText() {
    switch (state.phase) {
      case PHASE.IDLE:
        els.sessionStatus.textContent = "pick a task, length & hit start";
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
    els.btnStart.hidden = running || state.phase === PHASE.AWAITING_START;
    els.btnPause.hidden = !running;
    els.btnStop.hidden = state.phase !== PHASE.FOCUS;
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
    if (!state.sessionStart) state.sessionStart = new Date();
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

  async function stopFocusSession() {
    const elapsed = getElapsedFocusSeconds();
    stopInterval();
    if (elapsed > 0) {
      await logSession("focus", elapsed, false);
    }
    state.sessionStart = null;
    applyFocusTimer();
    setPhase(PHASE.IDLE);
    document.title = "POMODORO — BY BADDA";
  }

  async function resetAll() {
    if (state.phase === PHASE.FOCUS) {
      const elapsed = getElapsedFocusSeconds();
      stopInterval();
      if (elapsed > 0) {
        await logSession("focus", elapsed, false);
      }
    } else {
      stopInterval();
    }

    state.sessionStart = null;
    state.extraMinutes = 0;
    state.warningShown = false;
    hideWarning();
    setFocusDuration(25, 0);
    setPhase(PHASE.IDLE);
    document.title = "POMODORO — BY BADDA";
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
      state.sessionStart = new Date();
      startTimer();
    } else if (state.phase === PHASE.BREAK) {
      await logSession("short_break", duration, true);
      applyFocusTimer();
      setPhase(PHASE.AWAITING_START);
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

  async function mergeApiSessions() {
    try {
      const res = await fetch("/api/sessions/");
      if (!res.ok) return;
      const { sessions } = await res.json();
      if (!sessions?.length) return;

      const localIds = new Set(state.sessions.map((s) => s.id));
      sessions.forEach((s) => {
        const normalized = {
          id: s.id ? `api-${s.id}` : uid(),
          task: s.task,
          session_type: s.session_type,
          duration_seconds: s.duration_seconds,
          completed: s.completed,
          started_at: s.started_at,
        };
        if (!state.sessions.some((ls) => ls.started_at === normalized.started_at && ls.duration_seconds === normalized.duration_seconds)) {
          state.sessions.push(normalized);
        }
      });

      state.sessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
      state.sessions = state.sessions.slice(0, 50);
      saveSessions();
      recalculateTodoStudyTime();

      renderTodos();
      renderHistory();
      renderTaskSummary();
      updateStatsFromSessions();
    } catch {
      /* use local data only */
    }
  }

  function recalculateTodoStudyTime() {
    state.todos.forEach((todo) => {
      todo.studySeconds = 0;
    });
    state.sessions
      .filter((s) => s.session_type === "focus")
      .forEach((s) => {
        const todo = state.todos.find((t) => t.title === s.task);
        if (todo) todo.studySeconds += s.duration_seconds;
      });
    saveTodos();
  }

  function initStorage() {
    state.todos = loadFromStorage(STORAGE_TODOS, []);
    state.sessions = loadFromStorage(STORAGE_SESSIONS, []);
    state.activeTodoId = localStorage.getItem(STORAGE_ACTIVE_TODO) || state.todos[0]?.id || null;

    state.todos.forEach((todo) => {
      if (typeof todo.studySeconds !== "number") todo.studySeconds = 0;
    });
    recalculateTodoStudyTime();
  }

  els.btnStart.addEventListener("click", () => {
    if (state.phase === PHASE.IDLE) {
      setPhase(PHASE.FOCUS);
      applyFocusTimer();
    }
    startTimer();
  });

  els.btnPause.addEventListener("click", pauseTimer);
  els.btnStop.addEventListener("click", stopFocusSession);
  els.btnReset.addEventListener("click", resetAll);
  els.btnAddTime.addEventListener("click", addTenMinutes);

  els.durationBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.phase === PHASE.FOCUS || state.phase === PHASE.BREAK) return;
      setFocusDuration(parseInt(btn.dataset.minutes, 10), 0);
    });
  });

  els.startInput.addEventListener("input", handleStartInput);
  els.startInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleStartInput();
  });

  els.btnWarningOk.addEventListener("click", hideWarning);

  els.todoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addTodo(els.todoInput.value);
  });

  els.todoList.addEventListener("click", (e) => {
    const item = e.target.closest(".todo-item");
    if (!item) return;
    const id = item.dataset.id;
    const action = e.target.closest("[data-action]")?.dataset.action;

    if (action === "toggle") toggleTodo(id);
    else if (action === "delete") deleteTodo(id);
    else if (action === "select") selectTodo(id);
  });

  els.historyTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchHistoryTab(tab.dataset.tab));
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.running) {
      els.timerDisplay.textContent = formatTime(state.secondsLeft);
      updateRing();
    }
  });

  initStorage();
  setFocusDuration(25, 0);
  setPhase(PHASE.IDLE);
  renderTodos();
  renderHistory();
  renderTaskSummary();
  updateStatsFromSessions();
  updateActiveTaskDisplay();
  mergeApiSessions();
})();
