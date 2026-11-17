/**
 * CCNA 2 LAB — Storage & Progress Management
 * Persists user drill progress, mistake tracking, bookmark flags,
 * personal study notes, and custom unanswered overrides in localStorage.
 *
 * Dedicated storage key: `ccna2_progress`
 */

const PROGRESS_STORAGE_KEY = "ccna2_progress";

function getDefaultProgress() {
  return {
    wrongQuestions: {},      // qNumber -> { questionId, wrongAnswers: [], timestamp, missCount }
    completedQuestions: {},  // qNumber -> { questionId, status: "correct" | "wrong", lastSelected: [], timestamp }
    flaggedQuestions: [],    // [ qNumber, ... ]
    notes: {},               // qNumber -> "note text"
    customOverrides: {}      // qNumber -> { correct_answer: [], customText: "" }
  };
}

function loadProgress() {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return getDefaultProgress();
    const data = JSON.parse(raw);
    return {
      wrongQuestions: (data && typeof data.wrongQuestions === "object") ? data.wrongQuestions : {},
      completedQuestions: (data && typeof data.completedQuestions === "object") ? data.completedQuestions : {},
      flaggedQuestions: Array.isArray(data?.flaggedQuestions) ? data.flaggedQuestions.map(Number) : [],
      notes: (data && typeof data.notes === "object") ? data.notes : {},
      customOverrides: (data && typeof data.customOverrides === "object") ? data.customOverrides : {}
    };
  } catch (err) {
    console.warn("Could not read ccna2_progress from localStorage:", err);
    return getDefaultProgress();
  }
}

function saveProgress(progress) {
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn("Could not write ccna2_progress to localStorage:", err);
  }
}

function getQuestionNumber(question, fallbackIndex) {
  const match = String(question?.question || "").match(/^\s*(\d+)\./);
  return match ? Number(match[1]) : (fallbackIndex !== undefined ? fallbackIndex + 1 : 1);
}

function cleanQuestionText(text = "") {
  return String(text).replace(/^\s*\d+\.\s*/, "").trim();
}

function parseTopic(question) {
  const sources = [question?.explanation, question?.question];
  for (const source of sources) {
    const match = String(source || "").match(/Topic\s*(\d+(?:\.\d+)*)/i);
    if (match) return { label: match[1], chapter: Number(match[1].split(".")[0]) };
  }
  return null;
}

function isQuestionUnansweredInDataset(question) {
  const a = question?.correct_answer;
  if (a === undefined || a === null) return true;
  if (typeof a === "string" && a.trim() === "") return true;
  if (Array.isArray(a) && a.length === 0) return true;
  return false;
}

function getEffectiveCorrectAnswers(question, overrides) {
  const qNum = String(getQuestionNumber(question));
  if (overrides && overrides[qNum] && Array.isArray(overrides[qNum].correct_answer) && overrides[qNum].correct_answer.length > 0) {
    return overrides[qNum].correct_answer;
  }
  if (!question) return [];
  if (Array.isArray(question.correct_answer)) return question.correct_answer;
  return question.correct_answer ? [question.correct_answer] : [];
}

/**
 * Record an answered question into completedQuestions and wrongQuestions
 */
function recordAnswerResult({ qNumber, questionId, selected, correctList, isCorrect }) {
  const progress = loadProgress();
  const key = String(qNumber);
  const selectedArr = Array.from(selected || []);

  // Update completed list
  progress.completedQuestions[key] = {
    questionId: questionId !== undefined ? questionId : qNumber,
    status: isCorrect ? "correct" : "wrong",
    lastSelected: selectedArr,
    timestamp: Date.now()
  };

  if (!isCorrect) {
    const existing = progress.wrongQuestions[key];
    const prevCount = existing && typeof existing.missCount === "number" ? existing.missCount : 0;
    progress.wrongQuestions[key] = {
      questionId: questionId !== undefined ? questionId : qNumber,
      wrongAnswers: selectedArr,
      timestamp: Date.now(),
      missCount: prevCount + 1
    };
  } else {
    // If answered correctly during practice, auto-remove from mistakes list
    if (progress.wrongQuestions[key]) {
      delete progress.wrongQuestions[key];
    }
  }

  saveProgress(progress);
  return progress;
}

function markMistakeMastered(qNumber) {
  const progress = loadProgress();
  const key = String(qNumber);
  if (progress.wrongQuestions[key]) {
    delete progress.wrongQuestions[key];
    saveProgress(progress);
  }
  return progress;
}

function toggleQuestionFlag(qNumber) {
  const progress = loadProgress();
  const num = Number(qNumber);
  const index = progress.flaggedQuestions.indexOf(num);
  let isNowFlagged = false;
  if (index > -1) {
    progress.flaggedQuestions.splice(index, 1);
    isNowFlagged = false;
  } else {
    progress.flaggedQuestions.push(num);
    isNowFlagged = true;
  }
  saveProgress(progress);
  return isNowFlagged;
}

function isQuestionFlagged(qNumber) {
  const progress = loadProgress();
  return progress.flaggedQuestions.includes(Number(qNumber));
}

function getQuestionNote(qNumber) {
  const progress = loadProgress();
  return progress.notes[String(qNumber)] || "";
}

function saveQuestionNote(qNumber, noteText) {
  const progress = loadProgress();
  const key = String(qNumber);
  const trimmed = String(noteText || "").trim();
  if (trimmed) {
    progress.notes[key] = trimmed;
  } else {
    delete progress.notes[key];
  }
  saveProgress(progress);
  return progress;
}

function saveQuestionOverride(qNumber, overrideData) {
  const progress = loadProgress();
  const key = String(qNumber);
  progress.customOverrides[key] = {
    correct_answer: Array.isArray(overrideData.correct_answer) ? overrideData.correct_answer : (overrideData.correct_answer ? [overrideData.correct_answer] : []),
    customText: overrideData.customText || "",
    updatedAt: Date.now()
  };
  saveProgress(progress);
  return progress;
}

function removeQuestionOverride(qNumber) {
  const progress = loadProgress();
  const key = String(qNumber);
  if (progress.customOverrides[key]) {
    delete progress.customOverrides[key];
    saveProgress(progress);
  }
  return progress;
}

function resetProgressHistory() {
  const progress = loadProgress();
  progress.wrongQuestions = {};
  progress.completedQuestions = {};
  saveProgress(progress);
  return progress;
}

/**
 * Generates full JSON string with custom overrides merged in
 */
function exportUpdatedJson(allQuestions) {
  const progress = loadProgress();
  const overrides = progress.customOverrides;
  const merged = allQuestions.map((q, idx) => {
    const qNum = String(getQuestionNumber(q, idx));
    if (overrides[qNum] && overrides[qNum].correct_answer.length > 0) {
      return {
        ...q,
        correct_answer: overrides[qNum].correct_answer
      };
    }
    return q;
  });
  return JSON.stringify(merged, null, 4);
}

/**
 * Updates navbar badges across pages
 */
function syncNavbarBadges(allQuestions) {
  const unansweredCount = Array.isArray(allQuestions)
    ? allQuestions.filter(isQuestionUnansweredInDataset).length
    : 8;

  const badges = document.querySelectorAll(".nav-unanswered-badge, [data-unanswered-badge]");
  badges.forEach((el) => {
    el.textContent = `(${unansweredCount})`;
  });
}

const CCNAStorage = {
  PROGRESS_STORAGE_KEY,
  getDefaultProgress,
  loadProgress,
  saveProgress,
  getQuestionNumber,
  cleanQuestionText,
  parseTopic,
  isQuestionUnansweredInDataset,
  getEffectiveCorrectAnswers,
  recordAnswerResult,
  markMistakeMastered,
  toggleQuestionFlag,
  isQuestionFlagged,
  getQuestionNote,
  saveQuestionNote,
  saveQuestionOverride,
  removeQuestionOverride,
  resetProgressHistory,
  exportUpdatedJson,
  syncNavbarBadges
};

if (typeof window !== "undefined") {
  window.CCNAStorage = CCNAStorage;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = CCNAStorage;
}
