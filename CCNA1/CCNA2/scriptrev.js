let allQuestions = [];
const questionByNumber = new Map();
const questionsByChapter = new Map();
let activeTab = "mistakes";
let lastViewerTrigger = null;
let toastTimer = null;

const statCompleted = document.getElementById("statCompleted");
const statMistakes = document.getElementById("statMistakes");
const statAccuracy = document.getElementById("statAccuracy");
const statFlagged = document.getElementById("statFlagged");
const reviewSearch = document.getElementById("reviewSearch");
const resetProgressBtn = document.getElementById("resetProgressBtn");

const tabMistakes = document.getElementById("tabMistakes");
const tabCompleted = document.getElementById("tabCompleted");
const tabTopics = document.getElementById("tabTopics");
const badgeMistakesCount = document.getElementById("badgeMistakesCount");
const badgeCompletedCount = document.getElementById("badgeCompletedCount");

const viewMistakes = document.getElementById("viewMistakes");
const viewCompleted = document.getElementById("viewCompleted");
const viewTopics = document.getElementById("viewTopics");

const mistakesList = document.getElementById("mistakesList");
const mistakesEmpty = document.getElementById("mistakesEmpty");
const mistakesSearchEmpty = document.getElementById("mistakesSearchEmpty");
const mistakesActionBar = document.getElementById("mistakesActionBar");
const mistakesTitleCount = document.getElementById("mistakesTitleCount");

const completedList = document.getElementById("completedList");
const completedEmpty = document.getElementById("completedEmpty");
const completedSearchEmpty = document.getElementById("completedSearchEmpty");

const topicsList = document.getElementById("topicsList");
const topicsSearchEmpty = document.getElementById("topicsSearchEmpty");

const imageOverlay = document.getElementById("imageOverlay");
const overlayImg = imageOverlay.querySelector(".overlay-img");
const closeImageOverlay = document.getElementById("closeImageOverlay");
const toast = document.getElementById("toast");

fetch("ccna.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Question bank request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data)) throw new Error("Question bank is not an array.");
    allQuestions = data;
    questionByNumber.clear();
    questionsByChapter.clear();

    data.forEach((question, idx) => {
      const num = window.CCNAStorage.getQuestionNumber(question, idx);
      const topicObj = window.CCNAStorage.parseTopic(question);
      const enriched = { ...question, _num: num, _topic: topicObj };
      questionByNumber.set(num, enriched);

      const ch = topicObj?.chapter;
      if (Number.isFinite(ch)) {
        if (!questionsByChapter.has(ch)) questionsByChapter.set(ch, []);
        questionsByChapter.get(ch).push(enriched);
      }
    });

    renderAll();
  })
  .catch((error) => {
    console.error(error);
  });

function showToast(message) {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function appendLinesContainer(parent, lines, emptyFallback) {
  const container = document.createElement("div");
  if (!lines || lines.length === 0) {
    const em = document.createElement("em");
    em.textContent = emptyFallback;
    container.appendChild(em);
  } else {
    lines.forEach((line, idx) => {
      if (idx > 0) container.appendChild(document.createElement("br"));
      container.appendChild(document.createTextNode(String(line)));
    });
  }
  parent.appendChild(container);
}

function createRecordBaseCell(question, qNum, extraPillText, extraPillClass, note) {
  const questionCell = document.createElement("div");
  questionCell.className = "record-cell record-question";

  const meta = document.createElement("div");
  meta.className = "record-meta";

  const numSpan = document.createElement("span");
  numSpan.className = "record-number";
  numSpan.textContent = `Q${qNum}`;

  const topicSpan = document.createElement("span");
  topicSpan.className = "record-topic";
  topicSpan.textContent = question._topic ? `Topic ${question._topic.label}` : "CCNA 2";

  meta.append(numSpan, topicSpan);

  if (extraPillText) {
    const pill = document.createElement("span");
    pill.className = extraPillClass;
    pill.textContent = extraPillText;
    meta.appendChild(pill);
  }

  const questionText = document.createElement("p");
  questionText.className = "record-question-text";
  questionText.textContent = window.CCNAStorage.cleanQuestionText(question.question);

  questionCell.append(meta, questionText);

  if (question.image_url) {
    const imgBtn = document.createElement("button");
    imgBtn.type = "button";
    imgBtn.className = "exhibit-thumb-button";
    imgBtn.setAttribute("aria-label", `Open exhibit for question ${qNum}`);

    const img = document.createElement("img");
    img.className = "question-img";
    img.src = question.image_url;
    img.alt = `Exhibit for question ${qNum}`;
    img.loading = "lazy";
    imgBtn.appendChild(img);

    imgBtn.addEventListener("click", () => openImageViewer(question.image_url, imgBtn));
    questionCell.appendChild(imgBtn);
  }

  if (note) {
    const noteEl = document.createElement("div");
    noteEl.className = "record-note";
    const badge = document.createElement("span");
    badge.className = "note-badge";
    badge.textContent = "NOTE";
    const noteSpan = document.createElement("span");
    noteSpan.className = "note-text";
    noteSpan.textContent = note;
    noteEl.append(badge, noteSpan);
    questionCell.appendChild(noteEl);
  }

  return questionCell;
}

function renderAll() {
  const progress = window.CCNAStorage.loadProgress();
  const completedKeys = Object.keys(progress.completedQuestions);
  const mistakeKeys = Object.keys(progress.wrongQuestions);
  const flaggedList = progress.flaggedQuestions;

  const totalCompleted = completedKeys.length;
  const correctCount = completedKeys.filter((k) => progress.completedQuestions[k].status === "correct").length;
  const accuracy = totalCompleted > 0 ? Math.round((correctCount / totalCompleted) * 100) : null;

  statCompleted.textContent = `${totalCompleted} / ${allQuestions.length}`;
  statMistakes.textContent = String(mistakeKeys.length);
  statAccuracy.textContent = accuracy !== null ? `${accuracy}%` : "—";
  statFlagged.textContent = String(flaggedList.length);

  badgeMistakesCount.textContent = String(mistakeKeys.length);
  badgeCompletedCount.textContent = String(totalCompleted);

  renderMistakesView(progress);
  renderCompletedView(progress);
  renderTopicsView(progress);
  filterActiveView();
}

/* ==================== 1. Mistakes Sub-view ==================== */
function renderMistakesView(progress) {
  mistakesList.innerHTML = "";
  const mistakeKeys = Object.keys(progress.wrongQuestions);
  const overrides = progress.customOverrides || {};
  const notes = progress.notes || {};

  if (mistakeKeys.length === 0) {
    mistakesEmpty.hidden = false;
    mistakesSearchEmpty.hidden = true;
    mistakesActionBar.style.display = "none";
    return;
  }

  mistakesEmpty.hidden = true;
  mistakesActionBar.style.display = "";
  mistakesTitleCount.textContent = `You have ${mistakeKeys.length} mistake${mistakeKeys.length === 1 ? "" : "s"} to review`;

  const fragment = document.createDocumentFragment();

  mistakeKeys.forEach((qNumStr) => {
    const qNum = Number(qNumStr);
    const question = questionByNumber.get(qNum);
    if (!question) return;

    const mistakeInfo = progress.wrongQuestions[qNumStr];
    const correctList = window.CCNAStorage.getEffectiveCorrectAnswers(question, overrides);
    const userAnswers = mistakeInfo.wrongAnswers || [];
    const note = notes[qNumStr] || "";
    const formattedExp = window.CCNAStorage.formatExplanation(question.explanation);

    const record = document.createElement("article");
    record.className = "question-record";
    record.dataset.search = [qNum, question.question, ...userAnswers, ...correctList, formattedExp, note].join(" ").toLowerCase();

    const questionCell = createRecordBaseCell(
      question,
      qNum,
      `Missed ${mistakeInfo.missCount || 1}x`,
      "miss-count-pill",
      note
    );

    const answerCell = document.createElement("div");
    answerCell.className = "record-cell";

    const compareBox = document.createElement("div");
    compareBox.className = "answer-comparison";

    const wrongRow = document.createElement("div");
    wrongRow.className = "answer-row answer-row-wrong";
    const wrongLabel = document.createElement("span");
    wrongLabel.className = "answer-row-label";
    wrongLabel.textContent = "Your selection (Incorrect):";
    wrongRow.appendChild(wrongLabel);
    appendLinesContainer(wrongRow, userAnswers, "No answer picked");

    const correctRow = document.createElement("div");
    correctRow.className = "answer-row answer-row-correct";
    const correctLabel = document.createElement("span");
    correctLabel.className = "answer-row-label";
    correctLabel.textContent = "Verified correct answer:";
    correctRow.appendChild(correctLabel);
    appendLinesContainer(correctRow, correctList, "No verified answer");

    compareBox.append(wrongRow, correctRow);

    if (formattedExp) {
      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.textContent = formattedExp;
      compareBox.appendChild(exp);
    }

    answerCell.appendChild(compareBox);

    const actionCell = document.createElement("div");
    actionCell.className = "record-cell record-answer";

    const masterBtn = document.createElement("button");
    masterBtn.type = "button";
    masterBtn.className = "toolbar-action-btn";
    masterBtn.innerHTML = `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m5 13 4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Mark as Mastered</span>`;
    masterBtn.addEventListener("click", () => {
      window.CCNAStorage.markMistakeMastered(qNum);
      showToast(`Question #${qNum} marked as mastered.`);
      renderAll();
    });

    const practiceSingleLink = document.createElement("a");
    practiceSingleLink.className = "btn-practice-topic";
    practiceSingleLink.style.marginTop = "4px";
    practiceSingleLink.href = `index.html?q=${qNum}`;
    practiceSingleLink.textContent = `Drill Q#${qNum}`;

    actionCell.append(masterBtn, practiceSingleLink);
    record.append(questionCell, answerCell, actionCell);
    fragment.appendChild(record);
  });

  mistakesList.appendChild(fragment);
}

/* ==================== 2. Completed History Sub-view ==================== */
function renderCompletedView(progress) {
  completedList.innerHTML = "";
  const notes = progress.notes || {};
  const completedKeys = Object.keys(progress.completedQuestions).sort((a, b) => {
    return (progress.completedQuestions[b].timestamp || 0) - (progress.completedQuestions[a].timestamp || 0);
  });

  if (completedKeys.length === 0) {
    completedEmpty.hidden = false;
    completedSearchEmpty.hidden = true;
    return;
  }

  completedEmpty.hidden = true;
  const fragment = document.createDocumentFragment();

  completedKeys.forEach((qNumStr) => {
    const qNum = Number(qNumStr);
    const question = questionByNumber.get(qNum);
    if (!question) return;

    const recordInfo = progress.completedQuestions[qNumStr];
    const isCorrect = recordInfo.status === "correct";
    const note = notes[qNumStr] || "";
    const dateStr = recordInfo.timestamp
      ? new Date(recordInfo.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";

    const record = document.createElement("article");
    record.className = "question-record";
    record.dataset.search = [qNum, question.question, recordInfo.status, ...(recordInfo.lastSelected || []), note].join(" ").toLowerCase();

    const questionCell = createRecordBaseCell(
      question,
      qNum,
      dateStr || null,
      "",
      note
    );

    const optionsCell = document.createElement("div");
    optionsCell.className = "record-cell";

    const badgeWrap = document.createElement("div");
    badgeWrap.style.marginBottom = "8px";
    const statusPill = document.createElement("span");
    statusPill.className = `status-pill ${isCorrect ? "is-correct" : "is-wrong"}`;
    statusPill.textContent = isCorrect ? "✓ Correct" : "✕ Wrong";
    badgeWrap.appendChild(statusPill);

    const selectionWrap = document.createElement("div");
    selectionWrap.style.fontSize = "0.82rem";
    selectionWrap.style.color = "var(--text-muted)";
    const selHeading = document.createElement("strong");
    selHeading.textContent = "Last selected:";
    selectionWrap.appendChild(selHeading);
    appendLinesContainer(selectionWrap, recordInfo.lastSelected, "None");

    optionsCell.append(badgeWrap, selectionWrap);

    const actionCell = document.createElement("div");
    actionCell.className = "record-cell record-answer";

    const drillLink = document.createElement("a");
    drillLink.className = "btn-practice-topic";
    drillLink.href = `index.html?q=${qNum}`;
    drillLink.textContent = "Open in Quiz";

    actionCell.appendChild(drillLink);

    record.append(questionCell, optionsCell, actionCell);
    fragment.appendChild(record);
  });

  completedList.appendChild(fragment);
}

/* ==================== 3. Topic Breakdown Sub-view ==================== */
function renderTopicsView(progress) {
  topicsList.innerHTML = "";
  const chapters = [...questionsByChapter.keys()].sort((a, b) => a - b);

  const ranges = [
    { label: "Topics 1–4: Switching Concepts, VLANs & Inter-VLAN Routing", filter: "range:1-4", from: 1, to: 4 },
    { label: "Topics 5–6: Redundant Networks (STP & EtherChannel)", filter: "range:5-6", from: 5, to: 6 },
    { label: "Topics 7–9: Available & Reliable Networks (DHCP & FHRP)", filter: "range:7-9", from: 7, to: 9 },
    { label: "Topics 10–13: L2 Security & Wireless LANs", filter: "range:10-13", from: 10, to: 13 },
    { label: "Topics 14–16: Routing Concepts & Static Routing", filter: "range:14-16", from: 14, to: 16 }
  ];

  const fragment = document.createDocumentFragment();

  ranges.forEach((range) => {
    const rangeQuestions = [];
    for (let ch = range.from; ch <= range.to; ch++) {
      if (questionsByChapter.has(ch)) rangeQuestions.push(...questionsByChapter.get(ch));
    }
    if (rangeQuestions.length > 0) {
      fragment.appendChild(buildTopicRow(range.label, range.filter, rangeQuestions, progress));
    }
  });

  const singleHeader = document.createElement("div");
  singleHeader.className = "topic-section-label";
  singleHeader.textContent = "Individual Chapters";
  fragment.appendChild(singleHeader);

  chapters.forEach((ch) => {
    const chapterQuestions = questionsByChapter.get(ch) || [];
    if (chapterQuestions.length > 0) {
      fragment.appendChild(buildTopicRow(`Topic ${ch}`, `topic:${ch}`, chapterQuestions, progress));
    }
  });

  topicsList.appendChild(fragment);
}

function buildTopicRow(title, filterKey, topicQuestions, progress) {
  const total = topicQuestions.length;
  let completed = 0;
  let correct = 0;
  let wrong = 0;

  topicQuestions.forEach((q) => {
    const rec = progress.completedQuestions[String(q._num)];
    if (rec) {
      completed += 1;
      if (rec.status === "correct") correct += 1;
      else wrong += 1;
    }
  });

  const accuracy = completed > 0 ? Math.round((correct / completed) * 100) : 0;
  const correctPct = Math.round((correct / total) * 100);
  const wrongPct = Math.round((wrong / total) * 100);

  const card = document.createElement("article");
  card.className = "topic-row-card";
  card.dataset.search = title.toLowerCase();

  const info = document.createElement("div");
  info.className = "topic-info";
  const titleEl = document.createElement("strong");
  titleEl.textContent = title;
  const subEl = document.createElement("span");
  subEl.textContent = `${total} records total · ${completed} completed`;
  info.append(titleEl, subEl);

  const progressWrap = document.createElement("div");
  progressWrap.className = "topic-progress-wrap";

  const labels = document.createElement("div");
  labels.className = "topic-progress-labels";
  const accSpan = document.createElement("span");
  accSpan.textContent = completed > 0 ? `${accuracy}% Accuracy` : "Not started";
  const countsSpan = document.createElement("span");
  countsSpan.textContent = `${correct} correct / ${wrong} wrong`;
  labels.append(accSpan, countsSpan);

  const track = document.createElement("div");
  track.className = "topic-progress-track";
  const barCorrect = document.createElement("div");
  barCorrect.className = "topic-bar-correct";
  barCorrect.style.width = `${correctPct}%`;
  const barWrong = document.createElement("div");
  barWrong.className = "topic-bar-wrong";
  barWrong.style.width = `${wrongPct}%`;
  track.append(barCorrect, barWrong);

  progressWrap.append(labels, track);

  const practiceLink = document.createElement("a");
  practiceLink.className = "btn-practice-topic";
  practiceLink.href = `index.html?filter=${encodeURIComponent(filterKey)}`;
  practiceLink.innerHTML = `<span>Practice Topic</span><svg viewBox="0 0 24 24" class="icon" aria-hidden="true" style="width:14px; height:14px;"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  card.append(info, progressWrap, practiceLink);
  return card;
}

/* ==================== Tabs & Search Filtering ==================== */
function switchTab(newTab) {
  activeTab = newTab;
  tabMistakes.classList.toggle("active", newTab === "mistakes");
  tabCompleted.classList.toggle("active", newTab === "completed");
  tabTopics.classList.toggle("active", newTab === "topics");

  viewMistakes.hidden = newTab !== "mistakes";
  viewCompleted.hidden = newTab !== "completed";
  viewTopics.hidden = newTab !== "topics";

  filterActiveView();
}

function filterActiveView() {
  const query = reviewSearch.value.trim().toLowerCase();

  let targetPanel = null;
  let searchEmptyEl = null;
  let listHasItems = false;

  if (activeTab === "mistakes") {
    targetPanel = mistakesList;
    searchEmptyEl = mistakesSearchEmpty;
    listHasItems = mistakesEmpty.hidden;
  } else if (activeTab === "completed") {
    targetPanel = completedList;
    searchEmptyEl = completedSearchEmpty;
    listHasItems = completedEmpty.hidden;
  } else if (activeTab === "topics") {
    targetPanel = topicsList;
    searchEmptyEl = topicsSearchEmpty;
    listHasItems = true;
  }

  if (!targetPanel) return;

  const items = targetPanel.querySelectorAll("article");
  let visible = 0;
  items.forEach((item) => {
    const matches = !query || item.dataset.search?.includes(query);
    item.hidden = !matches;
    if (matches) visible += 1;
  });

  if (searchEmptyEl) {
    searchEmptyEl.hidden = !listHasItems || !query || visible > 0;
  }
}

tabMistakes.addEventListener("click", () => switchTab("mistakes"));
tabCompleted.addEventListener("click", () => switchTab("completed"));
tabTopics.addEventListener("click", () => switchTab("topics"));
reviewSearch.addEventListener("input", filterActiveView);

/* ==================== Reset Progress ==================== */
resetProgressBtn.addEventListener("click", () => {
  const confirmed = window.confirm("Are you sure you want to reset all quiz progress, completed records, and mistakes?\n\nPersonal study notes will be safely preserved.");
  if (!confirmed) return;

  window.CCNAStorage.resetProgressHistory();
  showToast("Quiz completion history and mistakes reset.");
  renderAll();
});

/* ==================== Exhibit Image Overlay ==================== */
function openImageViewer(src, trigger) {
  lastViewerTrigger = trigger;
  overlayImg.src = src;
  imageOverlay.classList.remove("hidden");
  imageOverlay.classList.add("is-opening");
  imageOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  closeImageOverlay.focus();
  window.setTimeout(() => imageOverlay.classList.remove("is-opening"), 200);
}

function closeImage() {
  if (imageOverlay.classList.contains("hidden")) return;
  imageOverlay.classList.add("hidden");
  imageOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (lastViewerTrigger) lastViewerTrigger.focus();
}

closeImageOverlay.addEventListener("click", (event) => {
  event.stopPropagation();
  closeImage();
});

imageOverlay.addEventListener("click", (event) => {
  if (event.target === imageOverlay || event.target.classList.contains("overlay-frame")) closeImage();
});

document.addEventListener("keydown", (event) => {
  if (!imageOverlay.classList.contains("hidden")) {
    if (event.key === "Escape" || event.key === "z" || event.key === "Z") {
      event.preventDefault();
      closeImage();
    }
    return;
  }

  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;

  if (event.key === "/" && document.activeElement !== reviewSearch) {
    event.preventDefault();
    reviewSearch.focus();
  }
});
