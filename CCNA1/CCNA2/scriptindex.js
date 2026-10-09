const FILTER_STORAGE_KEY = "ccna2.topicFilter";
const RANGE_PRESETS = [
  [1, 4],
  [5, 9],
  [10, 14]
];
const LEAVE_MS = 210;
const ENTER_MS = 430;

let questions = [];          // full question bank (index = stable question id)
let filtered = [];           // ids of questions in the active filter, in bank order
let position = 0;            // logical position inside `filtered`
let displayedId = null;      // id of the question currently rendered in the DOM
let activeFilter = "all";
let transitioning = false;
let transitionTimers = [];
let toastTimer = null;

// Per-question answer history for the current filter session.
// id -> { selected: Set<string>, checked: boolean, correct: boolean }
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
  imageContainer: document.getElementById("imageContainer"),
  image: document.getElementById("questionImage"),
  exhibitTrigger: document.getElementById("exhibitTrigger"),
  exhibitError: document.getElementById("exhibitError"),
  feedback: document.getElementById("feedback"),
  overlay: document.getElementById("quizImageOverlay"),
  overlayImage: document.getElementById("quizOverlayImage"),
  overlayClose: document.getElementById("quizImageClose"),
  toast: document.getElementById("toast")
};

fetch("ccna.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Question bank request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data) || data.length === 0) throw new Error("Question bank is empty.");
    questions = data.map((question, id) => ({ ...question, _topic: parseTopic(question), _id: id }));
    buildTopicFilter();
    applyFilter(readStoredFilter(), { animate: false });
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
  return match ? Number(match[1]) : fallbackIndex + 1;
}

// Topic id lives in `explanation` ("Topic 14.4.9…"); a few records only carry it in the question text.
function parseTopic(question) {
  const sources = [question?.explanation, question?.question];
  for (const source of sources) {
    const match = String(source || "").match(/Topic\s*(\d+(?:\.\d+)*)/i);
    if (match) return { label: match[1], chapter: Number(match[1].split(".")[0]) };
  }
  return null;
}

function getCorrectList(question) {
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

/* ---------- Topic filter ---------- */

function countWhere(predicate) {
  return questions.filter(predicate).length;
}

function matchesFilter(question, filter) {
  if (filter === "all") return true;
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
  const chapters = [...new Set(questions.map((q) => q._topic?.chapter).filter(Number.isFinite))].sort((a, b) => a - b);
  const maxChapter = chapters.length ? chapters[chapters.length - 1] : 0;

  const ranges = RANGE_PRESETS.map(([from, to]) => [from, to]);
  const lastPresetEnd = ranges.length ? ranges[ranges.length - 1][1] : 0;
  if (maxChapter > lastPresetEnd) ranges.push([lastPresetEnd + 1, maxChapter]);

  const makeOption = (value, label) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${label} (${countWhere((q) => matchesFilter(q, value))})`;
    return option;
  };

  select.innerHTML = "";
  select.appendChild(makeOption("all", "All topics"));

  const rangeGroup = document.createElement("optgroup");
  rangeGroup.label = "Topic ranges";
  ranges.forEach(([from, to]) => {
    const label = from === to ? `Topic ${from}` : `Topics ${from}–${to}`;
    rangeGroup.appendChild(makeOption(`range:${from}-${to}`, label));
  });
  select.appendChild(rangeGroup);

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
    /* storage unavailable (private mode / file://) – filter simply won't persist */
  }
}

function applyFilter(value, { animate = true } = {}) {
  activeFilter = isKnownFilter(value) ? value : "all";
  els.topicFilter.value = activeFilter;
  storeFilter(activeFilter);

  cancelTransition();
  session.clear();
  filtered = questions.filter((q) => matchesFilter(q, activeFilter)).map((q) => q._id);
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

// `position` is updated immediately so rapid clicks always accumulate correctly;
// the DOM catches up once the leave animation has finished.
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
  els.questionBadge.textContent = `QUESTION ${position + 1} / ${filtered.length}`;
  els.questionBadge.title = `Record #${number} in the question bank`;

  if (current._topic) {
    els.topicBadge.textContent = `TOPIC ${current._topic.label}`;
    els.topicBadge.hidden = false;
  } else {
    els.topicBadge.hidden = true;
  }

  renderImage(current, number);
  renderAnswers(options, entry);

  if (entry.checked) {
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
  els.question.textContent = "No questions found for this topic.";
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
  els.check.disabled = transitioning || !hasChoices || Boolean(entry?.checked);
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

  // Ignore late load/error events from a previously displayed exhibit.
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

function renderAnswers(options, entry) {
  const correctList = getCorrectList(currentQuestion());
  els.answers.innerHTML = "";
  els.answers.classList.toggle("is-restored", entry.checked);
  els.empty.hidden = options.length > 0;

  options.forEach((optText, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    button.dataset.answer = optText;
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

    if (entry.checked) {
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

/* ---------- Answering ---------- */

function toggleAnswer(optText) {
  const current = currentQuestion();
  if (!current || transitioning) return;

  const entry = getEntry(displayedId);
  if (entry.checked) return;

  const maxAllowed = getCorrectList(current).length;

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
  if (!current || transitioning) return;

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

/* ---------- Events ---------- */

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
  if (event.key === "Escape" && !els.overlay.classList.contains("hidden")) {
    event.preventDefault();
    closeImageViewer();
    return;
  }

  if (!els.overlay.classList.contains("hidden")) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return; // keep browser shortcuts (e.g. Alt+← = back)

  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;
  const onInteractive = tag === "BUTTON" || tag === "A";

  if (/^[1-9]$/.test(event.key)) {
    const option = els.answers.querySelectorAll(".answer-option")[Number(event.key) - 1];
    if (option && !option.disabled) option.click();
  } else if (event.key === "Enter") {
    if (onInteractive) return; // let the focused control handle Enter natively
    event.preventDefault();
    checkAnswer();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nextQuestion();
  } else if (event.key === "ArrowLeft" || event.key === "p" || event.key === "P") {
    event.preventDefault();
    previousQuestion();
  }
});
