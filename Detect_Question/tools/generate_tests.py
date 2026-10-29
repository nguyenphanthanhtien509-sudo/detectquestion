import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

def build_test_for_fixture(fixture_file, test_file, suite_name, expected_total):
    content = open(f"fixtures/{fixture_file}", "r", encoding="utf-8").read()
    
    # Extract question cards
    card_pattern = r'<div\s+class=(["\'])que(?:\s+[^"\']*)?\1\s+id=(["\'])q(\d+)\2>'
    matches = list(re.finditer(card_pattern, content))
    
    expected_questions = []
    
    for idx, m in enumerate(matches):
        q_num = int(m.group(3))
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else content.find('</form>', start)
        card_html = content[start:end]
        
        # Check inputs
        radios = re.findall(r'<input\b[^>]*\btype=["\']radio["\']', card_html, re.I)
        checkboxes = re.findall(r'<input\b[^>]*\btype=["\']checkbox["\']', card_html, re.I)
        selects = re.findall(r'<select\b[^>]*>', card_html, re.I)
        texts = re.findall(r'<input\b[^>]*\btype=["\']text["\']', card_html, re.I)
        
        if radios:
            q_type = 'single_choice'
            count = len(radios)
        elif checkboxes:
            q_type = 'multiple_choice'
            count = len(checkboxes)
        elif selects:
            q_type = 'dropdown_select'
            count = len(selects)
        elif texts:
            q_type = 'short_answer'
            count = len(texts)
        else:
            q_type = 'single_choice'
            count = 0
            
        expected_questions.append({
            "num": q_num,
            "type": q_type,
            "controlCount": count
        })
        
    print(f"{fixture_file}: Extracted {len(expected_questions)} questions")
    
    # Generate test JS code
    questions_js = ",\n".join([
        f"  {{ num: {q['num']}, type: '{q['type']}', controlCount: {q['controlCount']} }}"
        for q in expected_questions
    ])
    
    test_code = f"""const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {{ MoodleScanner }} = require('../src/content/scanner/MoodleScanner');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', '{fixture_file}');

const EXPECTED_QUESTIONS = [
{questions_js}
];

function extractQuestionCards(html) {{
  const startPattern = /<div\\s+class=(['"])que(?:\\s+[^'"]*)?\\1\\s+id=(['"])q(\\d+)\\2>/gi;
  const markers = [...html.matchAll(startPattern)];
  return markers.map((marker, index) => {{
    const end = index + 1 < markers.length ? markers[index + 1].index : html.indexOf('</form>', marker.index);
    const cardHtml = html.slice(marker.index, end !== -1 ? end : html.length);
    return {{
      num: parseInt(marker[3], 10),
      html: cardHtml
    }};
  }});
}}

function testFixture() {{
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const cards = extractQuestionCards(html);
  assert.equal(cards.length, EXPECTED_QUESTIONS.length, 'fixture must contain exactly {expected_total} question cards');
  assert.deepEqual(cards.map(card => card.num), EXPECTED_QUESTIONS.map(q => q.num), 'question ids must be q1 through q{expected_total} without gaps or duplicates');

  for (const expected of EXPECTED_QUESTIONS) {{
    const card = cards.find(item => item.num === expected.num);
    assert.ok(card, `q${{expected.num}}: card missing from fixture`);

    const scannerNumber = MoodleScanner.extractQuestionNumber({{
      id: `q${{expected.num}}`,
      querySelector: selector => selector.includes('.no') || selector.includes('.qno')
        ? {{ textContent: String(expected.num) }}
        : null
    }}, -1);
    assert.equal(scannerNumber, expected.num, `q${{expected.num}}: MoodleScanner must extract question number accurately`);

    if (expected.type === 'single_choice') {{
      const radios = card.html.match(/<input\\b[^>]*\\btype=['"]radio['"][^>]*>/gi) || [];
      assert.equal(radios.length, expected.controlCount, `q${{expected.num}}: incorrect radio count`);
    }} else if (expected.type === 'multiple_choice') {{
      const checkboxes = card.html.match(/<input\\b[^>]*\\btype=['"]checkbox['"][^>]*>/gi) || [];
      assert.equal(checkboxes.length, expected.controlCount, `q${{expected.num}}: incorrect checkbox count`);
    }} else if (expected.type === 'dropdown_select') {{
      const selects = card.html.match(/<select\\b[^>]*>/gi) || [];
      assert.equal(selects.length, expected.controlCount, `q${{expected.num}}: incorrect select count`);
    }} else {{
      const texts = card.html.match(/<input\\b[^>]*\\btype=['"]text['"][^>]*>/gi) || [];
      assert.equal(texts.length, expected.controlCount, `q${{expected.num}}: incorrect text input count`);
    }}
  }}

  const counts = EXPECTED_QUESTIONS.reduce((result, q) => {{
    result[q.type] = (result[q.type] || 0) + 1;
    return result;
  }}, {{}});

  console.log(`PASS: {suite_name} fixture validated for ${{cards.length}} questions`);
  console.log(`      Single-choice: ${{counts.single_choice || 0}}, Multiple-choice: ${{counts.multiple_choice || 0}}, Dropdown: ${{counts.dropdown_select || 0}}, Short-answer: ${{counts.short_answer || 0}}`);
}}

console.log('Running {suite_name} Test Suite...');
testFixture();
console.log('ALL {suite_name} TESTS PASSED SUCCESSFULLY!');
"""
    with open(f"tests/{test_file}", "w", encoding="utf-8") as out:
        out.write(test_code)
    print(f"Written tests/{test_file}")

build_test_for_fixture('moodle-ktmt-k15-de2.html', 'moodle-ktmt-k15-de2-fixture.test.js', 'K15 Đề 2 Exam Fixture', 45)
build_test_for_fixture('moodle-ktmt-quiz-clc-2017.html', 'moodle-ktmt-quiz-clc-2017-fixture.test.js', 'Quiz CLC 2017 Fixture', 24)
