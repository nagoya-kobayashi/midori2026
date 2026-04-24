const test = require('node:test');
const assert = require('node:assert/strict');

const { getStageByCombo, pickPrompt, normalizePrompt } = require('../lib/prompts');
const { createTypingSession } = require('../lib/romaji-core');

function typeAll(session, input) {
  for (const char of input) {
    session.inputKey(char);
  }
}

test('コンボ到達値で出題段階が切り替わる', () => {
  assert.equal(getStageByCombo(0), 0);
  assert.equal(getStageByCombo(29), 0);
  assert.equal(getStageByCombo(30), 1);
  assert.equal(getStageByCombo(79), 1);
  assert.equal(getStageByCombo(80), 2);
  assert.equal(getStageByCombo(149), 2);
  assert.equal(getStageByCombo(150), 3);
  assert.equal(getStageByCombo(299), 3);
  assert.equal(getStageByCombo(300), 4);
});

test('段階ごとに想定した種類のお題を返す', () => {
  const single = pickPrompt({ stage: 0, index: 0, seed: 100 });
  assert.equal(single.text.length, 1);
  assert.match(single.text, /^[A-Z]$/);

  const triple = pickPrompt({ stage: 1, index: 2, seed: 100 });
  assert.equal(triple.reading.length, 3);

  const english = pickPrompt({ stage: 2, index: 4, seed: 100 });
  assert.match(english.reading, /^[a-z]+$/);
  assert.ok(english.reading.length >= 4);

  const japaneseWord = pickPrompt({ stage: 3, index: 6, seed: 100 });
  assert.match(japaneseWord.reading, /^[ぁ-んー]+$/);

  const japaneseSentence = pickPrompt({ stage: 4, index: 8, seed: 100 });
  assert.ok(japaneseSentence.text.endsWith('。'));
  assert.ok(japaneseSentence.reading.endsWith('。'));
});

test('同じ段階ではプールを一巡するまで重複しにくい', () => {
  const seen = new Set();
  for (let index = 0; index < 20; index += 1) {
    const prompt = pickPrompt({ stage: 3, index, seed: 777 });
    assert.equal(seen.has(prompt.id), false, `duplicate prompt at index ${index}`);
    seen.add(prompt.id);
  }
});

test('日本語単語のお題は canonical reading に補正できる', () => {
  const groupPrompt = normalizePrompt({ text: 'グループ学習', reading: 'グループ学習' }, 3);
  assert.equal(groupPrompt.reading, 'ぐるーぷがくしゅう');
  const groupSession = createTypingSession(groupPrompt.reading);
  typeAll(groupSession, 'guru-pugakushuu');
  assert.equal(groupSession.isComplete(), true);

  const happyoPrompt = normalizePrompt({ text: '発表', reading: '発表' }, 3);
  assert.equal(happyoPrompt.reading, 'はっぴょう');
  const happyoSession = createTypingSession(happyoPrompt.reading);
  typeAll(happyoSession, 'happyou');
  assert.equal(happyoSession.isComplete(), true);
});
