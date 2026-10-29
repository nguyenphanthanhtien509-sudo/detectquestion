'use strict';

const assert = require('assert');
const { AdaptiveDebateApiClient } = require('../src/content/solver/AdaptiveDebateApiClient');
const { ContinuousSolveRunner } = require('../src/content/solver/ContinuousSolveRunner');
const { TextUtils } = require('../src/content/core/TextUtils');
const { MessageActions } = require('../src/shared/MessageActions');
const { DomAnswerClicker } = require('../src/content/clicker/DomAnswerClicker');
const { AdaptiveDebateOrchestrator } = require('../orchestrator/lib/orchestrator');
const { validateSolveRequest } = require('../orchestrator/lib/contracts');
const fs = require('fs');
const path = require('path');

function testBackendClientContract() {
  const client = new AdaptiveDebateApiClient({ endpoint: 'http://127.0.0.1:8787', token: 'test', fetch: async () => ({}) });
  const question = { type: 'dropdown_select', title: 'MOV values', selects: [{ id: 'CX', label: 'CX =', options: [{ value: 'FE67', text: 'FE67' }] }] };
  assert.deepEqual(client.toContractQuestion(question), { ...question, passage: undefined, imageUrl: undefined });
  const captured = client.toContractQuestion({ type: 'single_choice', title: 'Read the selected image', image: 'data:image/jpeg;base64,AA==', options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }] });
  assert.equal(captured.type, 'single_choice');
  assert.equal(captured.imageUrl, 'data:image/jpeg;base64,AA==');
  const mapped = client.toLegacyResult({ status: 'CONSENSUS_UNVERIFIED', questionType: 'dropdown_select', answer: { CX: 'FE67' }, provenance: [], finalDecision: { eligibleForAutoApply: false, requiresManualReview: true } });
  assert.equal(mapped.consensus, true);
  assert.deepEqual(mapped.dropdownAnswers, { CX: 'FE67' });
  assert.equal(mapped.eligibleForAutoApply, false);
  assert.equal(mapped.requiresManualReview, true);
  assert.equal(typeof client.solveQuestion, 'function');
  const emergency = client.toLegacyResult({ status: 'SINGLE_MODEL_UNVERIFIED', questionType: 'single_choice', answer: 'B', provenance: [], finalDecision: { eligibleForAutoApply: false, requiresManualReview: true } });
  assert.equal(emergency.consensus, false);
  assert.equal(emergency.displayOnly, true);
  assert.equal(emergency.answer, 'B');
  assert.equal(typeof client.solveSingleModel, 'function');
}

async function testLocalImageIsSentAsStructuredBytes() {
  const client = new AdaptiveDebateApiClient({ endpoint: 'http://127.0.0.1:8787', token: 'test', fetch: async () => { throw new Error('A data URL must not be fetched.'); } });
  const question = await client.toTransportQuestion({
    type: 'multiple_choice', title: 'Read the diagram', image: 'data:image/png;base64,QUJD',
    options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }]
  });
  assert.deepEqual(question.image, { mimeType: 'image/png', data: 'QUJD' });
  assert.equal(question.imageUrl, undefined);
}

function testBackendAcceptsInlineImageAndRejectsLoopbackUrl() {
  const request = validateSolveRequest({
    schemaVersion: 1, requestId: 'inline-image-contract', mode: 'single_model',
    question: {
      type: 'multiple_choice', title: 'Read the diagram',
      image: { mimeType: 'image/png', data: 'QUJD' },
      options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }]
    }
  });
  assert.equal(request.question.imageUrl, 'data:image/png;base64,QUJD');
  assert.throws(() => validateSolveRequest({
    schemaVersion: 1, requestId: 'loopback-image-contract', mode: 'single_model',
    question: { type: 'single_choice', title: 'Read the diagram', imageUrl: 'http://127.0.0.1:5500/a.png', options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }] }
  }), /localhost/);
}

function testMixedTextAndSelectQuestionContract() {
  const request = validateSolveRequest({
    schemaVersion: 1, requestId: 'mixed-input-contract', mode: 'single_model',
    question: {
      type: 'multi_input', title: 'What is average access time?',
      fields: [
        { id: 'q53_answer', label: 'Answer', kind: 'text' },
        { id: 'q53_unit', label: 'Unit', kind: 'select', options: [{ value: 'ms', text: 'ms' }, { value: 's', text: 's' }] }
      ]
    }
  });
  assert.deepEqual(request.question.fields.map(field => field.id), ['q53_answer', 'q53_unit']);
  assert.deepEqual(require('../orchestrator/lib/contracts').normalizeAnswer(request.question, { answer: { q53_answer: '18.53', q53_unit: 'ms' } }), { answer: { q53_answer: '18.53', q53_unit: 'ms' } });
  assert.equal(require('../orchestrator/lib/contracts').normalizeAnswer(request.question, { answer: { q53_answer: '18.53', q53_unit: 'minutes' } }), null);
}

function testNoDirectProviderActionOrLegacyFeatureFlag() {
  assert.equal(MessageActions.CALL_KEY4U_AI, undefined);
  assert.equal(MessageActions.CALL_ADAPTIVE_DEBATE, 'CALL_ADAPTIVE_DEBATE');
  assert.equal(MessageActions.REQUEST_TOP_FRAME_SINGLE_SOLVE, 'REQUEST_TOP_FRAME_SINGLE_SOLVE');
  assert.equal(MessageActions.TRIGGER_SINGLE_MODEL_SOLVE, 'TRIGGER_SINGLE_MODEL_SOLVE');
  assert.equal(MessageActions.WRITE_ANSWER_CLIPBOARD, 'WRITE_ANSWER_CLIPBOARD');
  assert.equal(MessageActions.WRITE_ANSWER_CLIPBOARD_OFFSCREEN, 'WRITE_ANSWER_CLIPBOARD_OFFSCREEN');
  const config = require('../src/config/runtime-config').APP_CONFIG;
  assert.equal(config.ADAPTIVE_DEBATE_ENABLED, undefined);
}

function testCapturedImageUsesMultimodalMessageContent() {
  const orchestrator = new AdaptiveDebateOrchestrator({ provider: { complete: async () => ({}) }, models: ['gemini-a', 'gemini-b', 'gemini-c'] });
  const messages = orchestrator.initialMessages({ type: 'single_choice', title: 'Read image', imageUrl: 'data:image/jpeg;base64,AA==', options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }] });
  assert.equal(Array.isArray(messages[1].content), true);
  assert.equal(messages[1].content[1].type, 'image_url');
  assert.equal(messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AA==');
}

function testQuestionFingerprintStillIncludesTypedInput() {
  const base = { type: 'single_choice', title: 'Question', options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }] };
  assert.notEqual(TextUtils.hashQuestion(base), TextUtils.hashQuestion({ ...base, type: 'multiple_choice' }));
  assert.notEqual(TextUtils.hashQuestion(base), TextUtils.hashQuestion({ ...base, options: [{ key: 'A', text: 'Other' }, { key: 'B', text: 'Two' }] }));
}

function testMoodleCurrentPageWinsOverVisibilityFallback() {
  const originalDocument = global.document;
  const q1 = { id: 'q1' };
  const q2 = { id: 'q2' };
  global.document = {
    querySelector: selector => selector.includes('.que.current-page') ? q2 : null
  };
  try {
    const runner = new ContinuousSolveRunner({ solverEngine: {} });
    const active = runner.findActiveQuestion([
      { id: 'qa-detected-moodle-1', num: 1, element: q1 },
      { id: 'qa-detected-moodle-2', num: 2, element: q2 }
    ]);
    assert.equal(active.num, 2);
  } finally {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  }
}

function testRunnerRespectsFinalAutoApplyEligibility() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  runner.isRequestCurrent = () => true;
  const request = { id: 1 };
  const question = { id: 'q1', element: {} };
  assert.equal(runner.canApplyResult(request, question, { consensus: true, eligibleForAutoApply: false }), false);
  assert.equal(runner.canApplyResult(request, question, { consensus: true, eligibleForAutoApply: true }), true);
  assert.equal(runner.canApplyResult(request, question, { consensus: false, eligibleForAutoApply: true }), false);
  assert.equal(runner.canSuggestResult(request, question, { consensus: true, eligibleForAutoApply: false }), true);
  assert.equal(runner.canSuggestResult(request, question, { consensus: false, eligibleForAutoApply: true }), false);
}

function testNativeClickerSynchronizesASelectedControl() {
  const input = {
    tagName: 'INPUT', type: 'radio', checked: false, disabled: false,
    getAttribute: () => null,
    click() { this.checked = true; }
  };
  assert.equal(DomAnswerClicker.MANUAL_REVIEW_MODE, false);
  assert.equal(DomAnswerClicker.forceClickTarget(input, null), true);
  assert.equal(input.checked, true);
}

function testVerifiedSingleAnswerReachesItsScannedOption() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'solver', 'ContinuousSolveRunner.js'), 'utf8');
  const singleSolve = source.slice(source.indexOf('async solveSingle'), source.indexOf('async solveSingleModel'));
  assert.match(singleSolve, /this\.canApplyResult\(request, targetQ, result\)/);
  assert.match(singleSolve, /DomAnswerClicker\.forceClickTarget\(opt\.input, opt\.label \|\| opt\.element\)/);
}

function testDropdownDisplayUsesOneBasedChoicePositions() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const question = {
    type: 'dropdown_select',
    selects: [
      { id: 'CX', options: [{ value: '', text: 'Chooseâ€¦' }, { value: '0000', text: '0000' }, { value: '002F', text: '002F' }, { value: '0030', text: '0030' }, { value: 'FF00', text: 'FF00' }] },
      { id: 'AX', options: [{ value: '', text: 'Chooseâ€¦' }, { value: '0000', text: '0000' }, { value: '002F', text: '002F' }] },
      { id: 'DX', options: [{ value: '', text: 'Chooseâ€¦' }, { value: '0000', text: '0000' }] }
    ]
  };
  assert.equal(runner.getDisplayAnswer({ dropdownAnswers: { CX: 'FF00', AX: '002F', DX: '0000' } }, question), '421');
}

function testMultipleChoiceDisplayUsesOneBasedChoicePositions() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const question = { type: 'multiple_choice', options: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }, { key: 'E' }] };
  assert.equal(runner.getDisplayAnswer({ answers: ['A', 'B', 'D'] }, question), '124');
}

function testAutoAdvanceIsDisabledForDisplayOnlyMode() {
  const runner = new ContinuousSolveRunner({ solverEngine: {}, isAutoAdvanceEnabled: () => true });
  assert.equal(runner.isAutoAdvanceEnabled(), false);
}

function testConsensusChoiceCanBeMarkedWithoutAutoApply() {
  const originalClicker = global.DomAnswerClicker;
  const calls = [];
  global.DomAnswerClicker = {
    clearSuggestedMarkers: element => calls.push(['clear', element]),
    markSuggestedAnswer: (_input, element) => { calls.push(['mark', element]); return true; }
  };
  try {
    const runner = new ContinuousSolveRunner({ solverEngine: {} });
    const button = {};
    assert.equal(runner.markChoiceSuggestion({ element: {}, options: [{ key: 'A', input: null, label: button }] }, { answer: 'A' }), true);
    assert.deepEqual(calls, [['clear', {}], ['mark', button]]);
  } finally {
    if (originalClicker === undefined) delete global.DomAnswerClicker; else global.DomAnswerClicker = originalClicker;
  }
}

function testVerifiedChoiceAlsoReachesMarkerPath() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'solver', 'ContinuousSolveRunner.js'), 'utf8');
  const singleSolve = source.slice(source.indexOf('async solveSingle'), source.indexOf('async solveCapturedImage'));
  assert.equal(singleSolve.includes('this.markChoiceSuggestion(targetQ, result);'), true);
}

function testCaptureTargetMapsToItsOwnQuestionCard() {
  const runner = new ContinuousSolveRunner({ solverEngine: {} });
  const child = {};
  const firstCard = { contains: target => target === child };
  const secondCard = { contains: () => false };
  const questions = [
    { id: 'first', element: firstCard },
    { id: 'second', element: secondCard }
  ];
  assert.equal(runner.findQuestionForCaptureTarget(questions, child).id, 'first');
  assert.equal(runner.findQuestionForCaptureTarget(questions, {}), null);
}

async function testCapturedSingleModelRetainsImageAndTargetSchema() {
  const originalScanner = global.ExamDomScanner;
  const originalToast = global.StealthToastNotifier;
  const card = { isConnected: true, contains: target => target === child };
  const child = {};
  const question = { id: 'q-crop', num: 7, type: 'short_answer', title: 'Read the diagram', element: card, input: {} };
  let received = null;
  global.ExamDomScanner = { scanAll: () => [question] };
  global.StealthToastNotifier = { show: () => {}, showAnswer: () => {} };
  try {
    const runner = new ContinuousSolveRunner({ solverEngine: { solveSingleModel: async payload => {
      received = payload;
      return { displayOnly: true, answer: '42' };
    } } });
    runner.getQuestionFingerprint = () => 'stable';
    await runner.solveCapturedImageSingleModel('data:image/png;base64,QUJD', child);
    assert.equal(received.id, 'q-crop');
    assert.equal(received.image, 'data:image/png;base64,QUJD');
    assert.equal(received.type, 'short_answer');
  } finally {
    if (originalScanner === undefined) delete global.ExamDomScanner; else global.ExamDomScanner = originalScanner;
    if (originalToast === undefined) delete global.StealthToastNotifier; else global.StealthToastNotifier = originalToast;
  }
}

function testAltUIsRegisteredAsCaptureSingleModelShortcut() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'controller', 'HotKeyManager.js'), 'utf8');
  assert.match(source, /isCaptureSingleModelKey/);
  assert.match(source, /KeyU/);
  assert.match(source, /onCaptureSingleModelSolve/);
}

async function testCapturedImageFallsBackToStandaloneVision() {
  const originalScanner = global.ExamDomScanner;
  const originalToast = global.StealthToastNotifier;
  global.ExamDomScanner = { scanAll: () => [] };
  global.StealthToastNotifier = { show: () => {}, showAnswer: () => {} };
  let received = null;
  try {
    const runner = new ContinuousSolveRunner({ solverEngine: { solveQuestion: async question => { received = question; return { consensus: true, eligibleForAutoApply: true, answer: 'B' }; } } });
    await runner.solveCapturedImage('data:image/jpeg;base64,AA==');
    assert.equal(received.type, 'image');
    assert.equal(received.image, 'data:image/jpeg;base64,AA==');
  } finally {
    if (originalScanner === undefined) delete global.ExamDomScanner; else global.ExamDomScanner = originalScanner;
    if (originalToast === undefined) delete global.StealthToastNotifier; else global.StealthToastNotifier = originalToast;
  }
}

async function testStandaloneCaptureShowsUnverifiedConsensusAsSuggestion() {
  const originalScanner = global.ExamDomScanner;
  const originalToast = global.StealthToastNotifier;
  const shown = [];
  global.ExamDomScanner = { scanAll: () => [] };
  global.StealthToastNotifier = { show: message => shown.push(message), showAnswer: message => shown.push(message) };
  try {
    const runner = new ContinuousSolveRunner({ solverEngine: { solveQuestion: async () => ({ consensus: true, eligibleForAutoApply: false, answer: 'B' }) } });
    await runner.solveCapturedImage('data:image/jpeg;base64,AA==');
    if (shown.includes('B')) return;
    assert.equal(shown.some(message => String(message).includes('Gợi ý từ ảnh') && String(message).includes('B')), true);
  } finally {
    if (originalScanner === undefined) delete global.ExamDomScanner; else global.ExamDomScanner = originalScanner;
    if (originalToast === undefined) delete global.StealthToastNotifier; else global.StealthToastNotifier = originalToast;
  }
}

function testCapturedChoiceNeverTouchesPageControls() {
  const originalClicker = global.DomAnswerClicker;
  const calls = [];
  global.DomAnswerClicker = {
    clearSuggestedMarkers: target => calls.push(['clear', target]),
    selectInCard: (target, key) => { calls.push(['mark', target, key]); return true; }
  };
  try {
    const runner = new ContinuousSolveRunner({ solverEngine: {} });
    const card = {};
    assert.equal(runner.markCapturedSuggestion('b', card), false);
    assert.deepEqual(calls, []);
    assert.equal(runner.markCapturedSuggestion('long text', card), false);
  } finally {
    if (originalClicker === undefined) delete global.DomAnswerClicker; else global.DomAnswerClicker = originalClicker;
  }
}

function testBuildDoesNotUseFragileRuntimeStringDecoder() {
  const buildSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'build_dist.js'), 'utf8');
  assert.match(buildSource, /stringArrayEncoding:\s*\[\]/);
}

testBackendClientContract();
testLocalImageIsSentAsStructuredBytes().catch(error => { console.error(error); process.exit(1); });
testBackendAcceptsInlineImageAndRejectsLoopbackUrl();
testMixedTextAndSelectQuestionContract();
testNoDirectProviderActionOrLegacyFeatureFlag();
testCapturedImageUsesMultimodalMessageContent();
testQuestionFingerprintStillIncludesTypedInput();
testMoodleCurrentPageWinsOverVisibilityFallback();
testRunnerRespectsFinalAutoApplyEligibility();
testNativeClickerSynchronizesASelectedControl();
testVerifiedSingleAnswerReachesItsScannedOption();
testDropdownDisplayUsesOneBasedChoicePositions();
testMultipleChoiceDisplayUsesOneBasedChoicePositions();
testAutoAdvanceIsDisabledForDisplayOnlyMode();
testConsensusChoiceCanBeMarkedWithoutAutoApply();
testVerifiedChoiceAlsoReachesMarkerPath();
testCaptureTargetMapsToItsOwnQuestionCard();
testCapturedSingleModelRetainsImageAndTargetSchema().catch(error => { console.error(error); process.exit(1); });
testAltUIsRegisteredAsCaptureSingleModelShortcut();
testCapturedImageFallsBackToStandaloneVision().catch(error => { console.error(error); process.exit(1); });
testStandaloneCaptureShowsUnverifiedConsensusAsSuggestion().catch(error => { console.error(error); process.exit(1); });
testCapturedChoiceNeverTouchesPageControls();
testBuildDoesNotUseFragileRuntimeStringDecoder();
console.log('production-hardening tests passed');
