let allQuestions = [];
let recordObserver = null;
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
    setupObserver();
  })
  .catch((error) => {
    console.error(error);
    loadError.hidden = false;
    totalQuestions.textContent = "0";
    exhibitQuestions.textContent = "0";
    visibleQuestions.textContent = "0";
  });

function cleanQuestionText(text = "") {
  return text.replace(/^\s*\d+\.\s*/, "").trim();
}

function getQuestionNumber(question, fallbackIndex) {
  const match = String(question.question || "").match(/^\s*(\d+)\./);
  return match ? Number(match[1]) : fallbackIndex + 1;
}

function getTopic(question) {
  const match = String(question.explanation || "").match(/Topic\s*([\d.]+)/i);
  return match ? `Topic ${match[1]}` : "CCNA 2";
}

function getCorrectAnswers(question) {
  if (Array.isArray(question.correct_answer)) return question.correct_answer;
  return question.correct_answer ? [question.correct_answer] : [];
}

function updateStats(data) {
  totalQuestions.textContent = String(data.length);
  exhibitQuestions.textContent = String(data.filter((question) => Boolean(question.image_url)).length);
  visibleQuestions.textContent = String(data.length);
}

function buildRecords(questions) {
  list.innerHTML = "";
  const fragment = document.createDocumentFragment();

  questions.forEach((question, index) => {
    const number = getQuestionNumber(question, index);
    const options = Array.isArray(question.options) ? question.options : [];
    const correctAnswers = getCorrectAnswers(question);
    const record = document.createElement("article");
    record.className = "question-record";
    record.dataset.search = [number, question.question, ...options].join(" ").toLowerCase();
    record.dataset.index = String(index);

    const questionCell = document.createElement("div");
    questionCell.className = "record-cell record-question";

    const meta = document.createElement("div");
    meta.className = "record-meta";
    meta.innerHTML = `<span class="record-number">Q${number}</span><span class="record-topic"></span>`;
    meta.querySelector(".record-topic").textContent = getTopic(question);

    const questionText = document.createElement("p");
    questionText.className = "record-question-text";
    questionText.textContent = cleanQuestionText(question.question);

    questionCell.append(meta, questionText);

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

    if (options.length) {
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
    label.innerHTML = `<svg viewBox="0 0 24 24" class="icon"><path d="m7 12.5 3.2 3.2L17.5 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Verified answer</span>`;
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

    if (question.explanation) {
      const explanation = document.createElement("div");
      explanation.className = "explanation";
      explanation.textContent = question.explanation;
      correctBox.appendChild(explanation);
    }

    revealButton.addEventListener("click", () => {
      const isOpen = record.classList.toggle("is-revealed");
      revealButton.setAttribute("aria-expanded", String(isOpen));
      revealButton.querySelector("span").textContent = isOpen ? "Hide" : "Reveal";

      if (isOpen) {
        record.classList.remove("flow-confirm");
        void record.offsetWidth;
        record.classList.add("flow-confirm");
        window.setTimeout(() => record.classList.remove("flow-confirm"), 650);
      }
    });

    answerCell.append(revealButton, correctBox);
    record.append(questionCell, optionsCell, answerCell);
    fragment.appendChild(record);
  });

  list.appendChild(fragment);
}

function setupObserver() {
  recordObserver?.disconnect();

  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(".question-record").forEach((record) => record.classList.add("is-visible"));
    return;
  }

  recordObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      recordObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

  document.querySelectorAll(".question-record").forEach((record) => recordObserver.observe(record));
}

function filterQuestions() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;

  document.querySelectorAll(".question-record").forEach((record) => {
    const matches = !query || record.dataset.search.includes(query);
    record.hidden = !matches;
    if (matches) {
      visible += 1;
      if (!record.classList.contains("is-visible")) record.classList.add("is-visible");
    }
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
  window.setTimeout(() => imageOverlay.classList.remove("is-opening"), 430);
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
  if (event.key === "Escape" && !imageOverlay.classList.contains("hidden")) {
    event.preventDefault();
    closeImage();
    return;
  }

  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});
