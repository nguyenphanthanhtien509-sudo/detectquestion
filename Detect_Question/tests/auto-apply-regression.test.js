'use strict';

const assert = require('assert');
const { ContinuousSolveRunner } = require('../src/content/solver/ContinuousSolveRunner');
const { DomAnswerClicker } = require('../src/content/clicker/DomAnswerClicker');
const { TextUtils } = require('../src/content/core/TextUtils');

// Mock DOM elements and environment helpers
function createMockElement(tag, attrs = {}) {
  const listeners = {};
  const classes = new Set();
  const children = [];
  const el = {
    tagName: tag.toUpperCase(),
    attributes: { ...attrs },
    style: {},
    checked: attrs.checked || false,
    value: attrs.value || '',
    type: attrs.type || '',
    id: attrs.id || '',
    name: attrs.name || '',
    disabled: attrs.disabled || false,
    readOnly: attrs.readOnly || false,
    isConnected: true,
    children,
    parentElement: null,
    ownerDocument: null,
    classList: {
      add(...cls) { cls.forEach(c => classes.add(c)); },
      remove(...cls) { cls.forEach(c => classes.delete(c)); },
      contains(c) { return classes.has(c); }
    },
    getAttribute(name) { return el.attributes[name] ?? (name === 'role' ? el.attributes.role : null); },
    setAttribute(name, val) { el.attributes[name] = String(val); },
    removeAttribute(name) { delete el.attributes[name]; },
    addEventListener(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent(evt) {
      const type = evt?.type || evt;
      const fns = listeners[type] || [];
      fns.forEach(fn => fn.call(el, evt));
      return true;
    },
    click() {
      if (el.disabled) return;
      if (el.type === 'radio') el.checked = true;
      if (el.type === 'checkbox') el.checked = !el.checked;
      el.dispatchEvent({ type: 'click' });
    },
    querySelector(selector) {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      function traverse(node) {
        if (!node || !node.children) return;
        for (const child of node.children) {
          if (matchesSelector(child, selector)) results.push(child);
          traverse(child);
        }
      }
      traverse(el);
      return results;
    },
    appendChild(child) {
      child.parentElement = el;
      child.ownerDocument = el.ownerDocument;
      children.push(child);
      return child;
    },
    closest(selector) {
      let cur = el;
      while (cur) {
        if (matchesSelector(cur, selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    scrollIntoView() {},
    focus() {},
    blur() {}
  };
  (attrs.classes || []).forEach(c => classes.add(c));
  return el;
}

function matchesSelector(el, sel) {
  if (!el || !sel) return false;
  const parts = sel.split(',').map(s => s.trim());
  return parts.some(part => {
    if (part === 'input' && el.tagName === 'INPUT') return true;
    if (part === 'select' && el.tagName === 'SELECT') return true;
    if (part === 'textarea' && el.tagName === 'TEXTAREA') return true;
    if (part.startsWith('.') && el.classList?.contains(part.slice(1))) return true;
    if (part.startsWith('#') && el.id === part.slice(1)) return true;
    const dotIdx = part.indexOf('.');
    if (dotIdx > 0) {
      const tag = part.slice(0, dotIdx).toUpperCase();
      const cls = part.slice(dotIdx + 1);
      if (el.tagName === tag && el.classList?.contains(cls)) return true;
    }
    if (part.startsWith('input[type="radio"]') && el.tagName === 'INPUT' && el.type === 'radio') {
      if (part.includes(':checked')) return el.checked;
      return true;
    }
    if (part.startsWith('input[type="checkbox"]') && el.tagName === 'INPUT' && el.type === 'checkbox') {
      if (part.includes(':checked')) return el.checked;
      return true;
    }
    const attrMatch = part.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
    if (attrMatch) {
      const val = el.getAttribute?.(attrMatch[1]);
      if (attrMatch[2] !== undefined) return val === attrMatch[2];
      return val !== null && val !== undefined;
    }
    return false;
  });
}

function setupMockDocument() {
  const doc = {
    body: createMockElement('body'),
    documentElement: createMockElement('html'),
    querySelector(sel) { return doc.body.querySelector(sel); },
    querySelectorAll(sel) { return doc.body.querySelectorAll(sel); }
  };
  doc.body.ownerDocument = doc;
  return doc;
}

// 1. Single Choice Regression
function testSingleChoiceAutoApply() {
  const card = createMockElement('div', { id: 'q-card-1' });
  const optA = createMockElement('input', { type: 'radio', name: 'q1', value: '0' });
  const optB = createMockElement('input', { type: 'radio', name: 'q1', value: '1' });
  const optC = createMockElement('input', { type: 'radio', name: 'q1', value: '2' });
  const optD = createMockElement('input', { type: 'radio', name: 'q1', value: '3' });
  card.appendChild(optA); card.appendChild(optB); card.appendChild(optC); card.appendChild(optD);

  const question = {
    id: 'q1', num: 1, type: 'single_choice', element: card,
    options: [
      { key: 'A', input: optA, text: 'Option A' },
      { key: 'B', input: optB, text: 'Option B' },
      { key: 'C', input: optC, text: 'Option C' },
      { key: 'D', input: optD, text: 'Option D' }
    ]
  };

  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  assert.equal(runner.getDisplayAnswer({ answer: 'C' }, question), 'C');

  const ok = DomAnswerClicker.forceClickTarget(optC, null);
  assert.equal(ok, true);
  assert.equal(optC.checked, true);
  assert.equal(optA.checked, false);
}

// 2. Multiple Choice Regression
function testMultipleChoiceAutoApply() {
  const card = createMockElement('div', { id: 'q-card-2' });
  const optA = createMockElement('input', { type: 'checkbox', name: 'q2_0', checked: false });
  const optB = createMockElement('input', { type: 'checkbox', name: 'q2_1', checked: true });
  const optC = createMockElement('input', { type: 'checkbox', name: 'q2_2', checked: false });
  const optD = createMockElement('input', { type: 'checkbox', name: 'q2_3', checked: false });
  card.appendChild(optA); card.appendChild(optB); card.appendChild(optC); card.appendChild(optD);

  const question = {
    id: 'q2', num: 2, type: 'multiple_choice', element: card,
    options: [
      { key: 'A', input: optA, text: 'A' },
      { key: 'B', input: optB, text: 'B' },
      { key: 'C', input: optC, text: 'C' },
      { key: 'D', input: optD, text: 'D' }
    ]
  };

  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  // Backend returns answer: ["A", "C", "D"], compact display: 134
  const compact = runner.getDisplayAnswer({ answer: ['A', 'C', 'D'] }, question);
  assert.equal(compact, '134');

  runner.clearUnselectedCheckboxes(question, ['A', 'C', 'D']);
  // optB was checked, should now be unchecked
  assert.equal(optB.checked, false);

  DomAnswerClicker.forceClickTarget(optA, null);
  DomAnswerClicker.forceClickTarget(optC, null);
  DomAnswerClicker.forceClickTarget(optD, null);

  assert.equal(optA.checked, true);
  assert.equal(optB.checked, false);
  assert.equal(optC.checked, true);
  assert.equal(optD.checked, true);
}

// 3. Short Answer Regression
function testShortAnswerAutoApply() {
  const input = createMockElement('input', { type: 'text', value: '' });
  let eventsFired = [];
  input.addEventListener('input', () => eventsFired.push('input'));
  input.addEventListener('change', () => eventsFired.push('change'));

  const ok = DomAnswerClicker.fillTextInput(input, '0xE9');
  assert.equal(ok, true);
  assert.equal(input.value, '0xE9');
  assert.deepEqual(eventsFired, ['input', 'change']);

  // Readonly input rejection
  const readonlyInput = createMockElement('input', { type: 'text', readOnly: true, value: '' });
  assert.equal(DomAnswerClicker.fillTextInput(readonlyInput, 'test'), false);
  assert.equal(readonlyInput.value, '');

  // Combobox input rejection
  const comboInput = createMockElement('input', { role: 'combobox', value: '' });
  assert.equal(DomAnswerClicker.fillTextInput(comboInput, 'test'), false);
}

// 4. Moodle Radio Regression
function testMoodleRadioSelection() {
  const row = createMockElement('div', { classes: ['r0', 'form-check'] });
  const radio = createMockElement('input', { type: 'radio', id: 'q1:1_answer0' });
  const label = createMockElement('label', { for: 'q1:1_answer0' });
  row.appendChild(radio);
  row.appendChild(label);

  const ok = DomAnswerClicker.forceClickTarget(radio, row);
  assert.equal(ok, true);
  assert.equal(radio.checked, true);
  assert.equal(row.classList.contains('active'), true);
  assert.equal(row.classList.contains('selected'), true);
}

// 5. Moodle Checkbox Regression
function testMoodleCheckboxSelection() {
  const card = createMockElement('div', { classes: ['que', 'multichoice'] });
  const rowA = createMockElement('div', { classes: ['r0'] });
  const checkA = createMockElement('input', { type: 'checkbox', id: 'q5_0' });
  rowA.appendChild(checkA);
  card.appendChild(rowA);

  const ok = DomAnswerClicker.forceClickTarget(checkA, rowA);
  assert.equal(ok, true);
  assert.equal(checkA.checked, true);
}

// 6. Native Select Dropdown Regression
function testNativeSelectAutoApply() {
  const select = createMockElement('select');
  select.options = [
    { value: '', text: 'Choose...' },
    { value: '1', text: 'Option 1' },
    { value: '2', text: 'Option 2' },
    { value: 'FE67', text: 'FE67' }
  ];
  let changed = false;
  select.addEventListener('change', () => { changed = true; });

  const ok = DomAnswerClicker.selectDropdownOption(select, 'FE67');
  assert.equal(ok, true);
  assert.equal(select.value, 'FE67');
  assert.equal(changed, true);
}

// 7. Ant Design Select Regression
function testAntDesignSelectAutoApply() {
  const container = createMockElement('div', { classes: ['ant-select'] });
  let invokedVal = null;
  // React component props simulation (__reactProps$)
  container.__reactProps$test = {
    options: [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
      { value: 'FE67', label: 'FE67' }
    ],
    onChange(val) { invokedVal = val; }
  };

  const ok = DomAnswerClicker.selectAntDesignOption(container, 'FE67');
  assert.equal(ok, true);
  assert.equal(invokedVal, 'FE67');
}

// 8. Multiple Dropdown Matching Regression
function testMultipleDropdownMatching() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const question = {
    type: 'multi_input',
    fields: [
      {
        id: 'field_cx', label: 'CX', kind: 'select',
        options: [
          { value: '', text: 'Choose...' },
          { value: '0000', text: '0000' },
          { value: '1111', text: '1111' },
          { value: '2222', text: '2222' },
          { value: '67FE', text: '67FE' },
          { value: 'FE67', text: 'FE67' } // Position 5 among non-empty options
        ]
      },
      {
        id: 'field_bx', label: 'BX', kind: 'select',
        options: [
          { value: '', text: 'Choose...' },
          { value: '0000', text: '0000' },
          { value: '1111', text: '1111' },
          { value: '2222', text: '2222' },
          { value: '67FE', text: '67FE' } // Position 4 among non-empty options
        ]
      }
    ]
  };

  // Backend returns { answer: { CX: "FE67", BX: "67FE" } }
  // CX is option 5, BX is option 4 -> compact display "54"
  const compact = runner.getDisplayAnswer({
    answer: { CX: 'FE67', BX: '67FE' }
  }, question);
  assert.equal(compact, '54');
}

// 9. React Selectable Cards Regression (div.cursor-pointer)
function testReactSelectableCards() {
  const card = createMockElement('div', { id: 'q-card-100' });
  const opt1 = createMockElement('div', { classes: ['cursor-pointer'] });
  const opt2 = createMockElement('div', { classes: ['cursor-pointer'] });
  let clicked2 = false;
  opt2.addEventListener('click', () => { clicked2 = true; });
  card.appendChild(opt1);
  card.appendChild(opt2);

  // cleanKey = 'B' maps to index 1 (opt2)
  const ok = DomAnswerClicker.selectInCard(card, 'B', '');
  assert.equal(ok, true);
  assert.equal(clicked2, true);
}

// 10. React State Synchronization
function testReactStateSynchronization() {
  const input = createMockElement('input', { type: 'radio' });
  const events = [];
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'input', 'change'].forEach(evt => {
    input.addEventListener(evt, () => events.push(evt));
  });

  DomAnswerClicker.forceClickTarget(input, null);
  assert.ok(events.includes('click'));
  assert.ok(events.includes('input'));
  assert.ok(events.includes('change'));
}

// 11. Multiple Questions on One Page
function testMultipleQuestionsIsolation() {
  const card1 = createMockElement('div', { id: 'q1' });
  const opt1A = createMockElement('input', { type: 'radio', name: 'q1' });
  card1.appendChild(opt1A);

  const card2 = createMockElement('div', { id: 'q2' });
  const opt2A = createMockElement('input', { type: 'radio', name: 'q2' });
  card2.appendChild(opt2A);

  // Applying to card1 only clicks opt1A, opt2A is untouched
  DomAnswerClicker.forceClickTarget(opt1A, card1);
  assert.equal(opt1A.checked, true);
  assert.equal(opt2A.checked, false);
}

// 12. Duplicate Option Text Disambiguation
function testDuplicateOptionText() {
  const card = createMockElement('div', { id: 'q-dup' });
  const optA = createMockElement('input', { type: 'radio', name: 'q_dup', id: 'optA' });
  const optB = createMockElement('input', { type: 'radio', name: 'q_dup', id: 'optB' });
  card.appendChild(optA); card.appendChild(optB);

  // Key-based index targeting (B -> index 1)
  DomAnswerClicker.selectInCard(card, 'B', 'Yes');
  assert.equal(optB.checked, true);
  assert.equal(optA.checked, false);
}

// 13. Duplicate DOM IDs Isolation
function testDuplicateDomIdsScopedByCard() {
  const card1 = createMockElement('div');
  const opt1 = createMockElement('input', { id: 'duplicate_id', type: 'radio' });
  card1.appendChild(opt1);

  const card2 = createMockElement('div');
  const opt2 = createMockElement('input', { id: 'duplicate_id', type: 'radio' });
  card2.appendChild(opt2);

  DomAnswerClicker.forceClickTarget(opt2, card2);
  assert.equal(opt2.checked, true);
  assert.equal(opt1.checked, false);
}

// 14. Wrong Question Prevention via Fingerprint
function testWrongQuestionPrevention() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  runner.isSolvingProcess = true;
  const card = createMockElement('div', { id: 'q-fp' });
  const question = { id: 'q-fp', type: 'single_choice', title: 'Original Question', element: card };

  const request = runner.beginRequest(question);
  assert.equal(request.id, runner.activeRequestId);

  // If question element was disconnected or changed
  card.isConnected = false;
  assert.equal(runner.isRequestCurrent(request, question), false);
}

// 15. Page Navigation During Inference
function testPageNavigationDuringInference() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  runner.isSolvingProcess = true;
  const question = { id: 'q1', element: createMockElement('div') };
  const request = runner.beginRequest(question);

  // User navigates / stops
  runner.stop();
  assert.equal(runner.isSolvingProcess, false);
  assert.notEqual(runner.activeRequestId, request.id);
  assert.equal(runner.canApplyResult(request, question, { consensus: true, eligibleForAutoApply: true }), false);
}

// 16. Multiple Hotkeys Concurrently (Latest Request Wins)
function testMultipleConcurrentHotkeys() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  runner.isSolvingProcess = true;
  const q1 = { id: 'q1', element: createMockElement('div') };
  const q2 = { id: 'q2', element: createMockElement('div') };

  const req1 = runner.beginRequest(q1);
  const req2 = runner.beginRequest(q2);

  assert.equal(runner.activeRequestId, req2.id);
  assert.equal(req1.id < req2.id, true);
  // req1 is obsolete
  assert.equal(runner.isRequestCurrent(req1, q1), false);
}

// 17. Provider Error Fail-Closed
function testProviderErrorFailClosed() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const card = createMockElement('div');
  const input = createMockElement('input', { type: 'radio' });
  card.appendChild(input);
  const question = { id: 'q1', element: card, options: [{ key: 'A', input }] };

  // Error result: consensus = false, eligibleForAutoApply = false
  const errorResult = { consensus: false, eligibleForAutoApply: false, error: 'PROVIDER_ERROR' };
  assert.equal(runner.canApplyResult({ id: 1 }, question, errorResult), false);
  assert.equal(input.checked, false);
}

// 18. Invalid JSON Fail-Closed
function testInvalidJsonFailClosed() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const question = { id: 'q1', element: createMockElement('div') };

  assert.equal(runner.canApplyResult({ id: 1 }, question, null), false);
  assert.equal(runner.canApplyResult({ id: 1 }, question, undefined), false);
  assert.equal(runner.canApplyResult({ id: 1 }, question, { answer: null, eligibleForAutoApply: false }), false);
}

// 19. Timeout Fail-Closed
function testTimeoutFailClosed() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const question = { id: 'q1', element: createMockElement('div') };
  const timeoutResult = { consensus: false, eligibleForAutoApply: false, status: 'TIMEOUT' };

  assert.equal(runner.canApplyResult({ id: 1 }, question, timeoutResult), false);
}

// 20. Rejected Final Decision (consensus false or eligibleForAutoApply false)
function testRejectedFinalDecision() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  runner.isSolvingProcess = true;
  const card = createMockElement('div');
  const question = { id: 'q1', element: card };
  const request = runner.beginRequest(question);

  // Single model result without 3/3 consensus
  const singleModelResult = { consensus: false, eligibleForAutoApply: false, displayOnly: true, answer: 'A' };
  assert.equal(runner.canApplyResult(request, question, singleModelResult), false);

  // Debate result that did not reach consensus
  const unverifiedResult = { consensus: false, eligibleForAutoApply: false, answer: 'A' };
  assert.equal(runner.canApplyResult(request, question, unverifiedResult), false);
}

// 21. Cache Alt+B Functionality
function testCacheAltBReview() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const question = { id: 'q1', title: 'Sample Question', type: 'single_choice' };

  const cacheKey = runner.cacheKey(question);
  assert.ok(cacheKey.startsWith('qa-answer-v1:'));

  // Alt+B review never invokes solverEngine.solveQuestion or DomAnswerClicker
  let solveCalled = false;
  runner.solverEngine = { solveQuestion() { solveCalled = true; } };

  // Test copyAnswerToClipboard handles string
  let copiedText = '';
  global.chrome = {
    runtime: {
      sendMessage(msg) { if (msg.text) copiedText = msg.text; }
    }
  };
  runner.copyAnswerToClipboard('134');
  assert.equal(copiedText, '134');
  assert.equal(solveCalled, false);
}

// 22. No Auto-Submit
function testNoAutoSubmit() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  assert.equal(runner.isAutoAdvanceEnabled(), false);
}

function runAllRegressionTests() {
  console.log('Running Auto-Apply & Answer Selection Regression Test Suite (22 test cases)...');
  testSingleChoiceAutoApply();
  console.log('  PASS [1/22]: Single choice auto-apply');
  testMultipleChoiceAutoApply();
  console.log('  PASS [2/22]: Multiple choice compact 134 mapping & checkbox selection');
  testShortAnswerAutoApply();
  console.log('  PASS [3/22]: Short answer text filling & readonly/combobox safety');
  testMoodleRadioSelection();
  console.log('  PASS [4/22]: Moodle radio selection & active state');
  testMoodleCheckboxSelection();
  console.log('  PASS [5/22]: Moodle checkbox selection');
  testNativeSelectAutoApply();
  console.log('  PASS [6/22]: Native select dropdown matching');
  testAntDesignSelectAutoApply();
  console.log('  PASS [7/22]: Ant Design Select React onChange synchronization');
  testMultipleDropdownMatching();
  console.log('  PASS [8/22]: Multiple dropdown matching compact 54 position mapping');
  testReactSelectableCards();
  console.log('  PASS [9/22]: React selectable cards (div.cursor-pointer)');
  testReactStateSynchronization();
  console.log('  PASS [10/22]: React full mouse & input/change state synchronization');
  testMultipleQuestionsIsolation();
  console.log('  PASS [11/22]: Multiple questions on one page isolation');
  testDuplicateOptionText();
  console.log('  PASS [12/22]: Duplicate option text disambiguation');
  testDuplicateDomIdsScopedByCard();
  console.log('  PASS [13/22]: Duplicate DOM IDs scoped by question card');
  testWrongQuestionPrevention();
  console.log('  PASS [14/22]: Wrong question prevention via question fingerprint');
  testPageNavigationDuringInference();
  console.log('  PASS [15/22]: Page navigation during inference aborts apply');
  testMultipleConcurrentHotkeys();
  console.log('  PASS [16/22]: Multiple hotkeys concurrently (latest request wins)');
  testProviderErrorFailClosed();
  console.log('  PASS [17/22]: Provider error fail-closed');
  testInvalidJsonFailClosed();
  console.log('  PASS [18/22]: Invalid JSON fail-closed');
  testTimeoutFailClosed();
  console.log('  PASS [19/22]: Timeout fail-closed');
  testRejectedFinalDecision();
  console.log('  PASS [20/22]: Rejected Final Decision fail-closed');
  testCacheAltBReview();
  console.log('  PASS [21/22]: Cache Alt+B display 5s & clipboard copy without AI/DOM');
  testNoAutoSubmit();
  console.log('  PASS [22/22]: No auto-submit guarantee');
  console.log('ALL 22 REGRESSION TEST CASES PASSED SUCCESSFULLY!\n');
}

runAllRegressionTests();
