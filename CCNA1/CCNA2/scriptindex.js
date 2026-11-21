const FILTER_STORAGE_KEY = "ccna2.topicFilter";
const RANGE_PRESETS = [
  [1, 4],
  [5, 6],
  [7, 9],
  [10, 13],
  [14, 16]
];
const LEAVE_MS = 90;
const ENTER_MS = 140;

let questions = [];          // full question bank (index = stable question id)
let filtered = [];           // ids of questions in the active filter
let filteredUnshuffled = []; // copy for toggling question shuffle off
let position = 0;            // logical position inside `filtered`
let displayedId = null;      // id of the question currently rendered in the DOM
let activeFilter = "all";
let transitioning = false;
let transitionTimers = [];
let toastTimer = null;
let viewerOpenedByTrigger = false;

// Study & Exam Feature States
let isShuffleQuestions = false;
let isShuffleOptions = false;
let isExamMode = false;
let examTimeRemaining = 3600; // 60 minutes in seconds
let examTimerInterval = null;
let examSavedFilter = "all";

// Per-question session state:
// id -> { selected: Set<string>, checked: boolean, correct: boolean, displayOptions?: string[], matches?: Map<number, string[]>, activeSource?: string|null, displaySources?: string[] }
const session = new Map();

const els = {
  card: document.getElementById("quizCard"),
  question: document.getElementById("question"),
  questionBadge: document.getElementById("questionBadge"),
  topicBadge: document.getElementById("topicBadge"),
  multiHintBadge: document.getElementById("multiHintBadge"),
  topicFilter: document.getElementById("topicFilter"),
  answers: document.getElementById("answers"),
  matchingContainer: document.getElementById("matchingContainer"),
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
  hintSelectKeys: document.getElementById("hintSelectKeys"),
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

    buildTopicFilter();

    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get("filter");
    const qParam = urlParams.get("q");

    const initialFilter = (filterParam && isKnownFilter(filterParam)) ? filterParam : readStoredFilter();
    applyFilter(initialFilter, { animate: false });

    if (qParam) {
      const targetNum = Number(qParam);
      let targetIdx = filtered.findIndex((id) => getQuestionNumber(questions[id], id) === targetNum);
      if (targetIdx === -1 && !filterParam) {
        applyFilter("all", { animate: false });
        targetIdx = filtered.findIndex((id) => getQuestionNumber(questions[id], id) === targetNum);
      }
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

/* ---------- Data helpers (delegating to CCNAStorage) ---------- */

function cleanQuestionText(text = "") {
  return window.CCNAStorage.cleanQuestionText(text);
}

function getQuestionNumber(question, fallbackIndex) {
  return window.CCNAStorage.getQuestionNumber(question, fallbackIndex);
}

function parseTopic(question) {
  return window.CCNAStorage.parseTopic(question);
}

function isMatching(question) {
  return window.CCNAStorage.isMatchingQuestion(question);
}

function getCorrectList(question) {
  const progress = window.CCNAStorage.loadProgress();
  return window.CCNAStorage.getEffectiveCorrectAnswers(question, progress.customOverrides);
}

function getOptions(question) {
  return Array.isArray(question?.options) ? question.options : [];
}

function getEntry(id) {
  if (!session.has(id)) session.set(id, { selected: new Set(), checked: false, correct: false });
  return session.get(id);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- Topic filter & Quick Modes ---------- */

function countWhere(predicate) {
  return questions.filter(predicate).length;
}

function matchesFilter(question, filter, progress) {
  const qNum = getQuestionNumber(question, question._id);

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
  const progress = window.CCNAStorage.loadProgress();

  const chapters = [...new Set(questions.map((q) => q._topic?.chapter).filter(Number.isFinite))].sort((a, b) => a - b);
  const maxChapter = chapters.length ? chapters[chapters.length - 1] : 0;

  const ranges = RANGE_PRESETS.map(([from, to]) => [from, to]);
  const lastPresetEnd = ranges.length ? ranges[ranges.length - 1][1] : 0;
  if (maxChapter > lastPresetEnd) ranges.push([lastPresetEnd + 1, maxChapter]);

  const makeOption = (value, label, customCount) => {
    const option = document.createElement("option");
    option.value = value;
    const count = customCount !== undefined ? customCount : countWhere((q) => matchesFilter(q, value, progress));
    option.textContent = `${label} (${count})`;
    return option;
  };

  select.innerHTML = "";

  const quickGroup = document.createElement("optgroup");
  quickGroup.label = "Study & Progress Modes";
  quickGroup.appendChild(makeOption("all", "All questions", questions.length));
  quickGroup.appendChild(makeOption("unseen", "Unseen only (Not completed yet)"));
  quickGroup.appendChild(makeOption("mistakes", "Mistakes only"));
  quickGroup.appendChild(makeOption("flagged", "Flagged only"));
  select.appendChild(quickGroup);

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

  if (isKnownFilter(activeFilter)) {
    select.value = activeFilter;
  }
  select.disabled = isExamMode;
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
  const progress = window.CCNAStorage.loadProgress();
  filtered = questions.filter((q) => matchesFilter(q, activeFilter, progress)).map((q) => q._id);
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

function updateSelectionHintBadge(current, entry) {
  if (!els.multiHintBadge) return;

  if (!current) {
    els.multiHintBadge.hidden = true;
    return;
  }

  if (isMatching(current)) {
    const expectedTotal = getExpectedMatchCount(current);
    const placedCount = getPlacedMatchCount(current, entry);
    els.multiHintBadge.textContent = `MATCH ${placedCount}/${expectedTotal}`;
    els.multiHintBadge.hidden = false;
    return;
  }

  const requiredCount = getCorrectList(current).length;
  if (requiredCount > 1) {
    els.multiHintBadge.textContent = `CHOOSE ${requiredCount} (${entry.selected.size}/${requiredCount})`;
    els.multiHintBadge.hidden = false;
  } else {
    els.multiHintBadge.hidden = true;
  }
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

  if (els.flagBtn) {
    const isFlagged = window.CCNAStorage.isQuestionFlagged(number);
    els.flagBtn.classList.toggle("is-flagged", isFlagged);
    const flagLabel = els.flagBtn.querySelector(".flag-label");
    if (flagLabel) flagLabel.textContent = isFlagged ? "Flagged" : "Flag";
  }

  renderQuestionNote(number);
  renderImage(current, number);

  if (isMatching(current)) {
    els.answers.innerHTML = "";
    els.answers.hidden = true;
    els.empty.hidden = true;
    els.matchingContainer.hidden = false;
    renderMatchingBoard(current, entry);
    if (els.hintSelectKeys) {
      const n = current.matching.sources.length;
      els.hintSelectKeys.textContent = n > 1 ? `1–${Math.min(n, 9)}` : "1";
    }
  } else {
    els.matchingContainer.innerHTML = "";
    els.matchingContainer.hidden = true;
    els.answers.hidden = false;
    const options = getOptions(current);
    renderAnswers(options, entry);
    if (els.hintSelectKeys) {
      const n = options.length;
      els.hintSelectKeys.textContent = n > 1 ? `1–${Math.min(n, 9)}` : "1";
    }
  }

  updateSelectionHintBadge(current, entry);

  if (!isExamMode && entry.checked) {
    showFeedback(entry.correct, current);
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
  if (els.multiHintBadge) els.multiHintBadge.hidden = true;
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
  els.answers.hidden = false;
  els.matchingContainer.innerHTML = "";
  els.matchingContainer.hidden = true;
  els.empty.hidden = true;
  if (els.noteBox) els.noteBox.hidden = true;
  resetFeedback();
  updateControls();
}

function updateControls() {
  const current = currentQuestion();
  const entry = displayedId === null ? null : getEntry(displayedId);
  const hasChoices = current && (
    isMatching(current) ||
    (getOptions(current).length > 0 && getCorrectList(current).length > 0)
  );

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

/* ---------- Multiple-Choice Answers ---------- */

function renderAnswers(options, entry) {
  const correctList = getCorrectList(currentQuestion());
  els.answers.innerHTML = "";
  els.empty.hidden = options.length > 0;

  let displayOptions = options;
  if (isShuffleOptions) {
    if (!entry.displayOptions) {
      entry.displayOptions = shuffleArray([...options]);
    }
    displayOptions = entry.displayOptions;
  } else {
    entry.displayOptions = options;
  }

  displayOptions.forEach((optText, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    button.dataset.answer = optText;
    button.dataset.index = String(index);

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

/* ---------- Interactive Matching Engine ---------- */

function getExpectedMatchCount(question) {
  if (!isMatching(question)) return 0;
  return question.matching.targets.reduce((sum, t) => sum + (Array.isArray(t.expected) ? t.expected.length : 0), 0);
}

function ensureMatchingEntry(question, entry) {
  if (!(entry.matches instanceof Map)) entry.matches = new Map();
  if (entry.activeSource === undefined) entry.activeSource = null;

  const sources = question.matching.sources || [];
  if (isShuffleOptions) {
    if (!entry.displaySources) entry.displaySources = shuffleArray([...sources]);
  } else {
    entry.displaySources = [...sources];
  }
}

function getPlacedSet(entry) {
  const placed = new Set();
  if (entry.matches instanceof Map) {
    entry.matches.forEach((arr) => arr.forEach((item) => placed.add(item)));
  }
  return placed;
}

function getPlacedMatchCount(question, entry) {
  ensureMatchingEntry(question, entry);
  let count = 0;
  entry.matches.forEach((arr) => { count += arr.length; });
  return count;
}

function removeSourceFromAllTargets(entry, sourceStr) {
  if (!(entry.matches instanceof Map)) return;
  entry.matches.forEach((arr, tIdx) => {
    if (arr.includes(sourceStr)) {
      const next = arr.filter((s) => s !== sourceStr);
      if (next.length) entry.matches.set(tIdx, next);
      else entry.matches.delete(tIdx);
    }
  });
}

function assignSourceToTarget(question, entry, sourceStr, targetIdx) {
  if (!isExamMode && entry.checked) return;
  ensureMatchingEntry(question, entry);

  const target = question.matching.targets[targetIdx];
  if (!target) return;

  const capacity = target.capacity || 1;
  const currentArr = entry.matches.get(targetIdx) || [];

  // Prevent adding duplicate if already in this target
  if (currentArr.includes(sourceStr)) {
    entry.activeSource = null;
    renderMatchingBoard(question, entry);
    return;
  }

  // If bucket at capacity > 1 is full, keep existing placement and inform user
  if (capacity > 1 && currentArr.length >= capacity) {
    showToast(`"${target.label}" already holds ${capacity} items. Click a placed item to remove it.`);
    return;
  }

  removeSourceFromAllTargets(entry, sourceStr);

  if (capacity === 1) {
    entry.matches.set(targetIdx, [sourceStr]);
  } else {
    const updated = entry.matches.get(targetIdx) || [];
    entry.matches.set(targetIdx, [...updated, sourceStr]);
  }

  entry.activeSource = null;
  renderMatchingBoard(question, entry);
  updateSelectionHintBadge(question, entry);
  updateControls();
}

function unassignFromTarget(question, entry, sourceStr, targetIdx) {
  if (!isExamMode && entry.checked) return;
  const arr = entry.matches.get(targetIdx) || [];
  const next = arr.filter((s) => s !== sourceStr);
  if (next.length) entry.matches.set(targetIdx, next);
  else entry.matches.delete(targetIdx);

  renderMatchingBoard(question, entry);
  updateSelectionHintBadge(question, entry);
  updateControls();
}

function clearAllMatches(question, entry) {
  if (!isExamMode && entry.checked) return;
  entry.matches = new Map();
  entry.activeSource = null;
  renderMatchingBoard(question, entry);
  updateSelectionHintBadge(question, entry);
  updateControls();
}

function evaluateMatching(question, entry) {
  ensureMatchingEntry(question, entry);
  const targets = question.matching.targets || [];
  const expectedTotal = getExpectedMatchCount(question);
  let placedCount = 0;

  const targetResults = targets.map((target, idx) => {
    const placed = entry.matches.get(idx) || [];
    placedCount += placed.length;
    const expected = target.expected || [];
    const exactSize = placed.length === expected.length;
    const allMatch = exactSize && expected.every((item) => placed.includes(item));
    return { target, placed, expected, isCorrect: allMatch };
  });

  const isCorrect = targetResults.every((r) => r.isCorrect);
  const userSummary = targets.flatMap((t, idx) =>
    (entry.matches.get(idx) || []).map((item) => `${t.label} → ${item}`)
  );
  const correctSummary = getCorrectList(question);

  return { placedCount, expectedTotal, isCorrect, targetResults, userSummary, correctSummary };
}

function renderMatchingBoard(question, entry) {
  ensureMatchingEntry(question, entry);
  const locked = !isExamMode && entry.checked;
  const container = els.matchingContainer;
  container.innerHTML = "";

  const placedSet = getPlacedSet(entry);
  const poolItems = entry.displaySources.filter((src) => !placedSet.has(src));

  // Left Column: Options / Source Chips
  const leftCol = document.createElement("div");
  leftCol.className = "matching-col";

  const leftHead = document.createElement("div");
  leftHead.className = "matching-col-head";
  const leftLabel = document.createElement("span");
  leftLabel.textContent = locked ? "Unused items" : "Options — click or drag";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "matching-clear-btn";
  clearBtn.textContent = "Clear matches";
  clearBtn.disabled = locked || placedSet.size === 0;
  clearBtn.addEventListener("click", () => clearAllMatches(question, entry));

  leftHead.append(leftLabel, clearBtn);

  const poolBox = document.createElement("div");
  poolBox.className = "matching-pool";

  if (!locked) {
    poolBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    poolBox.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedSource = e.dataTransfer.getData("text/plain");
      if (draggedSource) {
        removeSourceFromAllTargets(entry, draggedSource);
        entry.activeSource = null;
        renderMatchingBoard(question, entry);
        updateSelectionHintBadge(question, entry);
        updateControls();
      }
    });
  }

  if (poolItems.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "matching-pool-empty";
    emptyMsg.textContent = locked ? "All options were placed." : "All items placed in targets.";
    poolBox.appendChild(emptyMsg);
  } else {
    poolItems.forEach((srcText, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "matching-chip";
      chip.disabled = locked;
      if (entry.activeSource === srcText && !locked) {
        chip.classList.add("is-selected");
      }
      chip.setAttribute("aria-pressed", String(entry.activeSource === srcText));

      const numSpan = document.createElement("span");
      numSpan.className = "matching-chip-idx";
      numSpan.textContent = String(idx + 1);

      const textSpan = document.createElement("span");
      textSpan.textContent = srcText;

      chip.append(numSpan, textSpan);

      if (!locked) {
        chip.draggable = true;
        chip.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", srcText);
          e.dataTransfer.effectAllowed = "move";
          entry.activeSource = srcText;
        });
        chip.addEventListener("click", () => {
          if (document.activeElement === els.exhibitTrigger) els.exhibitTrigger.blur();
          entry.activeSource = entry.activeSource === srcText ? null : srcText;
          renderMatchingBoard(question, entry);
        });
      }

      poolBox.appendChild(chip);
    });
  }

  leftCol.append(leftHead, poolBox);

  // Right Column: Target Slots / Buckets
  const rightCol = document.createElement("div");
  rightCol.className = "matching-col";

  const rightHead = document.createElement("div");
  rightHead.className = "matching-col-head";
  const rightLabel = document.createElement("span");
  rightLabel.textContent = entry.activeSource && !locked
    ? "Targets — click a target to assign"
    : "Targets";
  rightHead.appendChild(rightLabel);

  const targetsWrap = document.createElement("div");
  targetsWrap.className = "matching-targets";

  const evalResult = locked ? evaluateMatching(question, entry) : null;

  question.matching.targets.forEach((target, targetIdx) => {
    const placed = entry.matches.get(targetIdx) || [];
    const cap = target.capacity || 1;
    const expected = target.expected || [];

    const card = document.createElement("div");
    card.className = "matching-target-card";
    if (!locked && entry.activeSource) {
      card.classList.add("is-drop-ready");
    }

    if (locked && evalResult) {
      card.classList.add(evalResult.targetResults[targetIdx].isCorrect ? "is-target-correct" : "is-target-wrong");
    }

    if (!locked) {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".matching-placed-chip")) return;
        if (!entry.activeSource) {
          showToast("Select an option on the left first, then click a target.");
          return;
        }
        assignSourceToTarget(question, entry, entry.activeSource, targetIdx);
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("is-drag-over");
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("is-drag-over");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("is-drag-over");
        const draggedSource = e.dataTransfer.getData("text/plain");
        if (draggedSource) {
          assignSourceToTarget(question, entry, draggedSource, targetIdx);
        }
      });
    }

    const head = document.createElement("div");
    head.className = "matching-target-head";

    const labelEl = document.createElement("span");
    labelEl.className = "matching-target-label";
    labelEl.textContent = target.label;

    const capEl = document.createElement("span");
    capEl.className = "matching-target-cap";
    capEl.textContent = cap > 1 ? `${placed.length}/${cap}` : (placed.length ? "1/1" : "");

    head.append(labelEl, capEl);
    card.appendChild(head);

    const slotsWrap = document.createElement("div");
    slotsWrap.className = "matching-slots";

    placed.forEach((itemText) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "matching-placed-chip";
      if (locked) {
        chip.classList.add("is-locked", expected.includes(itemText) ? "is-correct" : "is-wrong");
        chip.disabled = true;
      }

      const txt = document.createElement("span");
      txt.textContent = itemText;
      chip.appendChild(txt);

      if (!locked) {
        chip.title = "Click to remove match";
        chip.draggable = true;
        chip.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", itemText);
          e.dataTransfer.effectAllowed = "move";
        });
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          unassignFromTarget(question, entry, itemText, targetIdx);
        });

        const removeMark = document.createElement("span");
        removeMark.className = "matching-remove-mark";
        removeMark.setAttribute("aria-hidden", "true");
        removeMark.textContent = "×";
        chip.appendChild(removeMark);
      }

      slotsWrap.appendChild(chip);
    });

    if (placed.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "matching-slot-placeholder";
      placeholder.textContent = expected.length === 0 && locked
        ? "Correctly left empty (unused distractor)"
        : (!locked ? (entry.activeSource ? "Click to place here" : "Click option left or drop here") : "Empty");
      slotsWrap.appendChild(placeholder);
    }

    card.appendChild(slotsWrap);

    if (locked && evalResult && !evalResult.targetResults[targetIdx].isCorrect) {
      const correction = document.createElement("div");
      correction.className = "matching-correction";
      const strong = document.createElement("strong");
      strong.textContent = "Expected: ";
      correction.appendChild(strong);
      correction.appendChild(document.createTextNode(expected.length ? expected.join(" · ") : "Leave empty (unused target)"));
      card.appendChild(correction);
    }

    targetsWrap.appendChild(card);
  });

  rightCol.append(rightHead, targetsWrap);
  container.append(leftCol, rightCol);
}

/* ---------- Answering & Progress Persistence ---------- */

function toggleAnswer(optText) {
  const current = currentQuestion();
  if (!current || transitioning || isMatching(current)) return;

  if (document.activeElement === els.exhibitTrigger) els.exhibitTrigger.blur();

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
  updateSelectionHintBadge(current, entry);
}

function checkAnswer() {
  const current = currentQuestion();
  if (!current || transitioning || isExamMode) return;

  const entry = getEntry(displayedId);
  if (entry.checked) return;

  const qNum = getQuestionNumber(current, displayedId);

  if (isMatching(current)) {
    const res = evaluateMatching(current, entry);
    if (res.placedCount < res.expectedTotal) {
      showToast(`Place all ${res.expectedTotal} matches first (${res.placedCount}/${res.expectedTotal} placed).`);
      return;
    }

    entry.checked = true;
    entry.correct = res.isCorrect;

    renderMatchingBoard(current, entry);
    showFeedback(entry.correct, current);
    updateControls();

    window.CCNAStorage.recordAnswerResult({
      qNumber: qNum,
      questionId: displayedId,
      selected: res.userSummary,
      isCorrect: entry.correct
    });

    if (entry.correct && activeFilter === "mistakes") {
      showToast(`Mastered! Question #${qNum} removed from mistakes review.`);
    }

    buildTopicFilter();
    return;
  }

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

  showFeedback(entry.correct, current);
  updateControls();

  window.CCNAStorage.recordAnswerResult({
    qNumber: qNum,
    questionId: displayedId,
    selected: entry.selected,
    isCorrect: entry.correct
  });

  if (entry.correct && activeFilter === "mistakes") {
    showToast(`Mastered! Question #${qNum} removed from mistakes review.`);
  }

  buildTopicFilter();
}

function showFeedback(isCorrect, question) {
  els.feedback.className = `feedback is-visible ${isCorrect ? "is-success" : "is-error"}`;
  els.feedback.innerHTML = "";

  const heading = document.createElement("strong");
  if (isCorrect) {
    heading.textContent = "Correct.";
  } else if (isMatching(question)) {
    heading.textContent = "Incorrect. Expected matches are shown above.";
  } else {
    heading.textContent = "Incorrect. The correct answer is highlighted above.";
  }
  els.feedback.appendChild(heading);

  const expText = window.CCNAStorage.formatExplanation(question?.explanation);
  if (expText) {
    const expEl = document.createElement("div");
    expEl.className = "feedback-explanation";
    expEl.textContent = expText;
    els.feedback.appendChild(expEl);
  }
}

function resetFeedback() {
  els.feedback.className = "feedback";
  els.feedback.innerHTML = "";
}

/* ---------- Personal Notes Management ---------- */

function renderQuestionNote(number) {
  if (!els.noteBox) return;
  els.noteBox.hidden = isExamMode;
  if (els.noteContentPanel) els.noteContentPanel.hidden = true;

  const note = window.CCNAStorage.getQuestionNote(number);
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
    window.CCNAStorage.saveQuestionNote(num, text);
    renderQuestionNote(num);
    showToast(text ? `Note saved for Question #${num}` : "Note cleared.");
  });
}

if (els.noteClearBtn) {
  els.noteClearBtn.addEventListener("click", () => {
    const current = currentQuestion();
    if (!current) return;
    const num = getQuestionNumber(current, displayedId);
    els.noteInput.value = "";
    window.CCNAStorage.saveQuestionNote(num, "");
    renderQuestionNote(num);
    showToast("Note cleared.");
  });
}

/* ---------- Bookmark / Flag Question ---------- */

function toggleCurrentFlag() {
  const current = currentQuestion();
  if (!current) return;
  const num = getQuestionNumber(current, displayedId);
  const isNowFlagged = window.CCNAStorage.toggleQuestionFlag(num);
  if (els.flagBtn) {
    els.flagBtn.classList.toggle("is-flagged", isNowFlagged);
    const label = els.flagBtn.querySelector(".flag-label");
    if (label) label.textContent = isNowFlagged ? "Flagged" : "Flag";
  }
  showToast(isNowFlagged ? `Question #${num} flagged for review (F)` : `Question #${num} unflagged`);
  buildTopicFilter();
}

if (els.flagBtn) {
  els.flagBtn.addEventListener("click", toggleCurrentFlag);
}

/* ---------- Shuffle Toggles ---------- */

if (els.shuffleQuestionsBtn) {
  els.shuffleQuestionsBtn.addEventListener("click", () => {
    if (isExamMode) return;
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

    session.forEach((val) => {
      delete val.displayOptions;
      delete val.displaySources;
    });

    renderCurrent();
    showToast(isShuffleOptions ? "Options will be shuffled." : "Options restored to original order.");
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
  els.topicFilter.disabled = true;
  if (els.shuffleQuestionsBtn) els.shuffleQuestionsBtn.disabled = true;

  const pool = questions.map((q) => q._id);
  shuffleArray(pool);
  filtered = pool.slice(0, Math.min(50, pool.length));
  position = 0;
  session.clear();

  examTimeRemaining = 3600;
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
  const chapterBreakdown = new Map();
  const batchResults = [];

  filtered.forEach((id) => {
    const q = questions[id];
    const qNum = getQuestionNumber(q, id);
    const entry = getEntry(id);

    let isCorrect = false;
    let selectedForRecord = entry.selected;

    if (isMatching(q)) {
      const res = evaluateMatching(q, entry);
      isCorrect = res.isCorrect;
      selectedForRecord = res.userSummary;
    } else {
      const correctList = getCorrectList(q);
      isCorrect = correctList.length > 0 &&
        entry.selected.size === correctList.length &&
        [...entry.selected].every((ans) => correctList.includes(ans));
    }

    const chapterKey = q._topic?.chapter ?? 0;
    if (!chapterBreakdown.has(chapterKey)) chapterBreakdown.set(chapterKey, { total: 0, correct: 0 });
    const stats = chapterBreakdown.get(chapterKey);
    stats.total += 1;

    if (isCorrect) {
      correctCount += 1;
      stats.correct += 1;
    } else {
      wrongCount += 1;
    }

    batchResults.push({
      qNumber: qNum,
      questionId: id,
      selected: selectedForRecord,
      isCorrect
    });
  });

  window.CCNAStorage.recordBatchResults(batchResults);

  const total = filtered.length || 1;
  const accuracy = Math.round((correctCount / total) * 100);
  const isPass = accuracy >= 82.5;

  els.examResultTitle.textContent = isTimeUp ? "Time's Up! Mock Exam Results" : "Mock Exam Complete";
  els.examScoreLarge.textContent = `${correctCount} / ${total}`;
  els.examPassBadge.textContent = isPass ? "PASS" : "FAIL";
  els.examScoreBanner.className = `exam-score-banner ${isPass ? "is-pass" : "is-fail"}`;
  els.examAccuracyPct.textContent = `${accuracy}%`;
  els.examMissedCount.textContent = `${wrongCount} question${wrongCount === 1 ? "" : "s"}`;

  els.examTopicBreakdown.innerHTML = "";
  const sortedChapters = [...chapterBreakdown.keys()].sort((a, b) => a - b);
  sortedChapters.forEach((ch) => {
    const item = chapterBreakdown.get(ch);
    const row = document.createElement("div");
    row.className = "exam-topic-item";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = ch > 0 ? `Topic ${ch}` : "Unassigned";

    const valStrong = document.createElement("strong");
    valStrong.textContent = `${item.correct} / ${item.total} (${Math.round((item.correct / item.total) * 100)}%)`;

    row.append(labelSpan, valStrong);
    els.examTopicBreakdown.appendChild(row);
  });

  els.examResultModal.classList.remove("hidden");
  els.examResultModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function exitExamMode({ targetFilter } = {}) {
  isExamMode = false;
  clearInterval(examTimerInterval);
  els.card.classList.remove("is-exam-mode");
  els.examModeBtn.classList.remove("is-active");
  els.examTimer.hidden = true;
  els.topicFilter.disabled = false;
  if (els.shuffleQuestionsBtn) els.shuffleQuestionsBtn.disabled = false;
  if (els.noteBox) els.noteBox.hidden = false;

  els.examResultModal.classList.add("hidden");
  els.examResultModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  buildTopicFilter();
  applyFilter(targetFilter || examSavedFilter || "all", { animate: false });
}

if (els.examModeBtn) {
  els.examModeBtn.addEventListener("click", () => {
    if (isExamMode) {
      if (window.confirm("Exit current Mock Exam? Exam progress will be discarded.")) exitExamMode();
    } else {
      if (window.confirm("Start a timed 60-minute CCNA Mock Exam?\n\n• 50 randomized questions across all topics\n• Immediate feedback hidden until finish\n• Missed questions automatically tracked for review")) {
        startMockExam();
      }
    }
  });
}

if (els.finishExam) {
  els.finishExam.addEventListener("click", () => {
    const unansweredInExam = filtered.filter((id) => {
      const q = questions[id];
      const entry = getEntry(id);
      if (isMatching(q)) return getPlacedMatchCount(q, entry) < getExpectedMatchCount(q);
      return entry.selected.size === 0;
    }).length;

    const msg = unansweredInExam > 0
      ? `You have ${unansweredInExam} incomplete question${unansweredInExam === 1 ? "" : "s"} in this exam. Finish and submit anyway?`
      : "Ready to finish and submit your Mock Exam?";
    if (window.confirm(msg)) {
      finishMockExam(false);
    }
  });
}

if (els.examReviewMistakesBtn) {
  els.examReviewMistakesBtn.addEventListener("click", () => {
    exitExamMode({ targetFilter: "mistakes" });
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
  if (els.multiHintBadge) els.multiHintBadge.hidden = true;
  els.question.textContent = "The question bank could not be loaded.";
  els.answers.innerHTML = "";
  els.matchingContainer.innerHTML = "";
  els.matchingContainer.hidden = true;
  els.empty.hidden = false;
  els.empty.querySelector("strong").textContent = "Check that ccna.json is in the same folder.";
  els.empty.querySelector("span").textContent = "The interface is ready, but the data source did not respond.";
  els.topicFilter.disabled = true;
  els.prev.disabled = true;
  els.check.disabled = true;
  els.next.disabled = true;
}

function openImageViewer({ fromTrigger = false } = {}) {
  const current = currentQuestion();
  if (!current?.image_url || els.exhibitError.hidden === false) return;
  viewerOpenedByTrigger = fromTrigger;
  els.overlayImage.src = current.image_url;
  els.overlay.classList.remove("hidden");
  els.overlay.classList.add("is-opening");
  els.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.overlayClose.focus();
  window.setTimeout(() => els.overlay.classList.remove("is-opening"), 200);
}

function closeImageViewer() {
  if (els.overlay.classList.contains("hidden")) return;
  els.overlay.classList.add("hidden");
  els.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (viewerOpenedByTrigger) {
    els.exhibitTrigger.focus();
  } else {
    els.overlayClose.blur();
  }
  viewerOpenedByTrigger = false;
}

/* ---------- Events & Keyboard Shortcuts ---------- */

els.topicFilter.addEventListener("change", (event) => {
  if (!isExamMode) applyFilter(event.target.value);
});
els.prev.addEventListener("click", previousQuestion);
els.check.addEventListener("click", checkAnswer);
els.next.addEventListener("click", nextQuestion);
els.exhibitTrigger.addEventListener("click", () => openImageViewer({ fromTrigger: true }));
els.overlayClose.addEventListener("click", (event) => {
  event.stopPropagation();
  closeImageViewer();
});
els.overlay.addEventListener("click", (event) => {
  if (event.target === els.overlay || event.target.classList.contains("overlay-frame")) closeImageViewer();
});

document.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;

  if (event.altKey || event.ctrlKey || event.metaKey) return;

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

  // Toggle exhibit quick-zoom (Z key) both when closed and when open
  if (event.key === "z" || event.key === "Z") {
    const current = currentQuestion();
    if (current?.image_url) {
      event.preventDefault();
      if (els.overlay.classList.contains("hidden")) openImageViewer({ fromTrigger: false });
      else closeImageViewer();
      return;
    }
  }

  // Block remaining shortcuts while lightbox or exam result modal is open
  if (!els.overlay.classList.contains("hidden")) return;
  if (els.examResultModal && !els.examResultModal.classList.contains("hidden")) return;

  if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    toggleCurrentFlag();
    return;
  }

  const current = currentQuestion();
  const entry = displayedId === null ? null : getEntry(displayedId);

  if (/^[1-9]$/.test(event.key)) {
    const idx = Number(event.key) - 1;
    if (current && isMatching(current)) {
      const chip = els.matchingContainer.querySelectorAll(".matching-chip")[idx];
      if (chip && !chip.disabled) {
        chip.focus({ preventScroll: true });
        chip.click();
      }
    } else {
      const option = els.answers.querySelectorAll(".answer-option")[idx];
      if (option && !option.disabled) {
        option.focus({ preventScroll: true });
        option.click();
      }
    }
  } else if (event.key === "Enter") {
    const active = document.activeElement;
    const isNonOptionControl = active &&
      ((active.tagName === "BUTTON" && !active.classList.contains("answer-option") && !active.classList.contains("matching-chip")) || active.tagName === "A");
    if (isNonOptionControl) return;

    event.preventDefault();
    if (isExamMode) {
      nextQuestion();
    } else if (entry && !entry.checked) {
      checkAnswer();
    } else if (entry && entry.checked) {
      nextQuestion();
    }
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nextQuestion();
  } else if (event.key === "ArrowLeft" || event.key === "p" || event.key === "P") {
    event.preventDefault();
    previousQuestion();
  }
});
