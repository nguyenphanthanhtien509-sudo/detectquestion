const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MoodleScanner } = require('../src/content/scanner/MoodleScanner');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'moodle-ktmt-midterm-gk.html');

const EXPECTED_QUESTIONS = [
  { num: 1, type: 'short_answer', controlCount: 1 },
  { num: 2, type: 'single_choice', controlCount: 4 },
  { num: 3, type: 'single_choice', controlCount: 4 },
  { num: 4, type: 'short_answer', controlCount: 1 },
  { num: 5, type: 'single_choice', controlCount: 5 },
  { num: 6, type: 'multiple_choice', controlCount: 4 },
  { num: 7, type: 'single_choice', controlCount: 4 },
  { num: 8, type: 'single_choice', controlCount: 4 },
  { num: 9, type: 'multiple_choice', controlCount: 4 },
  { num: 10, type: 'single_choice', controlCount: 4 },
  { num: 11, type: 'single_choice', controlCount: 4 },
  { num: 12, type: 'single_choice', controlCount: 4 },
  { num: 13, type: 'multiple_choice', controlCount: 4 },
  { num: 14, type: 'single_choice', controlCount: 4 },
  { num: 15, type: 'multiple_choice', controlCount: 4 },
  { num: 16, type: 'short_answer', controlCount: 1 },
  { num: 17, type: 'short_answer', controlCount: 1 },
  { num: 18, type: 'single_choice', controlCount: 4 },
  { num: 19, type: 'single_choice', controlCount: 4 },
  { num: 20, type: 'single_choice', controlCount: 4 },
  { num: 21, type: 'short_answer', controlCount: 1 },
  { num: 22, type: 'single_choice', controlCount: 4 },
  { num: 23, type: 'single_choice', controlCount: 4 },
  { num: 24, type: 'multiple_choice', controlCount: 4 },
  { num: 25, type: 'multiple_choice', controlCount: 4 },
  { num: 26, type: 'multiple_choice', controlCount: 4 },
  { num: 27, type: 'multiple_choice', controlCount: 4 },
  { num: 28, type: 'short_answer', controlCount: 1 },
  { num: 29, type: 'short_answer', controlCount: 1 },
  { num: 30, type: 'single_choice', controlCount: 4 },
  { num: 31, type: 'single_choice', controlCount: 4 },
  { num: 32, type: 'short_answer', controlCount: 1 },
  { num: 33, type: 'multiple_choice', controlCount: 4 },
  { num: 34, type: 'short_answer', controlCount: 1 },
  { num: 35, type: 'short_answer', controlCount: 1 },
  { num: 36, type: 'single_choice', controlCount: 4 },
  { num: 37, type: 'single_choice', controlCount: 4 },
  { num: 38, type: 'short_answer', controlCount: 3 },
  { num: 39, type: 'short_answer', controlCount: 1 },
  { num: 40, type: 'short_answer', controlCount: 1 }
];

function getAttr(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function extractQuestionCards(html) {
  const startPattern = /<div\s+class=(['"])que(?:\s+[^'"]*)?\1\s+id=(['"])q(\d+)\2>/gi;
  const markers = [...html.matchAll(startPattern)];
  return markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].index : html.indexOf('</form>', marker.index);
    return { num: Number(marker[3]), html: html.slice(marker.index, end) };
  });
}

function inputTags(cardHtml, type) {
  const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cardHtml.match(new RegExp(`<input\\b(?=[^>]*\\btype=['"]${escapedType}['"])[^>]*>`, 'gi')) || [];
}

function textOrTextareaTags(cardHtml) {
  const inputs = cardHtml.match(/<input\b(?=[^>]*\btype=['"]text['"])[^>]*>/gi) || [];
  const textareas = cardHtml.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi) || [];
  return [...inputs, ...textareas];
}

function assertStemAndDisplayedNumber(card) {
  const numberMatch = card.html.match(/<h3\b[^>]*class=(['"])[^'"]*\bno\b[^'"]*\1[^>]*>([\s\S]*?)<\/h3>/i);
  assert.ok(numberMatch, `q${card.num}: missing Moodle displayed question number`);
  assert.equal(Number(stripTags(numberMatch[2])), card.num, `q${card.num}: displayed number must match card id`);

  const stemMatch = card.html.match(/<div\b[^>]*class=(['"])[^'"]*\bqtext\b[^'"]*\1[^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(stemMatch, `q${card.num}: missing .qtext question stem`);
  assert.ok(stripTags(stemMatch[2]).length >= 6, `q${card.num}: question stem is unexpectedly empty`);
}

function assertInputBindings(card, inputs, expectedType) {
  assert.equal(inputs.length, expectedType.controlCount, `q${card.num}: incorrect ${expectedType.type} control count`);
  const seenIds = new Set();
  const seenNames = new Set();
  for (const input of inputs) {
    const id = getAttr(input, 'id');
    const name = getAttr(input, 'name');
    const value = getAttr(input, 'value');
    assert.ok(id, `q${card.num}: answer input is missing id`);
    assert.ok(name, `q${card.num}: answer input is missing name`);
    assert.ok(value, `q${card.num}: answer input is missing value`);
    assert.ok(!seenIds.has(id), `q${card.num}: duplicate answer input id ${id}`);
    seenIds.add(id);
    seenNames.add(name);
    assert.match(card.html, new RegExp(`<label\\b[^>]*\\bfor=['"]${id}['"]`, 'i'), `q${card.num}: input ${id} has no associated label`);
  }
  assert.equal(seenNames.size, 1, `q${card.num}: answer inputs must be one Moodle answer group`);
}

function assertShortAnswerBinding(card, expected) {
  const textInputs = textOrTextareaTags(card.html);
  assert.equal(textInputs.length, expected.controlCount, `q${card.num}: incorrect short-answer input count`);
  for (const input of textInputs) {
    const id = getAttr(input, 'id');
    const name = getAttr(input, 'name');
    const placeholder = getAttr(input, 'placeholder');
    assert.ok(id && name, `q${card.num}: short-answer input needs id and name`);
    assert.equal(placeholder, 'Điền đáp án...', `q${card.num}: short-answer must have generic placeholder`);
    assert.match(card.html, new RegExp(`<label\\b[^>]*\\bfor=['"]${id}['"]`, 'i'), `q${card.num}: short-answer input ${id} has no label`);
  }
}

function testEveryQuestionInMidTermGkExam() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const cards = extractQuestionCards(html);
  assert.equal(cards.length, EXPECTED_QUESTIONS.length, 'fixture must contain exactly 40 question cards');
  assert.deepEqual(cards.map(card => card.num), EXPECTED_QUESTIONS.map(q => q.num), 'question ids must be q1 through q40 without gaps or duplicates');
  assert.match(html, /const\s+totalQuestions\s*=\s*40\s*;/, 'fixture navigation must declare totalQuestions = 40');
  assert.match(html, /function\s+getPageFromLocation\s*\(/, 'fixture must restore selected page from URL');
  assert.ok(html.includes('window.history.replaceState(null,'), 'fixture must persist selected page via replaceState');

  // Verify generic placeholder and clean image constraints
  assert.ok(!html.includes('placeholder="Nhập'), 'fixture must not use non-generic placeholder');
  assert.ok(html.includes('placeholder="Điền đáp án..."'), 'fixture must use generic placeholder "Điền đáp án..."');

  for (const expected of EXPECTED_QUESTIONS) {
    const card = cards.find(item => item.num === expected.num);
    assert.ok(card, `q${expected.num}: card missing from fixture`);
    assertStemAndDisplayedNumber(card);

    const scannerNumber = MoodleScanner.extractQuestionNumber({
      id: `q${expected.num}`,
      querySelector: selector => selector.includes('.no') || selector.includes('.qno')
        ? { textContent: String(expected.num) }
        : null
    }, -1);
    assert.equal(scannerNumber, expected.num, `q${expected.num}: MoodleScanner must extract question number accurately`);

    if (expected.type === 'single_choice') {
      assertInputBindings(card, inputTags(card.html, 'radio'), expected);
    } else if (expected.type === 'multiple_choice') {
      assertInputBindings(card, inputTags(card.html, 'checkbox'), expected);
    } else {
      assertShortAnswerBinding(card, expected);
    }
  }

  const counts = EXPECTED_QUESTIONS.reduce((result, q) => {
    result[q.type] = (result[q.type] || 0) + 1;
    return result;
  }, {});

  console.log(`PASS: Mid Term GK Exam fixture validated for ${cards.length} questions`);
  console.log(`      Single-choice: ${counts.single_choice}, Multiple-choice: ${counts.multiple_choice}, Short-answer: ${counts.short_answer}`);
}

console.log('Running Mid Term GK Exam Fixture Test Suite...');
testEveryQuestionInMidTermGkExam();
console.log('ALL MID TERM GK EXAM TESTS PASSED SUCCESSFULLY!');
