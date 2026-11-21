let allQuestions = [];
let lastViewerTrigger = null;

const list = document.getElementById("questionsList");
const searchInput = document.getElementById("questionSearch");
const totalQuestions = document.getElementById("totalQuestions");
const exhibitQuestions = document.getElementById("exhibitQuestions");
const visibleQuestions = document.getElementById("visibleQuestions");
const noResults = document.getElementById("noResults");
const loadError = document.getElementById("loadError");
const imageOverlay = document.getElementById("imageOverlay");
const overlayImg = imageOverlay.querySelector(".overlay-img");
const closeImageOverlay = document.getElementById("closeImageOverlay");

fetch("ccna.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Question bank request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data)) throw new Error("Question bank is not an array.");
    allQuestions = data;
    updateStats(data);
    buildRecords(data);
  })
  .catch((error) => {
    console.error(error);
    loadError.hidden = false;
    totalQuestions.textContent = "0";
    exhibitQuestions.textContent = "0";
    visibleQuestions.textContent = "0";
  });

function getTopicLabel(question) {
  const topicObj = window.CCNAStorage.parseTopic(question);
  return topicObj ? `Topic ${topicObj.label}` : "CCNA 2";
}

function updateStats(data) {
  totalQuestions.textContent = String(data.length);
  exhibitQuestions.textContent = String(data.filter((question) => Boolean(question.image_url)).length);
  visibleQuestions.textContent = String(data.length);
}

function buildMatchingPreview(question) {
  const wrap = document.createElement("div");
  wrap.className = "matching-preview";

  const itemsGroup = document.createElement("div");
  itemsGroup.className = "matching-preview-group";
  const itemsLabel = document.createElement("strong");
  itemsLabel.textContent = "Items";
  const itemsUl = document.createElement("ul");
  (question.matching.sources || []).forEach((src) => {
    const li = document.createElement("li");
    li.textContent = src;
    itemsUl.appendChild(li);
  });
  itemsGroup.append(itemsLabel, itemsUl);

  const targetsGroup = document.createElement("div");
  targetsGroup.className = "matching-preview-group";
  const targetsLabel = document.createElement("strong");
  targetsLabel.textContent = "Targets";
  const targetsUl = document.createElement("ul");
  (question.matching.targets || []).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t.label;
    targetsUl.appendChild(li);
  });
  targetsGroup.append(targetsLabel, targetsUl);

  wrap.append(itemsGroup, targetsGroup);
  return wrap;
}

function buildRecords(questions) {
  list.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const progress = window.CCNAStorage.loadProgress();
  const flaggedSet = new Set(progress.flaggedQuestions);
  const overrides = progress.customOverrides || {};
  const notes = progress.notes || {};

  questions.forEach((question, index) => {
    const number = window.CCNAStorage.getQuestionNumber(question, index);
    const isMatch = window.CCNAStorage.isMatchingQuestion(question);
    const options = Array.isArray(question.options) ? question.options : [];
    const correctAnswers = window.CCNAStorage.getEffectiveCorrectAnswers(question, overrides);
    const topicLabel = getTopicLabel(question);
    const savedNote = notes[String(number)] || "";
    const formattedExp = window.CCNAStorage.formatExplanation(question.explanation);

    const searchParts = [
      number,
      topicLabel,
      question.question,
      ...options,
      ...correctAnswers,
      formattedExp,
      savedNote
    ];
    if (isMatch) {
      searchParts.push(...(question.matching.sources || []), ...(question.matching.targets || []).map((t) => t.label));
    }

    const record = document.createElement("article");
    record.className = "question-record";
    record.dataset.search = searchParts.join(" ").toLowerCase();
    record.dataset.index = String(index);

    const questionCell = document.createElement("div");
    questionCell.className = "record-cell record-question";

    const meta = document.createElement("div");
    meta.className = "record-meta";

    const numSpan = document.createElement("span");
    numSpan.className = "record-number";
    numSpan.textContent = `Q${number}`;

    const topicSpan = document.createElement("span");
    topicSpan.className = "record-topic";
    topicSpan.textContent = topicLabel;

    meta.append(numSpan, topicSpan);

    if (flaggedSet.has(number)) {
      const flagPill = document.createElement("span");
      flagPill.className = "record-flag-pill";
      flagPill.textContent = "FLAGGED";
      meta.appendChild(flagPill);
    }

    const questionText = document.createElement("p");
    questionText.className = "record-question-text";
    questionText.textContent = window.CCNAStorage.cleanQuestionText(question.question);

    questionCell.append(meta, questionText);

    if (savedNote) {
      const noteEl = document.createElement("div");
      noteEl.className = "record-note";
      const badge = document.createElement("span");
      badge.className = "note-badge";
      badge.textContent = "NOTE";
      const textSpan = document.createElement("span");
      textSpan.className = "note-text";
      textSpan.textContent = savedNote;
      noteEl.append(badge, textSpan);
      questionCell.appendChild(noteEl);
    }

    if (question.image_url) {
      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "exhibit-thumb-button";
      imageButton.setAttribute("aria-label", `Open exhibit for question ${number}`);

      const image = document.createElement("img");
      image.className = "question-img";
      image.src = question.image_url;
      image.alt = `Exhibit for question ${number}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.onerror = () => {
        const unavailable = document.createElement("span");
        unavailable.className = "no-options";
        unavailable.textContent = "Exhibit unavailable.";
        imageButton.replaceWith(unavailable);
      };
      imageButton.appendChild(image);
      imageButton.addEventListener("click", () => openImageViewer(question.image_url, imageButton));
      questionCell.appendChild(imageButton);
    }

    const optionsCell = document.createElement("div");
    optionsCell.className = "record-cell";

    if (isMatch) {
      optionsCell.appendChild(buildMatchingPreview(question));
    } else if (options.length) {
      const optionsList = document.createElement("ol");
      optionsList.className = "answers-list";
      options.forEach((option) => {
        const li = document.createElement("li");
        li.textContent = option;
        optionsList.appendChild(li);
      });
      optionsCell.appendChild(optionsList);
    } else {
      const noOptions = document.createElement("span");
      noOptions.className = "no-options";
      noOptions.textContent = "No option list stored for this record.";
      optionsCell.appendChild(noOptions);
    }

    const answerCell = document.createElement("div");
    answerCell.className = "record-cell record-answer";

    const revealButton = document.createElement("button");
    revealButton.type = "button";
    revealButton.className = "reveal-btn";
    revealButton.setAttribute("aria-expanded", "false");
    revealButton.innerHTML = `
      <svg class="icon eye-on" viewBox="0 0 24 24"><path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Zm8.5 2.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      <svg class="icon eye-off" viewBox="0 0 24 24"><path d="m4 4 16 16M9.1 7.4A8.8 8.8 0 0 1 12 7c5.3 0 8.5 5 8.5 5a13 13 0 0 1-2.7 3.1M14.4 14.6A3.4 3.4 0 0 1 9.5 9.8M6.3 9.4A13.9 13.9 0 0 0 3.5 12s3.2 5 8.5 5c1.1 0 2.1-.2 3-.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <span>Reveal</span>`;

    const correctBox = document.createElement("div");
    correctBox.className = "correct-box";

    const label = document.createElement("div");
    label.className = "correct-answer-label";
    label.innerHTML = `<svg viewBox="0 0 24 24" class="icon"><path d="m7 12.5 3.2 3.2L17.5 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${isMatch ? "Verified matches" : "Verified answer"}</span>`;
    correctBox.appendChild(label);

    if (correctAnswers.length) {
      correctAnswers.forEach((answer) => {
        const answerText = document.createElement("div");
        answerText.className = "correct-answer-text";
        answerText.textContent = answer;
        correctBox.appendChild(answerText);
      });
    } else {
      const answerText = document.createElement("div");
      answerText.className = "correct-answer-text";
      answerText.textContent = "No correct answer text is stored for this record.";
      correctBox.appendChild(answerText);
    }

    if (formattedExp) {
      const explanation = document.createElement("div");
      explanation.className = "explanation";
      explanation.textContent = formattedExp;
      correctBox.appendChild(explanation);
    }

    revealButton.addEventListener("click", () => {
      const isOpen = record.classList.toggle("is-revealed");
      revealButton.setAttribute("aria-expanded", String(isOpen));
      revealButton.querySelector("span").textContent = isOpen ? "Hide" : "Reveal";
    });

    answerCell.append(revealButton, correctBox);
    record.append(questionCell, optionsCell, answerCell);
    fragment.appendChild(record);
  });

  list.appendChild(fragment);
}

function filterQuestions() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;

  document.querySelectorAll(".question-record").forEach((record) => {
    const matches = !query || record.dataset.search.includes(query);
    record.hidden = !matches;
    if (matches) visible += 1;
  });

  visibleQuestions.textContent = String(visible);
  noResults.hidden = visible !== 0;
}

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

searchInput.addEventListener("input", filterQuestions);

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

  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});
