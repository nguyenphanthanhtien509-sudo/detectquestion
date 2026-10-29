const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MoodleScanner } = require('../src/content/scanner/MoodleScanner');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'moodle-ktmt-2019-exam.html');

const EXPECTED_QUESTIONS = [
  { num: 1, type: 'multiple_choice', controlCount: 4 },
  { num: 2, type: 'single_choice', controlCount: 4 },
  { num: 3, type: 'multiple_choice', controlCount: 4 },
  { num: 4, type: 'dropdown_select', controlCount: 4 },
  { num: 5, type: 'single_choice', controlCount: 4 },
  { num: 6, type: 'dropdown_select', controlCount: 3 },
  { num: 7, type: 'multiple_choice', controlCount: 4 },
  { num: 8, type: 'single_choice', controlCount: 4 },
  { num: 9, type: 'multiple_choice', controlCount: 5 },
  { num: 10, type: 'multiple_choice', controlCount: 4 },
  { num: 11, type: 'short_answer', controlCount: 1 },
  { num: 12, type: 'dropdown_select', controlCount: 2 },
  { num: 13, type: 'multiple_choice', controlCount: 4 },
  { num: 14, type: 'multiple_choice', controlCount: 4 },
  { num: 15, type: 'multiple_choice', controlCount: 6 },
  { num: 16, type: 'single_choice', controlCount: 4 },
  { num: 17, type: 'short_answer', controlCount: 1 },
  { num: 18, type: 'dropdown_select', controlCount: 2 },
  { num: 19, type: 'dropdown_select', controlCount: 3 },
  { num: 20, type: 'multiple_choice', controlCount: 4 },
  { num: 21, type: 'multiple_choice', controlCount: 4 },
  { num: 22, type: 'dropdown_select', controlCount: 2 },
  { num: 23, type: 'multiple_choice', controlCount: 4 },
  { num: 24, type: 'single_choice', controlCount: 4 },
  { num: 25, type: 'single_choice', controlCount: 4 },
  { num: 26, type: 'dropdown_select', controlCount: 6 },
  { num: 27, type: 'short_answer', controlCount: 1 },
  { num: 28, type: 'single_choice', controlCount: 4 },
  { num: 29, type: 'dropdown_select', controlCount: 2 },
  { num: 30, type: 'multiple_choice', controlCount: 5 },
  { num: 31, type: 'dropdown_select', controlCount: 4 },
  { num: 32, type: 'short_answer', controlCount: 1 },
  { num: 33, type: 'dropdown_select', controlCount: 6 },
  { num: 34, type: 'short_answer', controlCount: 1 },
  { num: 35, type: 'short_answer', controlCount: 1 },
  { num: 36, type: 'single_choice', controlCount: 4 },
  { num: 37, type: 'short_answer', controlCount: 1 },
  { num: 38, type: 'single_choice', controlCount: 4 },
  { num: 39, type: 'short_answer', controlCount: 1 },
  { num: 40, type: 'short_answer', controlCount: 1 },
  { num: 41, type: 'dropdown_select', controlCount: 7 },
  { num: 42, type: 'short_answer', controlCount: 1 },
  { num: 43, type: 'single_choice', controlCount: 4 },
  { num: 44, type: 'short_answer', controlCount: 1 },
  { num: 45, type: 'dropdown_select', controlCount: 4 }
];

function getAttr(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(['\"])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function extractQuestionCards(html) {
  const startPattern = /<div\s+class=(['\"])que(?:\s+[^'\"]*)?\1\s+id=(['\"])q(\d+)\2>/gi;
  const markers = [...html.matchAll(startPattern)];
  return markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].index : html.indexOf('</form>', marker.index);
    return { num: Number(marker[3]), html: html.slice(marker.index, end) };
  });
}

function inputTags(cardHtml, type) {
  const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cardHtml.match(new RegExp(`<input\\b(?=[^>]*\\btype=['\"]${escapedType}['\"])[^>]*>`, 'gi')) || [];
}

function selectTags(cardHtml) {
  return [...cardHtml.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)].map(match => match[0]);
}

function assertStemAndDisplayedNumber(card) {
  const numberMatch = card.html.match(/<h3\b[^>]*class=(['\"])[^'\"]*\bno\b[^'\"]*\1[^>]*>([\s\S]*?)<\/h3>/i);
  assert.ok(numberMatch, `q${card.num}: missing Moodle displayed question number`);
  assert.equal(Number(stripTags(numberMatch[2])), card.num, `q${card.num}: displayed number must match card id`);

  const stemMatch = card.html.match(/<div\b[^>]*class=(['\"])[^'\"]*\bqtext\b[^'\"]*\1[^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(stemMatch, `q${card.num}: missing .qtext question stem`);
  assert.ok(stripTags(stemMatch[2]).length >= 8, `q${card.num}: question stem is unexpectedly empty`);
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
    assert.match(card.html, new RegExp(`<label\\b[^>]*\\bfor=['\"]${id}['\"]`, 'i'), `q${card.num}: input ${id} has no associated label`);
  }
  assert.equal(seenNames.size, 1, `q${card.num}: answer inputs must be one Moodle answer group`);
}

function assertSelectBindings(card, expected) {
  const selects = selectTags(card.html);
  assert.equal(selects.length, expected.controlCount, `q${card.num}: incorrect dropdown control count`);
  const selectIds = new Set();
  for (const select of selects) {
    const openingTag = select.match(/^<select\b[^>]*>/i)[0];
    const id = getAttr(openingTag, 'id');
    const name = getAttr(openingTag, 'name');
    assert.ok(id, `q${card.num}: dropdown is missing id`);
    assert.ok(name, `q${card.num}: dropdown is missing name`);
    assert.ok(!selectIds.has(id), `q${card.num}: duplicate dropdown id ${id}`);
    selectIds.add(id);

    const nonEmptyOptions = [...select.matchAll(/<option\b[^>]*\bvalue=(['\"])(.*?)\1[^>]*>([\s\S]*?)<\/option>/gi)]
      .filter(option => option[2] !== '')
      .map(option => stripTags(option[3]));
    assert.ok(nonEmptyOptions.length >= 2, `q${card.num}: dropdown ${id} must expose at least two selectable options`);
    assert.ok(nonEmptyOptions.every(Boolean), `q${card.num}: dropdown ${id} has a blank selectable option`);
  }
}

function assertShortAnswerBinding(card, expected) {
  const textInputs = inputTags(card.html, 'text');
  assert.equal(textInputs.length, expected.controlCount, `q${card.num}: incorrect short-answer input count`);
  for (const input of textInputs) {
    const id = getAttr(input, 'id');
    const name = getAttr(input, 'name');
    assert.ok(id && name, `q${card.num}: short-answer input needs id and name`);
    assert.match(card.html, new RegExp(`<label\\b[^>]*\\bfor=['\"]${id}['\"]`, 'i'), `q${card.num}: short-answer input ${id} has no label`);
  }
}

function testEveryQuestionIn2019Exam() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const cards = extractQuestionCards(html);
  assert.equal(cards.length, EXPECTED_QUESTIONS.length, 'fixture must contain exactly 45 question cards');
  assert.deepEqual(cards.map(card => card.num), EXPECTED_QUESTIONS.map(q => q.num), 'question ids must be q1 through q45 without gaps or duplicates');
  assert.match(html, /const\s+totalQuestions\s*=\s*45\s*;/, 'fixture navigation must declare totalQuestions = 45');
  assert.match(html, /function\s+getPageFromLocation\s*\(/, 'fixture must restore selected page from URL');
  assert.ok(html.includes('window.history.replaceState(null,'), 'fixture must persist selected page via replaceState');

  for (const expected of EXPECTED_QUESTIONS) {
    const card = cards.find(item => item.num === expected.num);
    assert.ok(card, `q${expected.num}: card missing from fixture`);
    assertStemAndDisplayedNumber(card);

    const scannerNumber = MoodleScanner.extractQuestionNumber({
      id: `q${expected.num}`,
      querySelector: selector => selector.includes('.qno') || selector.includes('.no')
        ? { textContent: String(expected.num) }
        : null
    }, -1);
    assert.equal(scannerNumber, expected.num, `q${expected.num}: MoodleScanner must extract question number accurately`);

    if (expected.type === 'single_choice') {
      assertInputBindings(card, inputTags(card.html, 'radio'), expected);
    } else if (expected.type === 'multiple_choice') {
      assertInputBindings(card, inputTags(card.html, 'checkbox'), expected);
    } else if (expected.type === 'dropdown_select') {
      assertSelectBindings(card, expected);
    } else {
      assertShortAnswerBinding(card, expected);
    }
  }

  const counts = EXPECTED_QUESTIONS.reduce((result, q) => {
    result[q.type] = (result[q.type] || 0) + 1;
    return result;
  }, {});

  console.log(`PASS: 2019 Exam fixture validated for ${cards.length} questions`);
  console.log(`      Single-choice: ${counts.single_choice}, Multiple-choice: ${counts.multiple_choice}, Dropdown: ${counts.dropdown_select}, Short-answer: ${counts.short_answer}`);
}

console.log('Running 2019 Exam Fixture Test Suite...');
testEveryQuestionIn2019Exam();
console.log('ALL 2019 EXAM TESTS PASSED SUCCESSFULLY!');
