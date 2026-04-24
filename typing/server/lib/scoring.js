const { GAME_DURATION_SEC } = require('./config');

const SCORE_RULE = {
  correctWeight: 10,
  completedPromptBonusByStage: {
    alphabetSingle: 2,
    alphabetTriple: 4,
    englishWord: 6,
    japaneseWord: 8,
    japaneseSentence: 12
  },
  maxComboBonus: 10,
  missPenalty: 15,
  useAccuracyMultiplier: true,
  minScore: 0
};

function createCompletedStageCounts() {
  return {
    alphabetSingle: 0,
    alphabetTriple: 0,
    englishWord: 0,
    japaneseWord: 0,
    japaneseSentence: 0
  };
}

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return Math.floor(n);
}

function sanitizeCompletedStageCounts(raw) {
  const base = createCompletedStageCounts();
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    alphabetSingle: toNonNegativeInt(source.alphabetSingle, 0),
    alphabetTriple: toNonNegativeInt(source.alphabetTriple, 0),
    englishWord: toNonNegativeInt(source.englishWord, 0),
    japaneseWord: toNonNegativeInt(source.japaneseWord, 0),
    japaneseSentence: toNonNegativeInt(source.japaneseSentence, 0)
  };
}

function getCompletedPromptBonus(completedStageCounts) {
  const safe = sanitizeCompletedStageCounts(completedStageCounts);
  return (
    safe.alphabetSingle * SCORE_RULE.completedPromptBonusByStage.alphabetSingle +
    safe.alphabetTriple * SCORE_RULE.completedPromptBonusByStage.alphabetTriple +
    safe.englishWord * SCORE_RULE.completedPromptBonusByStage.englishWord +
    safe.japaneseWord * SCORE_RULE.completedPromptBonusByStage.japaneseWord +
    safe.japaneseSentence * SCORE_RULE.completedPromptBonusByStage.japaneseSentence
  );
}

function sanitizeMetrics(raw = {}) {
  const correctCount = toNonNegativeInt(raw.correctCount, 0);
  const missCount = toNonNegativeInt(raw.missCount, 0);
  const completedPrompts = toNonNegativeInt(raw.completedPrompts, 0);
  const inputCount = toNonNegativeInt(raw.inputCount, correctCount + missCount);
  const maxCombo = toNonNegativeInt(raw.maxCombo, 0);
  const durationSec = Math.min(GAME_DURATION_SEC, Math.max(0, toNonNegativeInt(raw.durationSec, GAME_DURATION_SEC)));
  const completedStageCounts = sanitizeCompletedStageCounts(raw.completedStageCounts);

  return {
    correctCount,
    missCount,
    completedPrompts,
    completedStageCounts,
    inputCount,
    maxCombo,
    durationSec
  };
}

function computeScore(metrics) {
  const safe = sanitizeMetrics(metrics);
  const attempts = safe.correctCount + safe.missCount;
  const accuracyRate = attempts > 0 ? safe.correctCount / attempts : 0;
  const accuracy = Number((accuracyRate * 100).toFixed(2));

  const rawScore =
    safe.correctCount * SCORE_RULE.correctWeight +
    getCompletedPromptBonus(safe.completedStageCounts) +
    safe.maxCombo * SCORE_RULE.maxComboBonus -
    safe.missCount * SCORE_RULE.missPenalty;

  const multiplied = SCORE_RULE.useAccuracyMultiplier ? rawScore * accuracyRate : rawScore;
  const score = Math.max(SCORE_RULE.minScore, Math.round(multiplied));

  return {
    ...safe,
    attempts,
    accuracy,
    score
  };
}

module.exports = {
  SCORE_RULE,
  createCompletedStageCounts,
  sanitizeCompletedStageCounts,
  getCompletedPromptBonus,
  sanitizeMetrics,
  computeScore
};
