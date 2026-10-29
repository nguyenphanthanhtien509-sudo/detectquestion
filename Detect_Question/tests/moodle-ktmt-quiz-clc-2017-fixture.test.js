const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MoodleScanner } = require('../src/content/scanner/MoodleScanner');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'moodle-ktmt-quiz-clc-2017.html');

const EXPECTED_QUESTIONS = [
  { num: 1, type: 'short_answer', controlCount: 1 },
  { num: 2, type: 'dropdown_select', controlCount: 6 },
  { num: 3, type: 'short_answer', controlCount: 1 },
  { num: 4, type: 'single_choice', controlCount: 4 },
  { num: 5, type: 'short_answer', controlCount: 1 },
  { num: 6, type: 'dropdown_select', controlCount: 2 },
  { num: 7, type: 'dropdown_select', controlCount: 3 },
  { num: 8, type: 'short_answer', controlCount: 1 },
  { num: 9, type: 'dropdown_select', controlCount: 3 },
  { num: 10, type: 'short_answer', controlCount: 1 },
  { num: 11, type: 'short_answer', controlCount: 1 },
  { num: 12, type: 'dropdown_select', controlCount: 6 },
  { num: 13, type: 'dropdown_select', controlCount: 4 },
  { num: 14, type: 'dropdown_select', controlCount: 2 },
  { num: 15, type: 'single_choice', controlCount: 4 },
  { num: 16, type: 'dropdown_select', controlCount: 2 },
  { num: 17, type: 'dropdown_select', controlCount: 2 },
  { num: 18, type: 'short_answer', controlCount: 1 },
  { num: 19, type: 'dropdown_select', controlCount: 2 },
  { num: 20, type: 'short_answer', controlCount: 1 },
  { num: 21, type: 'multiple_choice', controlCount: 4 },
  { num: 22, type: 'short_answer', controlCount: 1 },
  { num: 23, type: 'short_answer', controlCount: 1 },
  { num: 24, type: 'dropdown_select', controlCount: 3 }
];

function extractQuestionCards(html) {
  const startPattern = /<div\s+class=(['"])que(?:\s+[^'"]*)?\1\s+id=(['"])q(\d+)\2>/gi;
  const markers = [...html.matchAll(startPattern)];
  return markers.map((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].index : html.indexOf('</form>', marker.index);
    const cardHtml = html.slice(marker.index, end !== -1 ? end : html.length);
    return {
      num: parseInt(marker[3], 10),
      html: cardHtml
    };
  });
}

function testFixture() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const cards = extractQuestionCards(html);
  assert.equal(cards.length, EXPECTED_QUESTIONS.length, 'fixture must contain exactly 24 question cards');
  assert.deepEqual(cards.map(card => card.num), EXPECTED_QUESTIONS.map(q => q.num), 'question ids must be q1 through q24 without gaps or duplicates');

  for (const expected of EXPECTED_QUESTIONS) {
    const card = cards.find(item => item.num === expected.num);
    assert.ok(card, `q${expected.num}: card missing from fixture`);

    const scannerNumber = MoodleScanner.extractQuestionNumber({
      id: `q${expected.num}`,
      querySelector: selector => selector.includes('.no') || selector.includes('.qno')
        ? { textContent: String(expected.num) }
        : null
    }, -1);
    assert.equal(scannerNumber, expected.num, `q${expected.num}: MoodleScanner must extract question number accurately`);

    if (expected.type === 'single_choice') {
      const radios = card.html.match(/<input\b[^>]*\btype=['"]radio['"][^>]*>/gi) || [];
      assert.equal(radios.length, expected.controlCount, `q${expected.num}: incorrect radio count`);
    } else if (expected.type === 'multiple_choice') {
      const checkboxes = card.html.match(/<input\b[^>]*\btype=['"]checkbox['"][^>]*>/gi) || [];
      assert.equal(checkboxes.length, expected.controlCount, `q${expected.num}: incorrect checkbox count`);
    } else if (expected.type === 'dropdown_select') {
      const selects = card.html.match(/<select\b[^>]*>/gi) || [];
      assert.equal(selects.length, expected.controlCount, `q${expected.num}: incorrect select count`);
    } else {
      const texts = card.html.match(/<input\b[^>]*\btype=['"]text['"][^>]*>/gi) || [];
      assert.equal(texts.length, expected.controlCount, `q${expected.num}: incorrect text input count`);
    }
  }

  const counts = EXPECTED_QUESTIONS.reduce((result, q) => {
    result[q.type] = (result[q.type] || 0) + 1;
    return result;
  }, {});

  console.log(`PASS: Quiz CLC 2017 Fixture fixture validated for ${cards.length} questions`);
  console.log(`      Single-choice: ${counts.single_choice || 0}, Multiple-choice: ${counts.multiple_choice || 0}, Dropdown: ${counts.dropdown_select || 0}, Short-answer: ${counts.short_answer || 0}`);
}

console.log('Running Quiz CLC 2017 Fixture Test Suite...');
testFixture();
console.log('ALL Quiz CLC 2017 Fixture TESTS PASSED SUCCESSFULLY!');
