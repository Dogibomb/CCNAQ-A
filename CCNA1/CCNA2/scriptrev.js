let allQuestions = [];
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
const mistakesActionBar = document.getElementById("mistakesActionBar");
const mistakesTitleCount = document.getElementById("mistakesTitleCount");
const practiceMistakesBtn = document.getElementById("practiceMistakesBtn");

const completedList = document.getElementById("completedList");
const completedEmpty = document.getElementById("completedEmpty");
const topicsList = document.getElementById("topicsList");

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
    if (window.CCNAStorage) window.CCNAStorage.syncNavbarBadges(data);
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

function renderAll() {
  const progress = window.CCNAStorage.loadProgress();
  const completedKeys = Object.keys(progress.completedQuestions);
  const mistakeKeys = Object.keys(progress.wrongQuestions);
  const flaggedList = progress.flaggedQuestions;

  // Calculate stats
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

  if (mistakeKeys.length === 0) {
    mistakesEmpty.hidden = false;
    mistakesActionBar.style.display = "none";
    return;
  }

  mistakesEmpty.hidden = true;
  mistakesActionBar.style.display = "";
  mistakesTitleCount.textContent = `You have ${mistakeKeys.length} mistake${mistakeKeys.length === 1 ? "" : "s"} to review`;

  const fragment = document.createDocumentFragment();

  mistakeKeys.forEach((qNumStr) => {
    const qNum = Number(qNumStr);
    const question = allQuestions.find((q, idx) => window.CCNAStorage.getQuestionNumber(q, idx) === qNum);
    if (!question) return;

    const mistakeInfo = progress.wrongQuestions[qNumStr];
    const correctList = window.CCNAStorage.getEffectiveCorrectAnswers(question, overrides);
    const userAnswers = mistakeInfo.wrongAnswers || [];
    const note = window.CCNAStorage.getQuestionNote(qNum);

    const record = document.createElement("article");
    record.className = "question-record is-visible";
    record.dataset.search = [qNum, question.question, ...userAnswers, ...correctList, note].join(" ").toLowerCase();

    // 1. Question Cell
    const questionCell = document.createElement("div");
    questionCell.className = "record-cell record-question";

    const meta = document.createElement("div");
    meta.className = "record-meta";
    const topicObj = window.CCNAStorage.parseTopic(question);
    meta.innerHTML = `
      <span class="record-number">Q${qNum}</span>
      <span class="record-topic">${topicObj ? `Topic ${topicObj.label}` : "CCNA 2"}</span>
      <span class="miss-count-pill">Missed ${mistakeInfo.missCount || 1}x</span>
    `;

    const questionText = document.createElement("p");
    questionText.className = "record-question-text";
    questionText.textContent = window.CCNAStorage.cleanQuestionText(question.question);

    questionCell.append(meta, questionText);

    if (question.image_url) {
      const imgBtn = document.createElement("button");
      imgBtn.type = "button";
      imgBtn.className = "exhibit-thumb-button";
      imgBtn.setAttribute("aria-label", `Open exhibit for question ${qNum}`);
      imgBtn.innerHTML = `<img class="question-img" src="${question.image_url}" alt="Exhibit for question ${qNum}" loading="lazy">`;
      imgBtn.addEventListener("click", () => openImageViewer(question.image_url, imgBtn));
      questionCell.appendChild(imgBtn);
    }

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.className = "record-note";
      noteEl.innerHTML = `<span class="note-badge">NOTE</span> <span class="note-text"></span>`;
      noteEl.querySelector(".note-text").textContent = note;
      questionCell.appendChild(noteEl);
    }

    // 2. Answer Comparison Cell
    const answerCell = document.createElement("div");
    answerCell.className = "record-cell";

    const compareBox = document.createElement("div");
    compareBox.className = "answer-comparison";

    const wrongRow = document.createElement("div");
    wrongRow.className = "answer-row answer-row-wrong";
    wrongRow.innerHTML = `
      <span class="answer-row-label">Your selection (Incorrect):</span>
      <div>${userAnswers.length ? userAnswers.join("<br>") : "<em>No answer picked</em>"}</div>
    `;

    const correctRow = document.createElement("div");
    correctRow.className = "answer-row answer-row-correct";
    correctRow.innerHTML = `
      <span class="answer-row-label">Verified correct answer:</span>
      <div>${correctList.length ? correctList.join("<br>") : "<em>No verified answer</em>"}</div>
    `;

    compareBox.append(wrongRow, correctRow);

    if (question.explanation) {
      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.style.marginTop = "8px";
      exp.textContent = question.explanation;
      compareBox.appendChild(exp);
    }

    answerCell.appendChild(compareBox);

    // 3. Action Cell
    const actionCell = document.createElement("div");
    actionCell.className = "record-cell record-answer";

    const masterBtn = document.createElement("button");
    masterBtn.type = "button";
    masterBtn.className = "toolbar-action-btn";
    masterBtn.style.minHeight = "36px";
    masterBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="m5 13 4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Mark as Mastered</span>
    `;

    masterBtn.addEventListener("click", () => {
      window.CCNAStorage.markMistakeMastered(qNum);
      showToast(`Question #${qNum} marked as mastered.`);
      renderAll();
    });

    const practiceSingleLink = document.createElement("a");
    practiceSingleLink.className = "btn-practice-topic";
    practiceSingleLink.style.marginTop = "6px";
    practiceSingleLink.href = `index.html?q=${qNum}`;
    practiceSingleLink.innerHTML = `<span>Drill Q#${qNum}</span>`;

    actionCell.append(masterBtn, practiceSingleLink);

    record.append(questionCell, answerCell, actionCell);
    fragment.appendChild(record);
  });

  mistakesList.appendChild(fragment);
}

/* ==================== 2. Completed History Sub-view ==================== */
function renderCompletedView(progress) {
  completedList.innerHTML = "";
  const completedKeys = Object.keys(progress.completedQuestions).sort((a, b) => {
    return (progress.completedQuestions[b].timestamp || 0) - (progress.completedQuestions[a].timestamp || 0);
  });

  if (completedKeys.length === 0) {
    completedEmpty.hidden = false;
    return;
  }

  completedEmpty.hidden = true;
  const fragment = document.createDocumentFragment();

  completedKeys.forEach((qNumStr) => {
    const qNum = Number(qNumStr);
    const question = allQuestions.find((q, idx) => window.CCNAStorage.getQuestionNumber(q, idx) === qNum);
    if (!question) return;

    const recordInfo = progress.completedQuestions[qNumStr];
    const isCorrect = recordInfo.status === "correct";
    const note = window.CCNAStorage.getQuestionNote(qNum);
    const dateStr = recordInfo.timestamp ? new Date(recordInfo.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

    const record = document.createElement("article");
    record.className = "question-record is-visible";
    record.dataset.search = [qNum, question.question, recordInfo.status, ...(recordInfo.lastSelected || []), note].join(" ").toLowerCase();

    // 1. Question Cell
    const questionCell = document.createElement("div");
    questionCell.className = "record-cell record-question";

    const meta = document.createElement("div");
    meta.className = "record-meta";
    const topicObj = window.CCNAStorage.parseTopic(question);
    meta.innerHTML = `
      <span class="record-number">Q${qNum}</span>
      <span class="record-topic">${topicObj ? `Topic ${topicObj.label}` : "CCNA 2"}</span>
      ${dateStr ? `<span style="opacity:0.6; font-size:0.58rem;">${dateStr}</span>` : ""}
    `;

    const questionText = document.createElement("p");
    questionText.className = "record-question-text";
    questionText.textContent = window.CCNAStorage.cleanQuestionText(question.question);

    questionCell.append(meta, questionText);

    if (question.image_url) {
      const imgBtn = document.createElement("button");
      imgBtn.type = "button";
      imgBtn.className = "exhibit-thumb-button";
      imgBtn.setAttribute("aria-label", `Open exhibit for question ${qNum}`);
      imgBtn.innerHTML = `<img class="question-img" src="${question.image_url}" alt="Exhibit for question ${qNum}" loading="lazy">`;
      imgBtn.addEventListener("click", () => openImageViewer(question.image_url, imgBtn));
      questionCell.appendChild(imgBtn);
    }

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.className = "record-note";
      noteEl.innerHTML = `<span class="note-badge">NOTE</span> <span class="note-text"></span>`;
      noteEl.querySelector(".note-text").textContent = note;
      questionCell.appendChild(noteEl);
    }

    // 2. Selection / Options Cell
    const optionsCell = document.createElement("div");
    optionsCell.className = "record-cell";

    const statusBadge = document.createElement("div");
    statusBadge.style.marginBottom = "8px";
    statusBadge.innerHTML = isCorrect
      ? `<span class="override-status-badge is-resolved">✓ Correct</span>`
      : `<span class="override-status-badge is-unresolved" style="color:#ffdce3; background:rgba(255,85,116,0.15); border-color:rgba(255,85,116,0.3);">✕ Wrong</span>`;

    const selectionText = document.createElement("div");
    selectionText.style.fontSize = "0.82rem";
    selectionText.style.color = "#c7d6e6";
    selectionText.innerHTML = `<strong>Last selected:</strong><br>${(recordInfo.lastSelected || []).join("<br>") || "<em>None</em>"}`;

    optionsCell.append(statusBadge, selectionText);

    // 3. Action Cell
    const actionCell = document.createElement("div");
    actionCell.className = "record-cell record-answer";

    const drillLink = document.createElement("a");
    drillLink.className = "btn-practice-topic";
    drillLink.href = `index.html?q=${qNum}`;
    drillLink.textContent = `Open in Quiz`;

    actionCell.appendChild(drillLink);

    record.append(questionCell, optionsCell, actionCell);
    fragment.appendChild(record);
  });

  completedList.appendChild(fragment);
}

/* ==================== 3. Topic Breakdown Sub-view ==================== */
function renderTopicsView(progress) {
  topicsList.innerHTML = "";
  const chapters = [...new Set(allQuestions.map((q) => window.CCNAStorage.parseTopic(q)?.chapter).filter(Number.isFinite))].sort((a, b) => a - b);

  const ranges = [
    { label: "Topics 1–4: Switching & VLANs", filter: "range:1-4", from: 1, to: 4 },
    { label: "Topics 5–9: Redundancy & DHCP", filter: "range:5-9", from: 5, to: 9 },
    { label: "Topics 10–14: Routing & Security", filter: "range:10-14", from: 10, to: 14 },
    { label: "Topics 15–16: Static Routing & Wireless", filter: "range:15-16", from: 15, to: 16 }
  ];

  const fragment = document.createDocumentFragment();

  // Range overview cards
  ranges.forEach((range) => {
    const rangeQuestions = allQuestions.filter((q) => {
      const ch = window.CCNAStorage.parseTopic(q)?.chapter;
      return ch !== undefined && ch >= range.from && ch <= range.to;
    });

    if (rangeQuestions.length === 0) return;

    const card = buildTopicRow(range.label, range.filter, rangeQuestions, progress);
    fragment.appendChild(card);
  });

  // Single chapter cards header
  const singleHeader = document.createElement("div");
  singleHeader.style.marginTop = "20px";
  singleHeader.style.marginBottom = "4px";
  singleHeader.innerHTML = `<span class="page-kicker" style="font-size:0.68rem;">Individual Chapters</span>`;
  fragment.appendChild(singleHeader);

  chapters.forEach((ch) => {
    const chapterQuestions = allQuestions.filter((q) => window.CCNAStorage.parseTopic(q)?.chapter === ch);
    if (chapterQuestions.length === 0) return;
    const card = buildTopicRow(`Topic ${ch}`, `topic:${ch}`, chapterQuestions, progress);
    fragment.appendChild(card);
  });

  topicsList.appendChild(fragment);
}

function buildTopicRow(title, filterKey, topicQuestions, progress) {
  const total = topicQuestions.length;
  let completed = 0;
  let correct = 0;
  let wrong = 0;

  topicQuestions.forEach((q, idx) => {
    const num = String(window.CCNAStorage.getQuestionNumber(q, idx));
    const rec = progress.completedQuestions[num];
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

  card.innerHTML = `
    <div class="topic-info">
      <strong>${title}</strong>
      <span>${total} records total · ${completed} completed</span>
    </div>
    <div class="topic-progress-wrap">
      <div class="topic-progress-labels">
        <span>${completed > 0 ? `${accuracy}% Accuracy` : "Not started"}</span>
        <span>${correct} correct / ${wrong} wrong</span>
      </div>
      <div class="topic-progress-track">
        <div class="topic-bar-correct" style="width: ${correctPct}%;"></div>
        <div class="topic-bar-wrong" style="width: ${wrongPct}%;"></div>
      </div>
    </div>
    <a href="index.html?filter=${encodeURIComponent(filterKey)}" class="btn-practice-topic">
      <span>Practice Topic</span>
      <svg viewBox="0 0 24 24" class="icon" aria-hidden="true" style="width:14px; height:14px;"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  `;

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
  if (activeTab === "mistakes") targetPanel = mistakesList;
  else if (activeTab === "completed") targetPanel = completedList;
  else if (activeTab === "topics") targetPanel = topicsList;

  if (!targetPanel) return;

  const items = targetPanel.querySelectorAll("article");
  items.forEach((item) => {
    const matches = !query || item.dataset.search?.includes(query);
    item.hidden = !matches;
  });
}

tabMistakes.addEventListener("click", () => switchTab("mistakes"));
tabCompleted.addEventListener("click", () => switchTab("completed"));
tabTopics.addEventListener("click", () => switchTab("topics"));
reviewSearch.addEventListener("input", filterActiveView);

/* ==================== Reset Progress ==================== */
resetProgressBtn.addEventListener("click", () => {
  const confirmed = window.confirm("Are you sure you want to reset all quiz progress, completed records, and mistakes?\n\nPersonal study notes and custom overrides will be safely preserved.");
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
  window.setTimeout(() => imageOverlay.classList.remove("is-opening"), 430);
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
  if (event.key === "Escape" && !imageOverlay.classList.contains("hidden")) {
    event.preventDefault();
    closeImage();
    return;
  }

  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;

  if (event.key === "/" && document.activeElement !== reviewSearch) {
    event.preventDefault();
    reviewSearch.focus();
  }
});
