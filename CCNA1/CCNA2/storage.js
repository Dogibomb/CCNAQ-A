/**
 * CCNA 2 — Storage & Progress Management
 * Persists drill progress, mistake tracking, bookmark flags, and study notes
 * in localStorage under `ccna2_progress`, with in-memory caching.
 */

const PROGRESS_STORAGE_KEY = "ccna2_progress";
let cachedProgress = null;

function getDefaultProgress() {
  return {
    wrongQuestions: {},      // qNumber -> { questionId, wrongAnswers: [], timestamp, missCount }
    completedQuestions: {},  // qNumber -> { questionId, status: "correct" | "wrong", lastSelected: [], timestamp }
    flaggedQuestions: [],    // [ qNumber, ... ]
    notes: {},               // qNumber -> "note text"
    customOverrides: {}      // retained gracefully if present in existing storage
  };
}

function normalizeProgress(data) {
  return {
    wrongQuestions: (data && typeof data.wrongQuestions === "object" && data.wrongQuestions) || {},
    completedQuestions: (data && typeof data.completedQuestions === "object" && data.completedQuestions) || {},
    flaggedQuestions: Array.isArray(data?.flaggedQuestions) ? data.flaggedQuestions.map(Number) : [],
    notes: (data && typeof data.notes === "object" && data.notes) || {},
    customOverrides: (data && typeof data.customOverrides === "object" && data.customOverrides) || {}
  };
}

function loadProgress() {
  if (cachedProgress) return cachedProgress;
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    cachedProgress = raw ? normalizeProgress(JSON.parse(raw)) : getDefaultProgress();
    return cachedProgress;
  } catch (err) {
    console.warn("Could not read ccna2_progress from localStorage:", err);
    cachedProgress = getDefaultProgress();
    return cachedProgress;
  }
}

function saveProgress(progress) {
  cachedProgress = normalizeProgress(progress);
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(cachedProgress));
  } catch (err) {
    console.warn("Could not write ccna2_progress to localStorage:", err);
  }
}

function invalidateCache() {
  cachedProgress = null;
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (event) => {
    if (event.key === PROGRESS_STORAGE_KEY || event.key === null) {
      cachedProgress = null;
    }
  });
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

function isMatchingQuestion(question) {
  return question?.type === "matching" && Boolean(question?.matching);
}

function formatExplanation(explanation = "") {
  return String(explanation || "").replace(/^Topic\s*\d+(?:\.\d+)*\s*/i, "").trim();
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function applyAnswerToProgress(progress, { qNumber, questionId, selected, isCorrect }) {
  const key = String(qNumber);
  const selectedArr = Array.from(selected || []);
  const now = Date.now();

  progress.completedQuestions[key] = {
    questionId: questionId !== undefined ? questionId : qNumber,
    status: isCorrect ? "correct" : "wrong",
    lastSelected: selectedArr,
    timestamp: now
  };

  if (!isCorrect) {
    const existing = progress.wrongQuestions[key];
    const prevCount = existing && typeof existing.missCount === "number" ? existing.missCount : 0;
    progress.wrongQuestions[key] = {
      questionId: questionId !== undefined ? questionId : qNumber,
      wrongAnswers: selectedArr,
      timestamp: now,
      missCount: prevCount + 1
    };
  } else if (progress.wrongQuestions[key]) {
    delete progress.wrongQuestions[key];
  }
}

function recordAnswerResult(result) {
  const progress = loadProgress();
  applyAnswerToProgress(progress, result);
  saveProgress(progress);
  return progress;
}

function recordBatchResults(results) {
  const progress = loadProgress();
  results.forEach((result) => applyAnswerToProgress(progress, result));
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
  } else {
    progress.flaggedQuestions.push(num);
    isNowFlagged = true;
  }
  saveProgress(progress);
  return isNowFlagged;
}

function isQuestionFlagged(qNumber) {
  return loadProgress().flaggedQuestions.includes(Number(qNumber));
}

function getQuestionNote(qNumber) {
  return loadProgress().notes[String(qNumber)] || "";
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

function resetProgressHistory() {
  const progress = loadProgress();
  progress.wrongQuestions = {};
  progress.completedQuestions = {};
  saveProgress(progress);
  return progress;
}

const CCNAStorage = {
  PROGRESS_STORAGE_KEY,
  getDefaultProgress,
  loadProgress,
  saveProgress,
  invalidateCache,
  getQuestionNumber,
  cleanQuestionText,
  parseTopic,
  isMatchingQuestion,
  formatExplanation,
  escapeHtml,
  getEffectiveCorrectAnswers,
  recordAnswerResult,
  recordBatchResults,
  markMistakeMastered,
  toggleQuestionFlag,
  isQuestionFlagged,
  getQuestionNote,
  saveQuestionNote,
  resetProgressHistory
};

if (typeof window !== "undefined") {
  window.CCNAStorage = CCNAStorage;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = CCNAStorage;
}
