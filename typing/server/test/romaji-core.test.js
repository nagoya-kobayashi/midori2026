const test = require('node:test');
const assert = require('node:assert/strict');

const { createTypingSession } = require('../lib/romaji-core');

function typeAll(session, input) {
  const results = [];
  for (const char of input) {
    results.push(session.inputKey(char));
  }
  return results;
}

test('sha と sya を同じ読みで受理する', () => {
  const sessionA = createTypingSession('しゃ');
  typeAll(sessionA, 'sha');
  assert.equal(sessionA.isComplete(), true);

  const sessionB = createTypingSession('しゃ');
  typeAll(sessionB, 'sya');
  assert.equal(sessionB.isComplete(), true);
});

test('cha / cya / tya を受理する', () => {
  ['cha', 'cya', 'tya'].forEach((pattern) => {
    const session = createTypingSession('ちゃ');
    typeAll(session, pattern);
    assert.equal(session.isComplete(), true);
  });
});

test('shi / si / chi / ti / tsu / tu / fu / hu を受理する', () => {
  const cases = [
    ['し', 'shi'],
    ['し', 'si'],
    ['ち', 'chi'],
    ['ち', 'ti'],
    ['つ', 'tsu'],
    ['つ', 'tu'],
    ['ふ', 'fu'],
    ['ふ', 'hu']
  ];

  cases.forEach(([reading, input]) => {
    const session = createTypingSession(reading);
    typeAll(session, input);
    assert.equal(session.isComplete(), true, `${reading} should accept ${input}`);
  });
});

test('っ は子音重ねと ltu/xtu を受理する', () => {
  const doubled = createTypingSession('がっこう');
  typeAll(doubled, 'gakkou');
  assert.equal(doubled.isComplete(), true);

  const explicit = createTypingSession('きって');
  typeAll(explicit, 'kitte');
  assert.equal(explicit.isComplete(), true);

  const ltu = createTypingSession('まって');
  typeAll(ltu, 'maltute');
  assert.equal(ltu.isComplete(), true);
});

test('ん は母音や y の前で nn が必要になる', () => {
  const valid = createTypingSession('しんゆう');
  typeAll(valid, 'shinnyuu');
  assert.equal(valid.isComplete(), true);

  const invalid = createTypingSession('しんゆう');
  const results = typeAll(invalid, 'shinyuu');
  assert.equal(results.some((item) => !item.accepted), true);
  assert.equal(invalid.isComplete(), false);
});

test('ー はハイフン入力で受理する', () => {
  const session = createTypingSession('ほーむるーむ');
  typeAll(session, 'ho-muru-mu');
  assert.equal(session.isComplete(), true);
});

test('衝突しやすい短縮表記は受理しない', () => {
  const wo = createTypingSession('を');
  typeAll(wo, 'o');
  assert.equal(wo.isComplete(), false);

  const thi = createTypingSession('てぃ');
  typeAll(thi, 'ti');
  assert.equal(thi.isComplete(), false);

  const dhi = createTypingSession('でぃ');
  typeAll(dhi, 'di');
  assert.equal(dhi.isComplete(), false);
});

test('見直した外来音表記を受理する', () => {
  const cases = [
    ['ぃ', 'li'],
    ['を', 'wo'],
    ['てぃ', 'thi'],
    ['てぃ', 'teli'],
    ['でぃ', 'dhi'],
    ['とぅ', 'twu'],
    ['どぅ', 'dwu']
  ];

  cases.forEach(([reading, input]) => {
    const session = createTypingSession(reading);
    typeAll(session, input);
    assert.equal(session.isComplete(), true, `${reading} should accept ${input}`);
  });
});

test('小書きかなを含む拗音は分解入力でも受理する', () => {
  const cases = [
    ['ちゃ', 'chilya'],
    ['しゅ', 'shilyu'],
    ['きょ', 'kilyo']
  ];

  cases.forEach(([reading, input]) => {
    const session = createTypingSession(reading);
    typeAll(session, input);
    assert.equal(session.isComplete(), true, `${reading} should accept ${input}`);
  });
});

test('次キー候補が途中状態に追従する', () => {
  const session = createTypingSession('じょ');
  assert.deepEqual(session.getNextKeys(), ['j', 'z']);

  session.inputKey('j');
  assert.deepEqual(session.getNextKeys(), ['o', 'y']);
});
