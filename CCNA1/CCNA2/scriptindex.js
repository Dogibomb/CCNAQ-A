const FILTER_STORAGE_KEY = "ccna2.topicFilter";
const RANGE_PRESETS = [
  [1, 4],
  [5, 9],
  [10, 14]
];
const LEAVE_MS = 210;
const ENTER_MS = 430;

let questions = [];          // full question bank (index = stable question id)
let filtered = [];           // ids of questions in the active filter
let filteredUnshuffled = []; // copy for toggling question shuffle off
let position = 0;            // logical position inside `filtered`
let displayedId = null;      // id of the question currently rendered in the DOM
let activeFilter = "all";
let transitioning = false;
let transitionTimers = [];
let toastTimer = null;

// Study & Exam Feature States
let isShuffleQuestions = false;
let isShuffleOptions = false;
let isExamMode = false;
let examTimeRemaining = 3600; // 60 minutes in seconds
let examTimerInterval = null;
let examSavedFilter = "all";

// Per-question answer history for the current filter session.
// id -> { selected: Set<string>, checked: boolean, correct: boolean, displayOptions?: string[] }
const session = new Map();

const els = {
  card: document.getElementById("quizCard"),
  question: document.getElementById("question"),
  questionBadge: document.getElementById("questionBadge"),
  topicBadge: document.getElementById("topicBadge"),
  topicFilter: document.getElementById("topicFilter"),
  answers: document.getElementById("answers"),
  empty: document.getElementById("answerEmptyState"),
  prev: document.getElementById("prev"),
  check: document.getElementById("check"),
  next: document.getElementById("next"),
  finishExam: document.getElementById("finishExam"),
  imageContainer: document.getElementById("imageContainer"),
  image: document.getElementById("questionImage"),
  exhibitTrigger: document.getElementById("exhibitTrigger"),
  exhibitError: document.getElementById("exhibitError"),
  feedback: document.getElementById("feedback"),
  overlay: document.getElementById("quizImageOverlay"),
  overlayImage: document.getElementById("quizOverlayImage"),
  overlayClose: document.getElementById("quizImageClose"),
  toast: document.getElementById("toast"),

  // Study Tools Elements
  flagBtn: document.getElementById("flagBtn"),
  shuffleQuestionsBtn: document.getElementById("shuffleQuestionsBtn"),
  shuffleOptionsBtn: document.getElementById("shuffleOptionsBtn"),
  examModeBtn: document.getElementById("examModeBtn"),
  examTimer: document.getElementById("examTimer"),
  examTimerText: document.getElementById("examTimerText"),

  // Note Box Elements
  noteBox: document.getElementById("noteBox"),
  noteToggleBtn: document.getElementById("noteToggleBtn"),
  noteToggleText: document.getElementById("noteToggleText"),
  noteContentPanel: document.getElementById("noteContentPanel"),
  noteInput: document.getElementById("noteInput"),
  noteSaveBtn: document.getElementById("noteSaveBtn"),
  noteClearBtn: document.getElementById("noteClearBtn"),

  // Exam Result Modal
  examResultModal: document.getElementById("examResultModal"),
  examResultTitle: document.getElementById("examResultTitle"),
  examScoreBanner: document.getElementById("examScoreBanner"),
  examScoreLarge: document.getElementById("examScoreLarge"),
  examPassBadge: document.getElementById("examPassBadge"),
  examAccuracyPct: document.getElementById("examAccuracyPct"),
  examMissedCount: document.getElementById("examMissedCount"),
  examTopicBreakdown: document.getElementById("examTopicBreakdown"),
  examReviewMistakesBtn: document.getElementById("examReviewMistakesBtn"),
  examCloseBtn: document.getElementById("examCloseBtn")
};

fetch("ccna.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Question bank request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data) || data.length === 0) throw new Error("Question bank is empty.");
    questions = data.map((question, id) => ({ ...question, _topic: parseTopic(question), _id: id }));
    if (window.CCNAStorage) window.CCNAStorage.syncNavbarBadges(data);

    buildTopicFilter();

    // Check URL parameters (e.g. index.html?filter=mistakes or index.html?q=10)
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get("filter");
    const qParam = urlParams.get("q");

    let initialFilter = readStoredFilter();
    if (filterParam && isKnownFilter(filterParam)) {
      initialFilter = filterParam;
    }
    applyFilter(initialFilter, { animate: false });

    if (qParam) {
      const targetNum = Number(qParam);
      const targetIdx = filtered.findIndex((id) => getQuestionNumber(questions[id]) === targetNum);
      if (targetIdx !== -1) {
        position = targetIdx;
        renderCurrent();
      }
    }
  })
  .catch((error) => {
    console.error(error);
    showLoadError();
  });

/* ---------- Data helpers ---------- */

function cleanQuestionText(text = "") {
  return String(text).replace(/^\s*\d+\.\s*/, "").trim();
}

function getQuestionNumber(question, fallbackIndex) {
  const match = String(question?.question || "").match(/^\s*(\d+)\./);
  return match ? Number(match[1]) : (fallbackIndex !== undefined ? fallbackIndex + 1 : 1);
}

function parseTopic(question) {
  const sources = [question?.explanation, question?.question];
  for (const source of sources) {
    const match = String(source || "").match(/Topic\s*(\d+(?:\.\d+)*)/i);
    if (match) return { label: match[1], chapter: Number(match[1].split(".")[0]) };
  }
  return null;
}

function getCorrectList(question) {
  if (window.CCNAStorage) {
    const progress = window.CCNAStorage.loadProgress();
    const effective = window.CCNAStorage.getEffectiveCorrectAnswers(question, progress.customOverrides);
    if (effective.length) return effective;
  }
  if (!question) return [];
  if (Array.isArray(question.correct_answer)) return question.correct_answer;
  return question.correct_answer ? [question.correct_answer] : [];
}

function getOptions(question) {
  return Array.isArray(question?.options) ? question.options : [];
}

function getEntry(id) {
  if (!session.has(id)) session.set(id, { selected: new Set(), checked: false, correct: false });
  return session.get(id);
}

/* ---------- Topic filter & Quick Modes ---------- */

function countWhere(predicate) {
  return questions.filter(predicate).length;
}

function matchesFilter(question, filter) {
  const qNum = getQuestionNumber(question);
  const progress = window.CCNAStorage ? window.CCNAStorage.loadProgress() : { completedQuestions: {}, wrongQuestions: {}, flaggedQuestions: [] };

  if (filter === "all") return true;
  if (filter === "unseen") return !progress.completedQuestions[String(qNum)];
  if (filter === "mistakes") return Boolean(progress.wrongQuestions[String(qNum)]);
  if (filter === "flagged") return progress.flaggedQuestions.includes(qNum);
  if (filter === "none") return !question._topic;

  const [kind, value] = filter.split(":");
  const chapter = question._topic?.chapter;
  if (chapter === undefined) return false;

  if (kind === "topic") return chapter === Number(value);
  if (kind === "range") {
    const [from, to] = value.split("-").map(Number);
    return chapter >= from && chapter <= to;
  }
  return false;
}

function buildTopicFilter() {
  const select = els.topicFilter;
  const progress = window.CCNAStorage ? window.CCNAStorage.loadProgress() : { completedQuestions: {}, wrongQuestions: {}, flaggedQuestions: [] };

  const chapters = [...new Set(questions.map((q) => q._topic?.chapter).filter(Number.isFinite))].sort((a, b) => a - b);
  const maxChapter = chapters.length ? chapters[chapters.length - 1] : 0;

  const ranges = RANGE_PRESETS.map(([from, to]) => [from, to]);
  const lastPresetEnd = ranges.length ? ranges[ranges.length - 1][1] : 0;
  if (maxChapter > lastPresetEnd) ranges.push([lastPresetEnd + 1, maxChapter]);

  const makeOption = (value, label, customCount) => {
    const option = document.createElement("option");
    option.value = value;
    const count = customCount !== undefined ? customCount : countWhere((q) => matchesFilter(q, value));
    option.textContent = `${label} (${count})`;
    return option;
  };

  select.innerHTML = "";

  // 1. Quick Study Modes Group
  const quickGroup = document.createElement("optgroup");
  quickGroup.label = "Study & Progress Modes";
  quickGroup.appendChild(makeOption("all", "All questions", questions.length));
  quickGroup.appendChild(makeOption("unseen", "Unseen only (Not completed yet)"));
  quickGroup.appendChild(makeOption("mistakes", "Mistakes only"));
  quickGroup.appendChild(makeOption("flagged", "Flagged only"));
  select.appendChild(quickGroup);

  // 2. Topic Ranges Group
  const rangeGroup = document.createElement("optgroup");
  rangeGroup.label = "Topic ranges";
  ranges.forEach(([from, to]) => {
    const label = from === to ? `Topic ${from}` : `Topics ${from}–${to}`;
    rangeGroup.appendChild(makeOption(`range:${from}-${to}`, label));
  });
  select.appendChild(rangeGroup);

  // 3. Single Topic Group
  const topicGroup = document.createElement("optgroup");
  topicGroup.label = "Single topic";
  chapters.forEach((chapter) => topicGroup.appendChild(makeOption(`topic:${chapter}`, `Topic ${chapter}`)));
  select.appendChild(topicGroup);

  if (questions.some((q) => !q._topic)) select.appendChild(makeOption("none", "Unassigned"));

  select.disabled = false;
}

function isKnownFilter(value) {
  return [...els.topicFilter.options].some((option) => option.value === value);
}

function readStoredFilter() {
  try {
    const stored = window.localStorage.getItem(FILTER_STORAGE_KEY);
    return stored && isKnownFilter(stored) ? stored : "all";
  } catch {
    return "all";
  }
}

function storeFilter(value) {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, value);
  } catch {
    /* storage unavailable */
  }
}

function applyFilter(value, { animate = true } = {}) {
  activeFilter = isKnownFilter(value) ? value : "all";
  els.topicFilter.value = activeFilter;
  storeFilter(activeFilter);

  cancelTransition();
  session.clear();
  filtered = questions.filter((q) => matchesFilter(q, activeFilter)).map((q) => q._id);
  filteredUnshuffled = [...filtered];

  if (isShuffleQuestions) {
    shuffleArray(filtered);
  }

  position = 0;

  if (animate) {
    goTo(0, "forward", { force: true });
  } else {
    renderCurrent();
  }
}

/* ---------- Navigation ---------- */

function cancelTransition() {
  transitionTimers.forEach((timer) => window.clearTimeout(timer));
  transitionTimers = [];
  transitioning = false;
  els.card.classList.remove("is-leaving", "is-entering", "is-back");
}

function later(fn, ms) {
  const timer = window.setTimeout(() => {
    transitionTimers = transitionTimers.filter((t) => t !== timer);
    fn();
  }, ms);
  transitionTimers.push(timer);
}

function goTo(targetPosition, direction, { force = false } = {}) {
  if (!filtered.length) {
    renderCurrent();
    return;
  }
  if (targetPosition < 0 || targetPosition >= filtered.length) return;
  if (!force && targetPosition === position && !transitioning) return;

  position = targetPosition;
  cancelTransition();
  transitioning = true;
  updateControls();

  els.card.classList.toggle("is-back", direction === "back");
  els.card.classList.add("is-leaving");

  later(() => {
    renderCurrent();
    els.card.classList.remove("is-leaving");
    els.card.classList.add("is-entering");

    later(() => {
      els.card.classList.remove("is-entering", "is-back");
      transitioning = false;
      updateControls();
    }, ENTER_MS);
  }, LEAVE_MS);
}

function nextQuestion() {
  if (position < filtered.length - 1) goTo(position + 1, "forward");
}

function previousQuestion() {
  if (position > 0) goTo(position - 1, "back");
}

/* ---------- Rendering ---------- */

function currentQuestion() {
  return displayedId === null ? null : questions[displayedId];
}

function renderCurrent() {
  if (!filtered.length) {
    renderEmptyFilter();
    return;
  }

  position = Math.min(Math.max(position, 0), filtered.length - 1);
  displayedId = filtered[position];

  const current = questions[displayedId];
  const entry = getEntry(displayedId);
  const number = getQuestionNumber(current, displayedId);
  const options = getOptions(current);

  els.question.textContent = cleanQuestionText(current.question);
  els.questionBadge.textContent = isExamMode
    ? `EXAM ${position + 1} / ${filtered.length}`
    : `QUESTION ${position + 1} / ${filtered.length}`;
  els.questionBadge.title = `Record #${number} in the question bank`;

  if (current._topic) {
    els.topicBadge.textContent = `TOPIC ${current._topic.label}`;
    els.topicBadge.hidden = false;
  } else {
    els.topicBadge.hidden = true;
  }

  // Render Flag State
  if (els.flagBtn) {
    const isFlagged = window.CCNAStorage ? window.CCNAStorage.isQuestionFlagged(number) : false;
    els.flagBtn.classList.toggle("is-flagged", isFlagged);
    const flagLabel = els.flagBtn.querySelector(".flag-label");
    if (flagLabel) flagLabel.textContent = isFlagged ? "Flagged" : "Flag";
  }

  // Render Personal Note State
  renderQuestionNote(number);

  renderImage(current, number);
  renderAnswers(options, entry);

  if (!isExamMode && entry.checked) {
    showFeedback(entry.correct);
  } else {
    resetFeedback();
  }

  updateControls();
}

function renderEmptyFilter() {
  displayedId = null;
  els.questionBadge.textContent = "QUESTION 0 / 0";
  els.questionBadge.removeAttribute("title");
  els.topicBadge.hidden = true;
  if (els.flagBtn) els.flagBtn.classList.remove("is-flagged");
  els.question.textContent = activeFilter === "mistakes"
    ? "No mistakes recorded to review. Great job!"
    : (activeFilter === "flagged"
        ? "No flagged questions found. Press F to flag questions."
        : (activeFilter === "unseen"
            ? "You have completed all questions in the bank!"
            : "No questions found for this topic."));
  els.imageContainer.hidden = true;
  els.image.removeAttribute("src");
  els.answers.innerHTML = "";
  els.empty.hidden = true;
  resetFeedback();
  updateControls();
}

function updateControls() {
  const current = currentQuestion();
  const entry = displayedId === null ? null : getEntry(displayedId);
  const hasChoices = current && getOptions(current).length > 0 && getCorrectList(current).length > 0;

  els.prev.disabled = filtered.length === 0 || position <= 0;
  els.next.disabled = filtered.length === 0 || position >= filtered.length - 1;

  if (isExamMode) {
    els.check.style.display = "none";
    if (els.finishExam) els.finishExam.style.display = "inline-flex";
  } else {
    els.check.style.display = "";
    if (els.finishExam) els.finishExam.style.display = "none";
    els.check.disabled = transitioning || !hasChoices || Boolean(entry?.checked);
  }
}

function renderImage(current, questionNumber) {
  els.exhibitError.hidden = true;
  els.exhibitTrigger.hidden = false;
  els.image.style.display = "";

  if (!current.image_url) {
    els.imageContainer.hidden = true;
    els.image.onload = null;
    els.image.onerror = null;
    els.image.removeAttribute("src");
    return;
  }

  const src = current.image_url;
  els.imageContainer.hidden = false;
  els.image.alt = `Exhibit for question ${questionNumber}`;

  els.image.onerror = () => {
    if (currentQuestion()?.image_url !== src) return;
    els.exhibitTrigger.hidden = true;
    els.exhibitError.hidden = false;
  };

  els.image.onload = () => {
    if (currentQuestion()?.image_url !== src) return;
    els.exhibitTrigger.hidden = false;
    els.exhibitError.hidden = true;
  };

  els.image.src = src;
}

/* ---------- Answers & Option Shuffling ---------- */

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderAnswers(options, entry) {
  const correctList = getCorrectList(currentQuestion());
  els.answers.innerHTML = "";
  els.answers.classList.toggle("is-restored", entry.checked);
  els.empty.hidden = options.length > 0;

  // Determine display order of options
  let displayOptions = options;
  if (isShuffleOptions) {
    if (!entry.displayOptions) {
      entry.displayOptions = shuffleArray([...options]);
    }
    displayOptions = entry.displayOptions;
  } else {
    entry.displayOptions = options;
    displayOptions = options;
  }

  displayOptions.forEach((optText, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    button.dataset.answer = optText;
    button.dataset.index = String(index);
    button.style.setProperty("--option-delay", `${90 + index * 60}ms`);

    const letter = String.fromCharCode(65 + index);
    button.innerHTML = `
      <span class="option-index">${letter}</span>
      <span class="option-text"></span>
      <span class="option-state" aria-hidden="true">
        <svg class="state-check" viewBox="0 0 24 24"><path d="m6.8 12.5 3.2 3.2 7.2-7.4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <svg class="state-x" viewBox="0 0 24 24"><path d="m8 8 8 8M16 8l-8 8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>
      </span>`;

    button.querySelector(".option-text").textContent = optText;

    if (!isExamMode && entry.checked) {
      applyResultState(button, correctList, entry.selected);
    } else {
      const isSelected = entry.selected.has(optText);
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    }

    button.addEventListener("click", () => toggleAnswer(optText));
    els.answers.appendChild(button);
  });
}

function syncSelectionClasses(entry) {
  els.answers.querySelectorAll(".answer-option").forEach((button) => {
    const isSelected = entry.selected.has(button.dataset.answer);
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function applyResultState(button, correctList, selected) {
  const text = button.dataset.answer;
  const isCorrect = correctList.includes(text);
  button.classList.remove("selected");
  button.removeAttribute("aria-pressed");
  if (isCorrect) button.classList.add("correct");
  if (selected.has(text) && !isCorrect) button.classList.add("wrong");
  button.disabled = true;
}

/* ---------- Answering & Progress Persistence ---------- */

function toggleAnswer(optText) {
  const current = currentQuestion();
  if (!current || transitioning) return;

  const entry = getEntry(displayedId);
  if (!isExamMode && entry.checked) return;

  const maxAllowed = getCorrectList(current).length || 1;

  if (entry.selected.has(optText)) {
    entry.selected.delete(optText);
  } else if (entry.selected.size < maxAllowed) {
    entry.selected.add(optText);
  } else if (maxAllowed === 1) {
    entry.selected.clear();
    entry.selected.add(optText);
  } else {
    showToast(`Select exactly ${maxAllowed} answers for this question.`);
    return;
  }

  syncSelectionClasses(entry);
}

function checkAnswer() {
  const current = currentQuestion();
  if (!current || transitioning || isExamMode) return;

  const entry = getEntry(displayedId);
  if (entry.checked) return;

  const correctList = getCorrectList(current);
  if (correctList.length === 0) return;

  if (entry.selected.size === 0) {
    showToast("Choose an answer first.");
    return;
  }

  if (entry.selected.size !== correctList.length) {
    showToast(`Select exactly ${correctList.length} answer${correctList.length === 1 ? "" : "s"}.`);
    return;
  }

  entry.checked = true;
  entry.correct = [...entry.selected].every((answer) => correctList.includes(answer));

  els.answers.querySelectorAll(".answer-option").forEach((button) => {
    applyResultState(button, correctList, entry.selected);
  });

  showFeedback(entry.correct);
  updateControls();

  // Persist result into localStorage via CCNAStorage
  const qNum = getQuestionNumber(current, displayedId);
  if (window.CCNAStorage) {
    window.CCNAStorage.recordAnswerResult({
      qNumber: qNum,
      questionId: displayedId,
      selected: entry.selected,
      correctList: correctList,
      isCorrect: entry.correct
    });

    if (entry.correct && activeFilter === "mistakes") {
      showToast(`Mastered! Question #${qNum} removed from mistakes review.`);
    }

    buildTopicFilter();
  }
}

function showFeedback(isCorrect) {
  els.feedback.className = `feedback is-visible ${isCorrect ? "is-success" : "is-error"}`;
  els.feedback.innerHTML = isCorrect
    ? "<strong>Correct.</strong>"
    : "<strong>Incorrect.</strong> The correct answer is highlighted above.";
}

function resetFeedback() {
  els.feedback.className = "feedback";
  els.feedback.textContent = "";
}

/* ---------- Personal Notes Management ---------- */

function renderQuestionNote(number) {
  if (!els.noteBox) return;
  const note = window.CCNAStorage ? window.CCNAStorage.getQuestionNote(number) : "";
  els.noteInput.value = note;
  if (note) {
    els.noteToggleText.textContent = `Personal note: "${note.substring(0, 32)}${note.length > 32 ? "…" : ""}"`;
    els.noteToggleBtn.classList.add("has-note");
  } else {
    els.noteToggleText.textContent = "Add personal note / cheat-sheet";
    els.noteToggleBtn.classList.remove("has-note");
  }
}

if (els.noteToggleBtn) {
  els.noteToggleBtn.addEventListener("click", () => {
    const isHidden = els.noteContentPanel.hidden;
    els.noteContentPanel.hidden = !isHidden;
    if (!els.noteContentPanel.hidden) {
      els.noteInput.focus();
    }
  });
}

if (els.noteSaveBtn) {
  els.noteSaveBtn.addEventListener("click", () => {
    const current = currentQuestion();
    if (!current) return;
    const num = getQuestionNumber(current, displayedId);
    const text = els.noteInput.value.trim();
    if (window.CCNAStorage) {
      window.CCNAStorage.saveQuestionNote(num, text);
      renderQuestionNote(num);
      showToast(text ? `Note saved for Question #${num}` : "Note cleared.");
    }
  });
}

if (els.noteClearBtn) {
  els.noteClearBtn.addEventListener("click", () => {
    const current = currentQuestion();
    if (!current) return;
    const num = getQuestionNumber(current, displayedId);
    els.noteInput.value = "";
    if (window.CCNAStorage) {
      window.CCNAStorage.saveQuestionNote(num, "");
      renderQuestionNote(num);
      showToast("Note cleared.");
    }
  });
}

/* ---------- Bookmark / Flag Question ---------- */

function toggleCurrentFlag() {
  const current = currentQuestion();
  if (!current) return;
  const num = getQuestionNumber(current, displayedId);
  if (window.CCNAStorage) {
    const isNowFlagged = window.CCNAStorage.toggleQuestionFlag(num);
    if (els.flagBtn) {
      els.flagBtn.classList.toggle("is-flagged", isNowFlagged);
      const label = els.flagBtn.querySelector(".flag-label");
      if (label) label.textContent = isNowFlagged ? "Flagged" : "Flag";
    }
    showToast(isNowFlagged ? `Question #${num} flagged for review (F)` : `Question #${num} unflagged`);
    buildTopicFilter();
  }
}

if (els.flagBtn) {
  els.flagBtn.addEventListener("click", toggleCurrentFlag);
}

/* ---------- Shuffle Toggles ---------- */

if (els.shuffleQuestionsBtn) {
  els.shuffleQuestionsBtn.addEventListener("click", () => {
    isShuffleQuestions = !isShuffleQuestions;
    els.shuffleQuestionsBtn.classList.toggle("is-active", isShuffleQuestions);

    if (isShuffleQuestions) {
      shuffleArray(filtered);
      showToast("Questions randomized.");
    } else {
      filtered = [...filteredUnshuffled];
      showToast("Questions returned to standard order.");
    }

    position = 0;
    renderCurrent();
  });
}

if (els.shuffleOptionsBtn) {
  els.shuffleOptionsBtn.addEventListener("click", () => {
    isShuffleOptions = !isShuffleOptions;
    els.shuffleOptionsBtn.classList.toggle("is-active", isShuffleOptions);

    // Clear cached option display orders
    session.forEach((val) => delete val.displayOptions);

    renderCurrent();
    showToast(isShuffleOptions ? "Answer options (A–D) will be shuffled." : "Answer options restored to original order.");
  });
}

/* ---------- Mock Exam Simulation Mode ---------- */

function updateExamTimerDisplay() {
  if (!els.examTimerText) return;
  const mins = Math.floor(examTimeRemaining / 60);
  const secs = examTimeRemaining % 60;
  els.examTimerText.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function startMockExam() {
  isExamMode = true;
  examSavedFilter = activeFilter;
  els.card.classList.add("is-exam-mode");
  els.examModeBtn.classList.add("is-active");
  els.examTimer.hidden = false;

  // Sample 50 questions randomly across all topics
  const pool = [...questions.map((q) => q._id)];
  shuffleArray(pool);
  filtered = pool.slice(0, Math.min(50, pool.length));
  position = 0;
  session.clear();

  examTimeRemaining = 3600; // 60 minutes
  updateExamTimerDisplay();
  clearInterval(examTimerInterval);
  examTimerInterval = setInterval(() => {
    examTimeRemaining -= 1;
    updateExamTimerDisplay();
    if (examTimeRemaining <= 0) {
      clearInterval(examTimerInterval);
      finishMockExam(true);
    }
  }, 1000);

  renderCurrent();
  showToast("60-minute Mock Exam started. Feedback is hidden until submission.");
}

function finishMockExam(isTimeUp = false) {
  clearInterval(examTimerInterval);

  let correctCount = 0;
  let wrongCount = 0;
  const missedList = [];
  const topicBreakdown = {};

  filtered.forEach((id) => {
    const q = questions[id];
    const qNum = getQuestionNumber(q, id);
    const entry = getEntry(id);
    const correctList = getCorrectList(q);

    const isCorrect = correctList.length > 0 &&
      entry.selected.size === correctList.length &&
      [...entry.selected].every((ans) => correctList.includes(ans));

    const topicLabel = q._topic ? `Topic ${q._topic.label}` : "CCNA 2";
    if (!topicBreakdown[topicLabel]) topicBreakdown[topicLabel] = { total: 0, correct: 0 };
    topicBreakdown[topicLabel].total += 1;

    if (isCorrect) {
      correctCount += 1;
      topicBreakdown[topicLabel].correct += 1;
      window.CCNAStorage?.recordAnswerResult({
        qNumber: qNum,
        questionId: id,
        selected: entry.selected,
        correctList,
        isCorrect: true
      });
    } else {
      wrongCount += 1;
      missedList.push(qNum);
      window.CCNAStorage?.recordAnswerResult({
        qNumber: qNum,
        questionId: id,
        selected: entry.selected,
        correctList,
        isCorrect: false
      });
    }
  });

  const total = filtered.length;
  const accuracy = Math.round((correctCount / total) * 100);
  const isPass = accuracy >= 82.5;

  // Populate Exam Results Modal
  els.examResultTitle.textContent = isTimeUp ? "Time's Up! Mock Exam Results" : "Mock Exam Simulation Complete";
  els.examScoreLarge.textContent = `${correctCount} / ${total}`;
  els.examPassBadge.textContent = isPass ? "PASS" : "FAIL";
  els.examScoreBanner.className = `exam-score-banner ${isPass ? "is-pass" : "is-fail"}`;
  els.examAccuracyPct.textContent = `${accuracy}%`;
  els.examMissedCount.textContent = `${wrongCount} question${wrongCount === 1 ? "" : "s"}`;

  els.examTopicBreakdown.innerHTML = "";
  Object.keys(topicBreakdown).forEach((top) => {
    const item = topicBreakdown[top];
    const row = document.createElement("div");
    row.className = "exam-topic-item";
    row.innerHTML = `
      <span>${top}</span>
      <strong>${item.correct} / ${item.total} (${Math.round((item.correct / item.total) * 100)}%)</strong>
    `;
    els.examTopicBreakdown.appendChild(row);
  });

  els.examResultModal.classList.remove("hidden");
  els.examResultModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function exitExamMode() {
  isExamMode = false;
  clearInterval(examTimerInterval);
  els.card.classList.remove("is-exam-mode");
  els.examModeBtn.classList.remove("is-active");
  els.examTimer.hidden = true;
  els.examResultModal.classList.add("hidden");
  els.examResultModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  applyFilter(examSavedFilter || "all", { animate: false });
}

if (els.examModeBtn) {
  els.examModeBtn.addEventListener("click", () => {
    if (isExamMode) {
      const confirmExit = window.confirm("Exit current Mock Exam? Exam progress will be discarded.");
      if (confirmExit) exitExamMode();
    } else {
      const confirmStart = window.confirm("Start a timed 60-minute CCNA Mock Exam?\n\n• 50 randomized questions across all topics\n• Immediate feedback hidden until finish\n• Missed questions automatically tracked for review");
      if (confirmStart) startMockExam();
    }
  });
}

if (els.finishExam) {
  els.finishExam.addEventListener("click", () => {
    const unansweredInExam = filtered.filter((id) => getEntry(id).selected.size === 0).length;
    const msg = unansweredInExam > 0
      ? `You have ${unansweredInExam} unanswered questions in this exam. Finish and submit anyway?`
      : "Ready to finish and submit your Mock Exam?";
    if (window.confirm(msg)) {
      finishMockExam(false);
    }
  });
}

if (els.examReviewMistakesBtn) {
  els.examReviewMistakesBtn.addEventListener("click", () => {
    exitExamMode();
    applyFilter("mistakes", { animate: false });
    showToast("Now practicing missed exam questions.");
  });
}

if (els.examCloseBtn) {
  els.examCloseBtn.addEventListener("click", () => {
    exitExamMode();
  });
}

/* ---------- Misc UI ---------- */

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function showLoadError() {
  displayedId = null;
  filtered = [];
  els.questionBadge.textContent = "DATA ERROR";
  els.topicBadge.hidden = true;
  els.question.textContent = "The question bank could not be loaded.";
  els.answers.innerHTML = "";
  els.empty.hidden = false;
  els.empty.querySelector("strong").textContent = "Check that ccna.json is in the same folder.";
  els.empty.querySelector("span").textContent = "The interface is ready, but the data source did not respond.";
  els.topicFilter.disabled = true;
  els.prev.disabled = true;
  els.check.disabled = true;
  els.next.disabled = true;
}

function openImageViewer() {
  const current = currentQuestion();
  if (!current?.image_url || els.exhibitError.hidden === false) return;
  els.overlayImage.src = current.image_url;
  els.overlay.classList.remove("hidden");
  els.overlay.classList.add("is-opening");
  els.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.overlayClose.focus();
  window.setTimeout(() => els.overlay.classList.remove("is-opening"), 430);
}

function closeImageViewer() {
  if (els.overlay.classList.contains("hidden")) return;
  els.overlay.classList.add("hidden");
  els.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  els.exhibitTrigger.focus();
}

/* ---------- Events & Keyboard Shortcuts ---------- */

els.topicFilter.addEventListener("change", (event) => applyFilter(event.target.value));
els.prev.addEventListener("click", previousQuestion);
els.check.addEventListener("click", checkAnswer);
els.next.addEventListener("click", nextQuestion);
els.exhibitTrigger.addEventListener("click", openImageViewer);
els.overlayClose.addEventListener("click", (event) => {
  event.stopPropagation();
  closeImageViewer();
});
els.overlay.addEventListener("click", (event) => {
  if (event.target === els.overlay || event.target.classList.contains("overlay-frame")) closeImageViewer();
});

document.addEventListener("keydown", (event) => {
  // Modal / overlay escape handling
  if (event.key === "Escape") {
    if (!els.overlay.classList.contains("hidden")) {
      event.preventDefault();
      closeImageViewer();
      return;
    }
    if (els.examResultModal && !els.examResultModal.classList.contains("hidden")) {
      event.preventDefault();
      exitExamMode();
      return;
    }
  }

  if (!els.overlay.classList.contains("hidden")) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return; // keep system shortcuts

  // Guardrail: disable shortcuts while focused in inputs/textareas/selects
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;
  const onInteractive = tag === "BUTTON" || tag === "A";

  // Quick zoom exhibit (Z key)
  if (event.key === "z" || event.key === "Z") {
    const current = currentQuestion();
    if (current?.image_url) {
      event.preventDefault();
      if (els.overlay.classList.contains("hidden")) openImageViewer();
      else closeImageViewer();
      return;
    }
  }

  // Flag current question (F key)
  if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    toggleCurrentFlag();
    return;
  }

  // Answer selection remapped cleanly to displayed options
  if (/^[1-9]$/.test(event.key)) {
    const idx = Number(event.key) - 1;
    const option = els.answers.querySelectorAll(".answer-option")[idx];
    if (option && !option.disabled) option.click();
  } else if (event.key === "Enter") {
    if (onInteractive) return;
    event.preventDefault();
    if (!isExamMode) checkAnswer();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nextQuestion();
  } else if (event.key === "ArrowLeft" || event.key === "p" || event.key === "P") {
    event.preventDefault();
    previousQuestion();
  }
});
