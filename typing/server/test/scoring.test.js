const test = require('node:test');
const assert = require('node:assert/strict');

const { computeScore } = require('../lib/scoring');

test('採点式は正打鍵と完了文を加点しミスを減点する', () => {
  const result = computeScore({
    correctCount: 120,
    missCount: 10,
    completedPrompts: 6,
    completedStageCounts: {
      alphabetSingle: 1,
      alphabetTriple: 1,
      englishWord: 1,
      japaneseWord: 1,
      japaneseSentence: 2
    },
    inputCount: 130,
    maxCombo: 24,
    durationSec: 300
  });

  assert.equal(result.correctCount, 120);
  assert.equal(result.completedPrompts, 6);
  assert.equal(result.inputCount, 130);
  assert.equal(result.accuracy, 92.31);
  assert.equal(result.score, 1231);
});

test('不正な値は 0 以上の安全な値へ丸める', () => {
  const result = computeScore({
    correctCount: -5,
    missCount: 'abc',
    completedPrompts: -1,
    completedStageCounts: {
      alphabetSingle: -1,
      japaneseSentence: 'abc'
    },
    inputCount: -100,
    maxCombo: null,
    durationSec: 9999
  });

  assert.equal(result.correctCount, 0);
  assert.equal(result.missCount, 0);
  assert.equal(result.completedPrompts, 0);
  assert.deepEqual(result.completedStageCounts, {
    alphabetSingle: 0,
    alphabetTriple: 0,
    englishWord: 0,
    japaneseWord: 0,
    japaneseSentence: 0
  });
  assert.equal(result.inputCount, 0);
  assert.equal(result.maxCombo, 0);
  assert.equal(result.durationSec, 300);
  assert.equal(result.score, 0);
});
