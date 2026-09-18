let questions = [];
let current = null;
let currentIndex = -1;
let selected = new Set();
let checked = false;
let transitioning = false;
let toastTimer = null;

const els = {
  card: document.getElementById("quizCard"),
  question: document.getElementById("question"),
  questionBadge: document.getElementById("questionBadge"),
  topicBadge: document.getElementById("topicBadge"),
  answers: document.getElementById("answers"),
  empty: document.getElementById("answerEmptyState"),
  check: document.getElementById("check"),
  next: document.getElementById("next"),
  progressLabel: document.getElementById("progressLabel"),
  progressPercent: document.getElementById("progressPercent"),
  progressFill: document.getElementById("progressFill"),
  imageContainer: document.getElementById("imageContainer"),
  image: document.getElementById("questionImage"),
  exhibitTrigger: document.getElementById("exhibitTrigger"),
  exhibitError: document.getElementById("exhibitError"),
  verifier: document.getElementById("packetVerifier"),
  verifierStatus: document.getElementById("verifierStatus"),
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
    questions = data;
    loadRandomQuestion();
  })
  .catch((error) => {
    console.error(error);
    showLoadError();
  });

function cleanQuestionText(text = "") {
  return text.replace(/^\s*\d+\.\s*/, "").trim();
}

function getQuestionNumber(question, fallbackIndex) {
  const match = String(question?.question || "").match(/^\s*(\d+)\./);
  return match ? Number(match[1]) : fallbackIndex + 1;
}

function getTopic(question) {
  const match = String(question?.explanation || "").match(/Topic\s*([\d.]+)/i);
  return match ? `TOPIC ${match[1]}` : "";
}

function getCorrectList(question) {
  if (!question) return [];
  if (Array.isArray(question.correct_answer)) return question.correct_answer;
  return question.correct_answer ? [question.correct_answer] : [];
}

function chooseRandomIndex() {
  if (questions.length <= 1) return 0;
  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * questions.length);
  }
  return nextIndex;
}

function loadRandomQuestion() {
  currentIndex = chooseRandomIndex();
  current = questions[currentIndex];
  checked = false;
  selected.clear();

  renderQuestion();
}

function renderQuestion() {
  const number = getQuestionNumber(current, currentIndex);
  const topic = getTopic(current);
  const correctList = getCorrectList(current);
  const options = Array.isArray(current.options) ? current.options : [];

  els.question.textContent = cleanQuestionText(current.question);
  els.questionBadge.textContent = `QUESTION ${number}`;

  if (topic) {
    els.topicBadge.textContent = topic;
    els.topicBadge.hidden = false;
  } else {
    els.topicBadge.hidden = true;
  }

  const progress = ((currentIndex + 1) / questions.length) * 100;
  els.progressLabel.textContent = `Bank record ${currentIndex + 1} / ${questions.length}`;
  els.progressPercent.textContent = `${Math.round(progress)}%`;
  els.progressFill.style.width = `${progress}%`;

  renderImage(number);
  renderAnswers(options, correctList.length);
  resetFeedback();

  els.check.disabled = options.length === 0 || correctList.length === 0;
  els.next.disabled = false;
}

function renderImage(questionNumber) {
  els.exhibitError.hidden = true;

  if (!current.image_url) {
    els.imageContainer.hidden = true;
    els.exhibitTrigger.hidden = false;
    els.image.removeAttribute("src");
    return;
  }

  els.imageContainer.hidden = false;
  els.image.alt = `Exhibit for question ${questionNumber}`;
  els.image.src = current.image_url;

  els.image.onerror = () => {
    els.exhibitTrigger.hidden = true;
    els.image.style.display = "none";
    els.exhibitError.hidden = false;
  };

  els.image.onload = () => {
    els.exhibitTrigger.hidden = false;
    els.image.style.display = "block";
    els.exhibitError.hidden = true;
  };
}

function renderAnswers(options, maxAllowed) {
  els.answers.innerHTML = "";
  els.empty.hidden = options.length > 0;

  options.forEach((optText, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    button.dataset.answer = optText;
    button.setAttribute("aria-pressed", "false");
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
    button.addEventListener("click", () => toggleAnswer(button, optText, maxAllowed));
    els.answers.appendChild(button);
  });
}

function toggleAnswer(button, optText, maxAllowed) {
  if (checked || transitioning) return;

  if (selected.has(optText)) {
    selected.delete(optText);
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
    return;
  }

  if (selected.size < maxAllowed) {
    selected.add(optText);
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
    return;
  }

  if (maxAllowed === 1) {
    selected.clear();
    document.querySelectorAll(".answer-option").forEach((answer) => {
      answer.classList.remove("selected");
      answer.setAttribute("aria-pressed", "false");
    });
    selected.add(optText);
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
  } else {
    showToast(`Select exactly ${maxAllowed} answers for this question.`);
  }
}

function checkAnswer() {
  if (!current || checked || transitioning) return;

  const correctList = getCorrectList(current);
  if (correctList.length === 0) return;

  if (selected.size === 0) {
    showToast("Choose an answer before checking the route.");
    return;
  }

  if (selected.size !== correctList.length) {
    showToast(`Select exactly ${correctList.length} answer${correctList.length === 1 ? "" : "s"}.`);
    return;
  }

  checked = true;
  const isOverallCorrect = selected.size === correctList.length && [...selected].every((answer) => correctList.includes(answer));

  document.querySelectorAll(".answer-option").forEach((button) => {
    const text = button.dataset.answer;
    const isCorrect = correctList.includes(text);
    const isSelected = selected.has(text);

    button.classList.remove("selected");
    if (isCorrect) button.classList.add("correct");
    if (isSelected && !isCorrect) button.classList.add("wrong");
    button.disabled = true;
  });

  runPacketVerification(isOverallCorrect);
  showFeedback(isOverallCorrect);
}

function runPacketVerification(isCorrect) {
  els.verifier.classList.remove("is-routing", "is-success", "is-error");
  void els.verifier.offsetWidth;
  els.verifierStatus.textContent = "Routing packet…";
  els.verifier.classList.add("is-routing");

  window.setTimeout(() => {
    els.verifier.classList.add(isCorrect ? "is-success" : "is-error");
    els.verifierStatus.textContent = isCorrect ? "Route verified" : "Route rejected";
  }, 520);
}

function showFeedback(isCorrect) {
  els.feedback.className = `feedback is-visible ${isCorrect ? "is-success" : "is-error"}`;
  els.feedback.innerHTML = isCorrect
    ? "<strong>Correct.</strong> Packet verified successfully."
    : "<strong>Incorrect.</strong> The correct route is highlighted above.";
}

function resetFeedback() {
  els.feedback.className = "feedback";
  els.feedback.textContent = "";
  els.verifier.classList.remove("is-routing", "is-success", "is-error");
  els.verifierStatus.textContent = "Awaiting route";
}

function nextQuestion() {
  if (!questions.length || transitioning) return;
  transitioning = true;
  els.next.disabled = true;
  els.check.disabled = true;
  els.card.classList.add("is-leaving");

  window.setTimeout(() => {
    loadRandomQuestion();
    els.card.classList.remove("is-leaving");
    els.card.classList.add("is-entering");

    window.setTimeout(() => {
      els.card.classList.remove("is-entering");
      transitioning = false;
      const correctList = getCorrectList(current);
      const options = Array.isArray(current.options) ? current.options : [];
      els.check.disabled = options.length === 0 || correctList.length === 0;
      els.next.disabled = false;
    }, 430);
  }, 210);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function showLoadError() {
  els.questionBadge.textContent = "DATA ERROR";
  els.question.textContent = "The question bank could not be loaded.";
  els.answers.innerHTML = "";
  els.empty.hidden = false;
  els.empty.querySelector("strong").textContent = "Check that ccna.json is in the same folder.";
  els.empty.querySelector("span").textContent = "The interface is ready, but the data source did not respond.";
  els.check.disabled = true;
  els.next.disabled = true;
  els.progressLabel.textContent = "Question bank unavailable";
  els.progressPercent.textContent = "0%";
}

function openImageViewer() {
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

  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;

  if (/^[1-9]$/.test(event.key) && !checked) {
    const option = document.querySelectorAll(".answer-option")[Number(event.key) - 1];
    if (option) option.click();
  } else if (event.key === "Enter") {
    event.preventDefault();
    checkAnswer();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nextQuestion();
  }
});
