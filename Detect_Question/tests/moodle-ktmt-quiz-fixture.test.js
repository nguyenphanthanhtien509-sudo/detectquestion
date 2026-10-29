const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MoodleScanner } = require('../src/content/scanner/MoodleScanner');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'moodle-ktmt-quiz.html');

// This is an explicit contract for every question in the Moodle fixture.  It is
// deliberately about the question UI/schema, not the correct academic answer.
const EXPECTED_QUESTIONS = [
  [1, 'single_choice', 4], [2, 'short_answer', 1], [3, 'dropdown_select', 2], [4, 'single_choice', 4], [5, 'dropdown_select', 2],
  [6, 'short_answer', 1], [7, 'multiple_choice', 4], [8, 'dropdown_select', 3], [9, 'single_choice', 4], [10, 'short_answer', 1],
  [11, 'single_choice', 4], [12, 'dropdown_select', 4], [13, 'multiple_choice', 5], [14, 'single_choice', 4], [15, 'dropdown_select', 3],
  [16, 'short_answer', 1], [17, 'single_choice', 4], [18, 'multiple_choice', 4], [19, 'single_choice', 4], [20, 'multiple_choice', 6],
  [21, 'single_choice', 4], [22, 'short_answer', 1], [23, 'dropdown_select', 2], [24, 'single_choice', 4], [25, 'dropdown_select', 2],
  [26, 'short_answer', 1], [27, 'multiple_choice', 4], [28, 'dropdown_select', 3], [29, 'single_choice', 4], [30, 'short_answer', 1],
  [31, 'single_choice', 4], [32, 'dropdown_select', 4], [33, 'multiple_choice', 5], [34, 'single_choice', 4], [35, 'dropdown_select', 3],
  [36, 'short_answer', 1], [37, 'single_choice', 4], [38, 'multiple_choice', 4], [39, 'single_choice', 4], [40, 'multiple_choice', 6],
  [41, 'single_choice', 4], [42, 'short_answer', 1], [43, 'dropdown_select', 2], [44, 'single_choice', 4], [45, 'dropdown_select', 2],
  [46, 'short_answer', 1], [47, 'multiple_choice', 4], [48, 'dropdown_select', 3], [49, 'single_choice', 4], [50, 'short_answer', 1]
].map(([num, type, controlCount]) => ({ num, type, controlCount }));

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
  assert.ok(stripTags(stemMatch[2]).length >= 12, `q${card.num}: question stem is unexpectedly empty`);
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

function testEveryMoodleQuestionFixtureContract() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const cards = extractQuestionCards(html);
  assert.equal(cards.length, EXPECTED_QUESTIONS.length, 'fixture must contain exactly the 50 documented question cards');
  assert.deepEqual(cards.map(card => card.num), EXPECTED_QUESTIONS.map(question => question.num), 'question ids must be q1 through q50 without gaps or duplicates');
  assert.match(html, /const\s+totalQuestions\s*=\s*50\s*;/, 'fixture navigation must declare the same total question count');
  assert.match(html, /function\s+getPageFromLocation\s*\(/, 'fixture must restore the selected page from its URL');
  assert.ok(html.includes('window.history.replaceState(null,'), 'fixture must persist the selected page without navigating');
  assert.ok(html.lastIndexOf('renderPage(currentPage);') > html.lastIndexOf('function triggerDetectTest'), 'fixture initialization must use the restored selected page, not hard-code question 1');

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
    assert.equal(scannerNumber, expected.num, `q${expected.num}: MoodleScanner must retain its question number`);

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

  const counts = EXPECTED_QUESTIONS.reduce((result, question) => {
    result[question.type] = (result[question.type] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    single_choice: 17,
    short_answer: 11,
    dropdown_select: 13,
    multiple_choice: 9
  });

  console.log(`PASS: Moodle fixture contract validated for ${cards.length} questions`);
  console.log(`      single=${counts.single_choice}, multiple=${counts.multiple_choice}, dropdown=${counts.dropdown_select}, short=${counts.short_answer}`);
}

console.log('Running Moodle KTMT fixture test suite...');
testEveryMoodleQuestionFixtureContract();
console.log('ALL MOODLE KTMT FIXTURE TESTS COMPLETED!');
