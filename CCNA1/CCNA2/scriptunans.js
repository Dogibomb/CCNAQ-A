let allQuestions = [];
let unansweredQuestions = [];
let lastViewerTrigger = null;
let toastTimer = null;

const list = document.getElementById("unansweredList");
const searchInput = document.getElementById("questionSearch");
const totalUnanswered = document.getElementById("totalUnanswered");
const exhibitUnanswered = document.getElementById("exhibitUnanswered");
const resolvedUnanswered = document.getElementById("resolvedUnanswered");
const noResults = document.getElementById("noResults");
const loadError = document.getElementById("loadError");
const copyJsonBtn = document.getElementById("copyJsonBtn");
const imageOverlay = document.getElementById("imageOverlay");
const overlayImg = imageOverlay.querySelector(".overlay-img");
const closeImageOverlay = document.getElementById("closeImageOverlay");
const toast = document.getElementById("toast");
const statusBadge = document.getElementById("unansweredStatusText");

fetch("ccna.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Question bank request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data)) throw new Error("Question bank is not an array.");
    allQuestions = data;
    if (window.CCNAStorage) window.CCNAStorage.syncNavbarBadges(data);

    unansweredQuestions = data.filter((q) => window.CCNAStorage.isQuestionUnansweredInDataset(q));
    updateStats();
    buildRecords(unansweredQuestions);
  })
  .catch((error) => {
    console.error(error);
    loadError.hidden = false;
    totalUnanswered.textContent = "0";
    exhibitUnanswered.textContent = "0";
    resolvedUnanswered.textContent = "0";
  });

function showToast(message) {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function updateStats() {
  const progress = window.CCNAStorage ? window.CCNAStorage.loadProgress() : { customOverrides: {} };
  const overrides = progress.customOverrides || {};

  const total = unansweredQuestions.length;
  const withExhibits = unansweredQuestions.filter((q) => Boolean(q.image_url)).length;
  const resolved = unansweredQuestions.filter((q) => {
    const num = String(window.CCNAStorage.getQuestionNumber(q));
    return overrides[num] && overrides[num].correct_answer && overrides[num].correct_answer.length > 0;
  }).length;

  totalUnanswered.textContent = String(total);
  exhibitUnanswered.textContent = String(withExhibits);
  resolvedUnanswered.textContent = String(resolved);

  if (statusBadge) {
    statusBadge.textContent = `${total} UNANSWERED (${resolved} LOCALLY RESOLVED)`;
  }
}

function buildRecords(questions) {
  list.innerHTML = "";
  const progress = window.CCNAStorage ? window.CCNAStorage.loadProgress() : { customOverrides: {} };
  const overrides = progress.customOverrides || {};
  const fragment = document.createDocumentFragment();

  questions.forEach((question, index) => {
    const number = window.CCNAStorage.getQuestionNumber(question, index);
    const qKey = String(number);
    const options = Array.isArray(question.options) ? question.options : [];
    const override = overrides[qKey];
    const isResolved = Boolean(override && override.correct_answer && override.correct_answer.length > 0);

    const record = document.createElement("article");
    record.className = `question-record is-visible ${isResolved ? "is-resolved-record" : ""}`;
    record.dataset.search = [number, question.question, ...options, override?.customText || ""].join(" ").toLowerCase();
    record.dataset.index = String(index);

    // 1. Question Cell
    const questionCell = document.createElement("div");
    questionCell.className = "record-cell record-question";

    const meta = document.createElement("div");
    meta.className = "record-meta";
    meta.innerHTML = `<span class="record-number">Q${number}</span><span class="record-topic"></span>`;
    const topicObj = window.CCNAStorage.parseTopic(question);
    meta.querySelector(".record-topic").textContent = topicObj ? `Topic ${topicObj.label}` : "CCNA 2";

    const questionText = document.createElement("p");
    questionText.className = "record-question-text";
    questionText.textContent = window.CCNAStorage.cleanQuestionText(question.question);

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
      imageButton.appendChild(image);
      imageButton.addEventListener("click", () => openImageViewer(question.image_url, imageButton));
      questionCell.appendChild(imageButton);
    }

    if (question.explanation) {
      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.style.marginTop = "8px";
      exp.textContent = question.explanation;
      questionCell.appendChild(exp);
    }

    // 2. Options Cell
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
      const noOptions = document.createElement("div");
      noOptions.className = "no-options";
      noOptions.style.lineHeight = "1.6";
      noOptions.innerHTML = `<strong>Matching / Drag-and-drop Exhibit</strong><br>Answer choices are depicted within the exhibit image. Use the input on the right to assign the verified matching pairs.`;
      optionsCell.appendChild(noOptions);
    }

    // 3. Status & Override Cell
    const actionCell = document.createElement("div");
    actionCell.className = "record-cell record-answer";

    const overrideCard = document.createElement("div");
    overrideCard.className = "override-card";

    const statusRow = document.createElement("div");
    statusRow.innerHTML = isResolved
      ? `<span class="override-status-badge is-resolved">✓ Override Saved</span>`
      : `<span class="override-status-badge is-unresolved">Missing Verified Answer</span>`;
    overrideCard.appendChild(statusRow);

    if (options.length > 0) {
      // Pick from existing options
      const picker = document.createElement("div");
      picker.className = "override-options-picker";
      options.forEach((optText, optIdx) => {
        const label = document.createElement("label");
        label.className = "override-option-item";
        const isChecked = Boolean(override?.correct_answer?.includes(optText));
        label.innerHTML = `
          <input type="checkbox" name="override_q${number}" value="${optIdx}">
          <span>${optText}</span>
        `;
        const checkbox = label.querySelector("input");
        checkbox.checked = isChecked;
        picker.appendChild(label);
      });
      overrideCard.appendChild(picker);
    } else {
      // Freeform answer input
      const textarea = document.createElement("textarea");
      textarea.className = "override-textarea";
      textarea.rows = 3;
      textarea.placeholder = "Enter verified answer / matching pairs (e.g., Step 1: POST, Step 2: Bootloader)...";
      textarea.value = override?.customText || (override?.correct_answer?.[0] || "");
      overrideCard.appendChild(textarea);
    }

    const btnGroup = document.createElement("div");
    btnGroup.className = "override-btn-group";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "override-btn override-btn-primary";
    saveBtn.textContent = "Save Override";

    saveBtn.addEventListener("click", () => {
      let answersToSave = [];
      let customText = "";

      if (options.length > 0) {
        const checkedInputs = overrideCard.querySelectorAll("input[type='checkbox']:checked");
        checkedInputs.forEach((inp) => {
          const idx = Number(inp.value);
          if (options[idx]) answersToSave.push(options[idx]);
        });
      } else {
        const ta = overrideCard.querySelector("textarea");
        customText = ta?.value?.trim() || "";
        if (customText) answersToSave.push(customText);
      }

      if (answersToSave.length === 0) {
        showToast("Please choose or enter at least one verified answer.");
        return;
      }

      window.CCNAStorage.saveQuestionOverride(number, {
        correct_answer: answersToSave,
        customText: customText
      });

      showToast(`Saved verified override for Question #${number}`);
      updateStats();
      buildRecords(unansweredQuestions);
    });

    btnGroup.appendChild(saveBtn);

    if (isResolved) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "override-btn override-btn-ghost";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", () => {
        window.CCNAStorage.removeQuestionOverride(number);
        showToast(`Cleared override for Question #${number}`);
        updateStats();
        buildRecords(unansweredQuestions);
      });
      btnGroup.appendChild(clearBtn);
    }

    overrideCard.appendChild(btnGroup);
    actionCell.appendChild(overrideCard);

    record.append(questionCell, optionsCell, actionCell);
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

  noResults.hidden = visible !== 0;
}

if (copyJsonBtn) {
  copyJsonBtn.addEventListener("click", async () => {
    if (!allQuestions.length) return;
    try {
      const jsonStr = window.CCNAStorage.exportUpdatedJson(allQuestions);
      await navigator.clipboard.writeText(jsonStr);
      showToast("Updated ccna.json copied to clipboard!");
    } catch (err) {
      console.warn("Clipboard write failed, using prompt fallback", err);
      const jsonStr = window.CCNAStorage.exportUpdatedJson(allQuestions);
      window.prompt("Copy updated JSON:", jsonStr);
    }
  });
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

  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;

  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});
