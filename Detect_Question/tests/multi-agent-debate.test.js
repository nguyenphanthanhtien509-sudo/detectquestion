'use strict';

const assert = require('assert');
const http = require('http');
const { AdaptiveDebateOrchestrator, STATES } = require('../orchestrator/lib/orchestrator');
const { BACKWARD_GEMINI_MODELS, DEFAULT_BACKUP_POOLS, ModelHealthTracker } = require('../orchestrator/lib/fallback');
const { createServer, projectPipelineEvent } = require('../orchestrator/server');
const { canonicalAnswer, normalizeAnswer, parseBackwardOutputDetailed, parseCriticOutputDetailed, parseInitialOutputDetailed } = require('../orchestrator/lib/contracts');
const { verify, buildClearMask, buildClearMaskByArray } = require('../orchestrator/lib/verification');

const question = {
  type: 'single_choice', title: 'Which option is correct?',
  options: [{ key: 'A', text: 'Alpha' }, { key: 'B', text: 'Beta' }, { key: 'C', text: 'Gamma' }]
};

function initial(answer, evidence = 'Which option is correct?') {
  return JSON.stringify({ questionType: 'single_choice', answer, evidence: [{ claim: 'Selection', support: evidence }], uncertainty: [], needsVerification: false });
}
function critic(answer, ids = ['candidate_1', 'candidate_2', 'candidate_3'], changed = false) {
  return JSON.stringify({ critiques: ids.map(candidateId => ({ candidateId, assessment: 'supported', issue: null, evidence: 'No contradiction found.' })), revisedAnswer: answer, changedAnswer: changed, changeReason: changed ? 'Evidence supports the revision.' : null, remainingUncertainty: [] });
}
function judge() {
  return JSON.stringify({ assessment: 'INSUFFICIENT_EVIDENCE', supportedCandidate: null, criticalIssues: [], verifiedEvidence: [], unresolvedConflicts: ['Independent models still disagree.'], recommendedStatus: 'UNRESOLVED' });
}
function backward(candidateAnswer, status = 'MATCHED', overrides = {}) {
  const violations = status === 'CONTRADICTION_FOUND'
    ? [{ requirement: 'The candidate must satisfy the stated requirement.', observedConsequence: 'The candidate does not satisfy it.', reason: 'Concrete mocked contradiction.' }]
    : [];
  return JSON.stringify({
    candidateAnswer, backwardStatus: status, reconstructedConsequences: ['Mocked consequence.'], satisfiedRequirements: status === 'CONTRADICTION_FOUND' ? [] : ['Mocked checked requirement.'],
    violatedRequirements: violations, missingAssumptions: [], counterexamples: [], uncheckedRequirements: status === 'INCONCLUSIVE' ? ['A required condition cannot be established from the supplied question.'] : [], suggestedReevaluation: status === 'CONTRADICTION_FOUND', explanation: 'Mocked backward review.', ...overrides
  });
}
function backwardFromMessages(messages, status = 'MATCHED', overrides = {}) {
  const payload = JSON.parse(messages[1]?.content?.split('\n')[0] || '{}');
  return backward(payload.candidateAnswer, status, overrides);
}

const assemblyQuestion = {
  type: 'short_answer',
  title: 'EAX register contains a 32-bit IP address. The network ID (netID) is 20 bit and must be extracted using AND. Immediate value must be hexadecimal.'
};

function initialShort(answer, evidence = 'Deterministic mask calculation.') {
  return JSON.stringify({ questionType: 'short_answer', answer, evidence: [{ claim: 'Instruction', support: evidence }], uncertainty: [], needsVerification: false });
}

class FakeProvider {
  constructor(rounds) { this.rounds = rounds; this.calls = 0; this.solverCalls = 0; }
  async complete({ model, signal, messages }) {
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
    if (messages?.[0]?.content?.includes('adversarial backward-reasoning verifier')) {
      this.calls += 1;
      return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: `req-${this.calls}`, usage: { total_tokens: 2 } };
    }
    const round = this.rounds[Math.floor(this.solverCalls / 3)] || [];
    const entry = round[this.solverCalls % 3];
    this.solverCalls += 1;
    this.calls += 1;
    if (entry instanceof Error) throw entry;
    return { content: entry ?? judge(), actualModel: model, providerRequestId: `req-${this.calls}`, usage: { total_tokens: 3 } };
  }
}

function makeEngine(rounds, options = {}) {
  const noFallbackPools = { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] };
  return new AdaptiveDebateOrchestrator({ provider: new FakeProvider(rounds), models: ['model-a', 'model-b', 'model-c'], fallbackPools: noFallbackPools, ...options });
}

async function testInitialConsensusIsNotOverclaimed() {
  const result = await makeEngine([[initial('A'), initial('A'), initial('A')]]).solve({ schemaVersion: 1, requestId: 'initial-consensus', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.answer, 'A');
  assert.equal(result.verification.independentVerification, false);
  assert.equal(result.metrics.initialCalls, 3);
}

async function testEmergencySingleModelUsesExactlyOneForwardModel() {
  const engine = makeEngine([[initial('B')]]);
  const result = await engine.solveSingleModel({ schemaVersion: 1, requestId: 'single-model', mode: 'single_model', question });
  assert.equal(result.status, 'SINGLE_MODEL_UNVERIFIED');
  assert.equal(result.answer, 'B');
  assert.equal(result.finalDecision.eligibleForAutoApply, false);
  assert.equal(result.finalDecision.consensusReached, false);
  assert.equal(result.metrics.logicalInferenceCalls, 1);
  assert.equal(result.provenance.length, 1);
  assert.equal(result.provenance[0].requestedModel, 'model-a');
}

async function testSingleModelBoundedSchemaRepair() {
  const malformed = JSON.parse(initial('B'));
  delete malformed.uncertainty;
  const invalid = JSON.stringify(malformed);
  for (const scenario of ['repaired', 'still-invalid', 'network-error', 'disabled', 'cancelled', 'deadline']) {
    let calls = 0;
    const controller = new AbortController();
    const events = [];
    const now = Date.now;
    let offset = 0;
    const provider = { async complete({ model, messages }) {
      calls += 1;
      if (scenario === 'network-error') throw Object.assign(new Error('HTTPS failed'), { code: 'HTTPS_FAILED' });
      if (calls === 1 && scenario === 'cancelled') controller.abort();
      if (calls === 1 && scenario === 'deadline') offset = 120001;
      if (calls === 2) {
        assert.ok(messages[1].content.includes('previousResponse'));
        assert.ok(messages[1].content.includes('INITIAL_UNCERTAINTY_REQUIRED'));
      }
      return { actualModel: model, content: calls === 2 && scenario === 'repaired' ? initial('B') : invalid };
    } };
    const engine = makeEngine([], { provider, maxSchemaRepairAttempts: scenario === 'disabled' ? 0 : 2 });
    try {
      if (scenario === 'deadline') Date.now = () => now() + offset;
      const result = await engine.solveSingleModel({ requestId: `repair-${scenario}`, question }, controller.signal, event => events.push(event));
      const shouldRepair = ['repaired', 'still-invalid'].includes(scenario);
      assert.equal(calls, shouldRepair ? 2 : 1, scenario);
      assert.equal(result.metrics.schemaRepairCalls, shouldRepair ? 1 : 0, scenario);
      assert.equal(result.metrics.logicalInferenceCalls, calls);
      assert.equal(result.provenance.length, calls);
      assert.ok(result.provenance.every(item => item.requestedModel === 'model-a'));
      assert.equal(result.finalDecision.eligibleForAutoApply, false);
      if (scenario === 'repaired') {
        assert.equal(result.status, 'SINGLE_MODEL_UNVERIFIED');
        assert.equal(result.answer, 'B');
        assert.equal(result.metrics.schemaRepairSuccesses, 1);
        assert.equal(result.metrics.invalidResponses, 1);
        assert.equal(result.provenance[0].validationError.code, 'INITIAL_UNCERTAINTY_REQUIRED');
        assert.equal(result.provenance[1].validationStatus, 'valid');
      } else {
        assert.equal(result.answer, null);
        if (scenario === 'still-invalid') {
          assert.equal(result.status, STATES.INVALID_RESPONSE);
          assert.equal(result.metrics.schemaRepairFailures, 1);
          assert.equal(result.metrics.invalidResponses, 2);
        }
      }
      assert.equal(events.some(event => event.type === 'single_model_schema_repair_completed'), shouldRepair);
    } finally { Date.now = now; }
  }
}

async function testCrossExaminationRunsInParallelRound() {
  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    [critic('A', undefined, false), critic('A', undefined, true), critic('A', undefined, true)]
  ]).solve({ schemaVersion: 1, requestId: 'debate-converges', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.answer, 'A');
  assert.equal(result.metrics.debateCalls, 3);
}

async function testNoTwoOfThreeAcceptanceAfterTimeout() {
  const timeout = Object.assign(new Error('timeout'), { code: 'MODEL_TIMEOUT' });
  const result = await makeEngine([[initial('A'), initial('A'), timeout]]).solve({ schemaVersion: 1, requestId: 'timeout', question });
  assert.equal(result.status, STATES.MODEL_TIMEOUT);
  assert.equal(result.answer, null);
}

async function testMalformedCriticIsInvalidNotConsensus() {
  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    ['{}', '{}', '{}'],
    [judge(), judge(), judge()]
  ]).solve({ schemaVersion: 1, requestId: 'bad-critic', question });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.answer, null);
}

async function testMissingModelMetadataFailsClosed() {
  const provider = { complete: async ({ model }) => ({ content: initial('A'), actualModel: null, providerRequestId: null, usage: null, model }) };
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'metadata', question });
  assert.equal(result.status, STATES.PROVIDER_ERROR);
}

async function testAssemblyCanonicalizationAndNoFalseDebate() {
  const nasm = { answer: 'AND EAX, 0xFFFFF000' };
  const masm = { answer: ' and   eax, 0FFFFF000h ' };
  assert.equal(canonicalAnswer(nasm, assemblyQuestion), canonicalAnswer(masm, assemblyQuestion));
  assert.notEqual(canonicalAnswer(nasm, assemblyQuestion), canonicalAnswer({ answer: 'OR EAX, 0xFFFFF000' }, assemblyQuestion));
  assert.notEqual(canonicalAnswer(nasm, assemblyQuestion), canonicalAnswer({ answer: 'AND EBX, 0xFFFFF000' }, assemblyQuestion));
  assert.notEqual(canonicalAnswer(nasm, assemblyQuestion), canonicalAnswer({ answer: 'AND EAX, 0xFFFFFF00' }, assemblyQuestion));
  assert.equal(canonicalAnswer(nasm, { type: 'short_answer', title: 'Describe an AND operation in prose.' }), 'text:AND EAX, 0xFFFFF000');

  const result = await makeEngine([[initialShort('AND EAX, 0xFFFFF000'), initialShort('AND EAX, 0FFFFF000h'), initialShort('and eax, 0xfffff000')]])
    .solve({ schemaVersion: 1, requestId: 'assembly-consensus', question: assemblyQuestion });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.initialCalls, 3);
  assert.equal(result.metrics.debateCalls, 0);
  assert.equal(result.metrics.judgeCalls, 0);
  assert.equal(result.attempts.length, 4);
}

async function testTypeAwareSemanticNormalization() {
  const choiceQuestion = { type: 'single_choice', title: 'Pick a letter.', options: [{ key: 'A', text: 'A' }, { key: 'C', text: 'C' }] };
  assert.equal(canonicalAnswer(normalizeAnswer(choiceQuestion, { answer: 'C' }), choiceQuestion), canonicalAnswer(normalizeAnswer(choiceQuestion, { answer: 'c' }), choiceQuestion));

  const booleanQuestion = { type: 'true_false_group', title: 'Mark truth.', items: [{ key: 'one', text: 'One' }] };
  assert.deepEqual(normalizeAnswer(booleanQuestion, { answer: { one: 'đúng' } }), { answer: { one: true } });
  assert.deepEqual(normalizeAnswer(booleanQuestion, { answer: { one: 'false' } }), { answer: { one: false } });

  const hexQuestion = { type: 'short_answer', title: 'Write the hexadecimal value.' };
  assert.equal(canonicalAnswer({ answer: 'FE67' }, hexQuestion), canonicalAnswer({ answer: 'fe67' }, hexQuestion));
  const freeTextQuestion = { type: 'short_answer', title: 'Repeat the exact case-sensitive text.' };
  assert.notEqual(canonicalAnswer({ answer: 'FE67' }, freeTextQuestion), canonicalAnswer({ answer: 'fe67' }, freeTextQuestion));
  assert.notEqual(canonicalAnswer({ answer: 'Hello' }, freeTextQuestion), canonicalAnswer({ answer: 'hello' }, freeTextQuestion));
  assert.notEqual(canonicalAnswer({ answer: 'myVariable' }, { type: 'short_answer', title: 'Write the Java identifier exactly.' }), canonicalAnswer({ answer: 'myvariable' }, { type: 'short_answer', title: 'Write the Java identifier exactly.' }));
  const numericQuestion = { type: 'short_answer', title: 'Calculate the numeric expression.' };
  assert.equal(canonicalAnswer({ answer: '(2 + 3) * 4' }, numericQuestion), canonicalAnswer({ answer: '20' }, numericQuestion));
  const decimalQuestion = { type: 'short_answer', title: 'Convert the supplied value to decimal.' };
  const hexadecimalQuestion = { type: 'short_answer', title: 'Write the result in hexadecimal.' };
  assert.equal(canonicalAnswer({ answer: '12' }, decimalQuestion), 'number:12');
  assert.equal(canonicalAnswer({ answer: '0x12' }, hexadecimalQuestion), 'hex:12');
  assert.notEqual(canonicalAnswer({ answer: '12' }, decimalQuestion), canonicalAnswer({ answer: '0x12' }, hexadecimalQuestion));
  assert.equal(canonicalAnswer({ answer: '12h' }, hexadecimalQuestion), 'hex:12');
  assert.equal(canonicalAnswer({ answer: '0xFFB5' }, hexadecimalQuestion), 'hex:ffb5');
  const masmQuestion = { ...assemblyQuestion, title: `${assemblyQuestion.title} Use MASM syntax only.` };
  assert.notEqual(canonicalAnswer({ answer: 'AND EAX, 0xFFFFF000' }, masmQuestion), canonicalAnswer({ answer: 'AND EAX, 0FFFFF000h' }, masmQuestion));
}

class BackwardReasoningProvider {
  constructor(statuses) { this.statuses = statuses; this.initialIndex = 0; this.criticIndex = 0; this.backwardIndex = 0; this.backwardPrompts = []; }
  async complete({ model, messages }) {
    const system = messages[0]?.content || '';
    if (system.includes('adversarial backward-reasoning verifier')) {
      this.backwardPrompts.push(messages);
      const status = this.statuses[this.backwardIndex++] || 'MATCHED';
      return { content: backwardFromMessages(messages, status), actualModel: model, providerRequestId: `backward-${this.backwardIndex}`, usage: { total_tokens: 2 } };
    }
    if (system.includes('independent critical reviewer')) {
      this.criticIndex += 1;
      return { content: critic('AND [EAX], 1'), actualModel: model, providerRequestId: `critic-${this.criticIndex}`, usage: { total_tokens: 3 } };
    }
    this.initialIndex += 1;
    const answer = this.initialIndex === 2 ? 'and [eax], 01h' : 'AND [EAX], 1';
    return { content: initialShort(answer, 'Technical syntax requires review.'), actualModel: model, providerRequestId: `initial-${this.initialIndex}`, usage: { total_tokens: 3 } };
  }
}

async function testBackwardReasoningIsIndependentAndBounded() {
  const provider = new BackwardReasoningProvider(['MATCHED']);
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] });
  const reviewedQuestion = { type: 'short_answer', title: 'Assembly instruction syntax comparison.' };
  const events = [];
  const result = await engine.solve({ schemaVersion: 1, requestId: 'backward-matched', question: reviewedQuestion }, undefined, event => events.push(event));
  assert.equal(result.metrics.backwardCalls, 1);
  assert.equal(result.metrics.backwardSuccesses, 1);
  assert.equal(result.metrics.debateCalls, 3);
  assert.equal(result.backwardVerification.status, 'MATCHED');
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.attempts.at(-1).stage, 'backward');
  assert.equal(provider.backwardPrompts.length, 1);
  assert.equal(provider.backwardPrompts[0][1].content.includes('candidate_1'), false);
  const backwardEvent = events.find(event => event.type === 'backward_result');
  assert.equal(backwardEvent.backward.candidateAnswer, result.answer);
  assert.equal(backwardEvent.backward.backwardStatus, 'MATCHED');
  assert.deepEqual(backwardEvent.backward.satisfiedRequirements, ['Mocked checked requirement.']);
  assert.equal(result.verification.backward.status, 'MATCHED');
  assert.equal(result.verification.backward.checkedRequirementCount, 1);
  assert.equal(result.verification.backward.explanation, 'Mocked backward review.');
  const accepted = events.find(event => event.type === 'final_acceptance');
  assert.deepEqual(accepted, {
    type: 'final_acceptance', decision: STATES.AI_VERIFIED, candidateAnswer: result.answer,
    consensusReached: true, backwardStatus: 'MATCHED', verificationMethod: 'GEMINI_BACKWARD',
    independentVerification: false, eligibleForAutoApply: true
  });
}

async function testBackwardContractRejectsInvalidAndInconclusiveResults() {
  const candidate = { answer: { answer: 'A' } };
  assert.equal(parseBackwardOutputDetailed(backward('B'), question, candidate).error.code, 'BACKWARD_CANDIDATE_MISMATCH');
  assert.equal(parseBackwardOutputDetailed(backward('A', 'MATCHED', { violatedRequirements: [{ requirement: 'r', observedConsequence: 'o', reason: 'x' }] }), question, candidate).error.code, 'BACKWARD_MATCHED_WITH_VIOLATIONS');
  const provider = new BackwardReasoningProvider(['INCONCLUSIVE']);
  const result = await new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] })
    .solve({ schemaVersion: 1, requestId: 'backward-inconclusive', question: { type: 'short_answer', title: 'Assembly instruction syntax comparison.' } });
  assert.equal(result.status, STATES.CONSENSUS_UNVERIFIED);
  assert.equal(result.backwardVerification.status, 'INCONCLUSIVE');
  assert.equal(result.metrics.backwardInconclusive, 1);
  assert.equal(result.metrics.backwardFailures, 0);
}

async function testBackwardStructuredFindingsAndMissingAssumptionsFailClosed() {
  const candidate = { answer: { answer: 'A' } };
  const structured = backward('A', 'INCONCLUSIVE', {
    reconstructedConsequences: [{ conclusion: 'The candidate selects option A.', support: 'Candidate answer is A.' }],
    uncheckedRequirements: [{ requirement: 'The unstated convention must be known.', support: 'The question does not define it.' }]
  });
  assert.equal(parseBackwardOutputDetailed(structured, question, candidate).value.backwardStatus, 'INCONCLUSIVE');
  const invalidObject = backward('A', 'MATCHED', { satisfiedRequirements: [{ unsupported: 'shape' }] });
  assert.equal(parseBackwardOutputDetailed(invalidObject, question, candidate).error.code, 'BACKWARD_FINDING_LIST_INVALID');
  const assumed = backward('A', 'MATCHED', { missingAssumptions: ['An exponent bias was assumed but is absent.'] });
  assert.equal(parseBackwardOutputDetailed(assumed, question, candidate).error.code, 'BACKWARD_MATCHED_WITH_MISSING_ASSUMPTIONS');
}

async function testIpv4ContextIsPreservedAndVagueInconclusiveGetsSecondOpinion() {
  const ipv4Question = {
    type: 'short_answer',
    title: 'EAX contains an IPv4 address. The netID is 20 bits. Write the AND EAX instruction with a hexadecimal mask.',
    passage: 'Use the standard IPv4 network-prefix convention.',
    options: undefined
  };
  let backwardCalls = 0;
  const prompts = [];
  const provider = {
    complete: async ({ model, messages }) => {
      if (messages[0]?.content?.includes('adversarial backward-reasoning verifier')) {
        prompts.push(messages[1].content);
        backwardCalls += 1;
        if (model === 'gemini-primary') return { content: backwardFromMessages(messages, 'INCONCLUSIVE', { missingAssumptions: ['The prefix convention is unspecified.'], uncheckedRequirements: [] }), actualModel: model, providerRequestId: 'backward-primary', usage: { total_tokens: 1 } };
        return { content: backwardFromMessages(messages, 'MATCHED'), actualModel: model, providerRequestId: 'backward-opinion', usage: { total_tokens: 1 } };
      }
      return { content: initialShort('AND EAX, 0xFFFFF000'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const events = [];
  const result = await new AdaptiveDebateOrchestrator({
    provider, models: ['gemini-a', 'gemini-b', 'gemini-c'], backwardModel: 'gemini-primary', backwardModels: ['gemini-primary', 'gemini-opinion'],
    fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: ['gemini-opinion'], judge: [] }
  }).solve({ schemaVersion: 1, requestId: 'ipv4-vague-inconclusive', question: ipv4Question }, undefined, event => events.push(event));
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.answer, 'AND EAX, 0xFFFFF000');
  assert.equal(backwardCalls, 2);
  assert.equal(events.filter(event => event.type === 'backward_second_opinion_started').length, 1);
  assert.match(prompts[0], /netID is 20 bits/);
  assert.match(prompts[0], /standard IPv4 network-prefix convention/);
}

async function testMaterialInconclusiveStaysFailClosedWithoutSecondOpinion() {
  let backwardCalls = 0;
  const provider = {
    complete: async ({ model, messages }) => {
      if (messages[0]?.content?.includes('adversarial backward-reasoning verifier')) {
        backwardCalls += 1;
        return { content: backwardFromMessages(messages, 'INCONCLUSIVE', { missingAssumptions: [{ requirement: 'The address family is absent.', impact: 'IPv4 and IPv6 use different mask widths and can change the answer.', whyUnresolved: 'The supplied text gives no address-family evidence.' }], uncheckedRequirements: [] }), actualModel: model, providerRequestId: 'material-inconclusive', usage: { total_tokens: 1 } };
      }
      return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const result = await new AdaptiveDebateOrchestrator({ provider, models: ['gemini-a', 'gemini-b', 'gemini-c'], backwardModel: 'gemini-primary', backwardModels: ['gemini-primary', 'gemini-opinion'] })
    .solve({ schemaVersion: 1, requestId: 'material-inconclusive', question });
  assert.equal(result.status, STATES.CONSENSUS_UNVERIFIED);
  assert.equal(backwardCalls, 1);
  assert.equal(result.backwardVerification.status, 'INCONCLUSIVE');
}

async function testCorrectiveCandidateIsNotAcceptedWhenSecondBackwardUnavailable() {
  let backwardCall = 0;
  const provider = {
    complete: async ({ model, messages }) => {
      const system = messages[0]?.content || '';
      if (system.includes('adversarial backward-reasoning verifier')) {
        backwardCall += 1;
        if (backwardCall === 1) return { content: backwardFromMessages(messages, 'CONTRADICTION_FOUND'), actualModel: model, providerRequestId: 'backward-1', usage: { total_tokens: 2 } };
        throw Object.assign(new Error('second backward unavailable'), { code: 'PROVIDER_ERROR', status: 503 });
      }
      if (system.includes('independent critical reviewer')) return { content: critic('B', undefined, true), actualModel: model, providerRequestId: `critic-${model}`, usage: { total_tokens: 2 } };
      return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 2 } };
    }
  };
  const result = await new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], minRemainingBudgetForRoundMs: 500,
    fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] }
  }).solve({ schemaVersion: 1, requestId: 'corrective-backward-unavailable', question });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.answer, null);
  assert.equal(result.finalDecision.eligibleForAutoApply, false);
  assert.equal(result.finalDecision.requiresManualReview, true);
  assert.equal(result.finalDecision.candidateReevaluated, true);
  assert.equal(result.backwardVerification.status, 'UNAVAILABLE');
}

async function testProviderTokenMetricsDoNotTreatTotalAsReasoning() {
  const provider = {
    complete: async ({ model, messages }) => {
      const backwardRequest = messages[0]?.content?.includes('adversarial backward-reasoning verifier');
      return {
        content: backwardRequest ? backwardFromMessages(messages) : initial('A'), actualModel: model,
        providerRequestId: `${model}-${backwardRequest ? 'backward' : 'initial'}`,
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, completion_tokens_details: { reasoning_tokens: 3 } }
      };
    }
  };
  const result = await new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] })
    .solve({ schemaVersion: 1, requestId: 'usage-metrics', question });
  assert.equal(result.metrics.promptTokens, 40);
  assert.equal(result.metrics.completionTokens, 16);
  assert.equal(result.metrics.reasoningTokens, 12);
  assert.equal(result.metrics.totalTokens, 56);
  assert.notEqual(result.metrics.reasoningTokens, result.metrics.totalTokens);
}

async function testBackwardProviderFailureEmitsOnlyErrorEvent() {
  const provider = {
    complete: async ({ model, messages }) => {
      if (messages[0]?.content?.includes('adversarial backward-reasoning verifier')) throw Object.assign(new Error('backward unavailable'), { code: 'PROVIDER_ERROR', status: 503 });
      return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const events = [];
  const result = await new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'], fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] } })
    .solve({ schemaVersion: 1, requestId: 'backward-provider-error', question }, undefined, event => events.push(event));
  assert.equal(result.status, STATES.CONSENSUS_UNVERIFIED);
  assert.equal(result.backwardVerification.status, 'UNAVAILABLE');
  assert.equal(result.metrics.backwardFailures, 1);
  assert.equal(events.filter(event => event.type === 'backward_result').length, 0);
  assert.equal(events.filter(event => event.type === 'backward_error').length, 1);
}

async function testBackwardTimeoutUsesOneHealthyFallbackWithinDeadline() {
  const provider = {
    complete: async ({ model, messages }) => {
      if (messages[0]?.content?.includes('adversarial backward-reasoning verifier')) {
        if (model === 'model-a') return new Promise(resolve => setTimeout(() => resolve({ content: backwardFromMessages(messages), actualModel: model, providerRequestId: 'late-backward', usage: { total_tokens: 1 } }), 700));
        return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: 'backward-fallback', usage: { total_tokens: 1 } };
      }
      return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const engine = new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], backwardModels: ['model-a', 'model-b'],
    fallbackPolicy: { ...shortFallbackPolicy(), backward: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 1 }, globalRequestTimeoutMs: 2_000 },
    fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: ['model-b'], judge: [] }
  });
  const events = [];
  const result = await engine.solve({ schemaVersion: 1, requestId: 'backward-timeout-fallback', question }, undefined, event => events.push(event));
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.backwardCalls, 1);
  assert.equal(result.metrics.modelTimeouts, 1);
  assert.equal(result.metrics.fallbackCalls, 1);
  assert.equal(result.attempts.filter(item => item.stage === 'backward').length, 2);
  assert.equal(events.filter(event => event.type === 'backward_timeout').length, 1);
  assert.equal(events.find(event => event.type === 'backward_timeout').fallbackModel, 'model-b');
}

async function testBackwardInvalidJsonGetsOneBoundedSchemaRepair() {
  const provider = {
    complete: async ({ model, messages }) => {
      const system = messages[0]?.content || '';
      if (system.includes('adversarial backward-reasoning verifier')) return { content: '{}', actualModel: model, providerRequestId: 'bad-backward', usage: { total_tokens: 1 } };
      if (system.includes('previous backward-verification response')) return { content: backwardFromMessages([{ role: 'system' }, { role: 'user', content: JSON.stringify({ candidateAnswer: 'A' }) }]), actualModel: model, providerRequestId: 'repaired-backward', usage: { total_tokens: 1 } };
      return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const result = await new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'], fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] } })
    .solve({ schemaVersion: 1, requestId: 'backward-schema-repair', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.schemaRepairCalls, 1);
  assert.equal(result.metrics.schemaRepairSuccesses, 1);
  assert.equal(result.attempts.filter(item => item.stage === 'schema_repair').length, 1);
}

async function testBackwardLogProjectionIsBoundedAndDebugControlled() {
  const source = {
    type: 'backward_result',
    backward: JSON.parse(backward('A', 'MATCHED', { reconstructedConsequences: ['A'.repeat(1_000)], explanation: 'E'.repeat(1_000) }))
  };
  const production = projectPipelineEvent(source, false);
  assert.equal(Object.hasOwn(production.backward, 'reconstructedConsequences'), false);
  assert.equal(production.backward.explanation.length <= 500, true);
  const debug = projectPipelineEvent(source, true);
  assert.equal(debug.backward.reconstructedConsequences.length, 1);
  assert.equal(debug.backward.reconstructedConsequences[0].length <= 500, true);
  assert.equal(debug.backward.explanation.length <= 500, true);
}

async function testBackwardContradictionTriggersOneCorrectiveRound() {
  let backwardCall = 0;
  const provider = {
    complete: async ({ model, messages }) => {
      const system = messages[0]?.content || '';
      if (system.includes('adversarial backward-reasoning verifier')) {
        backwardCall += 1;
        return { content: backwardFromMessages(messages, backwardCall === 1 ? 'CONTRADICTION_FOUND' : 'MATCHED'), actualModel: model, providerRequestId: `backward-${backwardCall}`, usage: { total_tokens: 2 } };
      }
      if (system.includes('independent critical reviewer')) return { content: critic('B', undefined, true), actualModel: model, providerRequestId: `critic-${model}`, usage: { total_tokens: 2 } };
      return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 2 } };
    }
  };
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'], minRemainingBudgetForRoundMs: 500 });
  const events = [];
  const result = await engine.solve({ schemaVersion: 1, requestId: 'backward-correction', question }, undefined, event => events.push(event));
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.answer, 'B');
  assert.equal(result.metrics.backwardCalls, 2);
  assert.equal(result.metrics.backwardContradictions, 1);
  assert.equal(result.metrics.backwardReevaluationRounds, 1);
  assert.equal(result.metrics.backwardCandidateChanges, 1);
  assert.equal(result.metrics.debateCalls, 3);
  assert.equal(events.filter(event => event.type === 'backward_result').length, 2);
  assert.equal(events.find(event => event.type === 'backward_result').backward.backwardStatus, 'CONTRADICTION_FOUND');
  assert.equal(events.some(event => event.type === 'backward_reevaluation' && event.previousCandidate === 'A'), true);
  assert.equal(events.some(event => event.type === 'backward_candidate_update' && event.newCandidate === 'B'), true);
}

function maskQuestion(prefix) {
  return { type: 'short_answer', title: `EAX register contains a 32-bit IP address. Extract the ${prefix}-bit network ID using bitwise AND. The immediate must be hexadecimal.` };
}

async function testBitwiseMaskVerifier() {
  for (const [prefix, mask] of [[20, 'FFFFF000'], [24, 'FFFFFF00'], [16, 'FFFF0000']]) {
    const checked = verify(maskQuestion(prefix), { answer: { answer: `AND EAX, 0x${mask}` }, evidence: [] });
    assert.equal(checked.independentVerification, true);
    assert.equal(checked.deterministic.rule, 'BitwiseMaskVerifier');
  }
  assert.equal(verify(maskQuestion(20), { answer: { answer: 'OR EAX, 0xFFFFF000' }, evidence: [] }).independentVerification, false);
  assert.equal(verify(maskQuestion(20), { answer: { answer: 'AND EBX, 0xFFFFF000' }, evidence: [] }).independentVerification, false);
  assert.equal(verify(maskQuestion(20), { answer: { answer: 'AND EAX, 0xFFFFFF00' }, evidence: [] }).independentVerification, false);
  assert.equal(verify({ type: 'short_answer', title: 'Write an AND instruction using hexadecimal.' }, { answer: { answer: 'AND EAX, 0xFFFFF000' }, evidence: [] }).deterministic.applicable, false);
}

const clearBitMaskQuestion = {
  type: 'short_answer',
  title: 'Write mask byte (in hex) to clear bit 2nd, 3rd, 5th of a byte value with AND instruction (LSB is 1st bit).'
};

async function testBitPositionMaskVerifierRejectsWrongMaskAnswers() {
  assert.equal(buildClearMask(8, [2, 3, 5]), 0xE9n);
  assert.equal(buildClearMaskByArray(8, [2, 3, 5]), 0xE9n);
  const candidate = answer => verify(clearBitMaskQuestion, { answer: { answer }, evidence: [] });
  const correct = candidate('0xE9');
  assert.equal(correct.independentVerification, true);
  assert.equal(correct.deterministic.rule, 'BitPositionMaskVerifier');
  assert.equal(correct.deterministic.oracleAgreement, true);
  assert.equal(correct.deterministic.propertyChecksPassed, true);
  for (const incorrect of ['0xC9', '0xEB', '0xD3', '0xE3']) assert.equal(candidate(incorrect).independentVerification, false, incorrect);
  const wrongMask = candidate('0xC9');
  assert.equal(wrongMask.deterministic.violations.some(item => item.code === 'UNREQUESTED_BIT_CLEARED' && item.bitPosition === 6), true);
  assert.equal(wrongMask.deterministic.violations.some(item => item.code === 'PROPERTY_CHECK_FAILED'), true);
  const zeroBased = { type: 'short_answer', title: 'Write an 8-bit mask in hexadecimal to clear bits 1, 2, 4 with AND (LSB is 0-based).' };
  const msbFirst = { type: 'short_answer', title: 'Write an 8-bit mask in hexadecimal to clear bits 4th, 6th, 7th with AND (MSB is 1st bit).' };
  assert.equal(verify(zeroBased, { answer: { answer: '0xE9' }, evidence: [] }).independentVerification, true);
  assert.equal(verify(msbFirst, { answer: { answer: '0xE9' }, evidence: [] }).independentVerification, true);
  for (const width of [16, 32, 64]) {
    const question = { type: 'short_answer', title: `Write a ${width}-bit mask in hexadecimal to clear bits 2nd, 3rd, 5th with AND (LSB is 1st bit).` };
    const expected = `0x${buildClearMask(width, [2, 3, 5]).toString(16).toUpperCase()}`;
    assert.equal(verify(question, { answer: { answer: expected }, evidence: [] }).independentVerification, true, String(width));
  }
  assert.equal(verify({ type: 'short_answer', title: 'Write a byte mask in hex to clear bits 2, 3, 5 using AND.' }, { answer: { answer: '0xE9' }, evidence: [] }).deterministic.applicable, false);
  const outOfRange = verify({ type: 'short_answer', title: 'Write a byte mask in hex to clear bit 9th using AND (LSB is 1st bit).' }, { answer: { answer: '0xE9' }, evidence: [] });
  assert.equal(outOfRange.independentVerification, false);
  assert.equal(outOfRange.deterministic.applicable, true);
}

async function testLegacyDeterministicEvidenceDoesNotVetoAiAcceptance() {
  const result = await makeEngine([[initial('A', 'The supplied input states a fact that is not present.'), initial('A', 'The supplied input states a fact that is not present.'), initial('A', 'The supplied input states a fact that is not present.')]])
    .solve({ schemaVersion: 1, requestId: 'critical-evidence', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.answer, 'A');
  assert.equal(result.metrics.debateCalls, 0);
  assert.equal(result.verification.verificationMethod, 'GEMINI_BACKWARD');
}

async function testCriticDiagnosticsAndFullAuditTrail() {
  const nestedAnswer = JSON.stringify({ critiques: ['candidate_1', 'candidate_2', 'candidate_3'].map(candidateId => ({ candidateId, assessment: 'supported', issue: null, evidence: 'No contradiction.' })), revisedAnswer: { answer: 'A' }, changedAnswer: false, changeReason: null, remainingUncertainty: [] });
  const detailed = parseCriticOutputDetailed(nestedAnswer, question, ['candidate_1', 'candidate_2', 'candidate_3']);
  assert.equal(detailed.value, null);
  assert.equal(detailed.error.code, 'CRITIC_REVISED_ANSWER_INVALID');

  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    [nestedAnswer, '{}', '{}'],
    [judge(), judge(), judge()]
  ]).solve({ schemaVersion: 1, requestId: 'full-audit', question });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.attempts.length, 9);
  assert.deepEqual(result.attempts.map(item => item.stage), ['initial', 'initial', 'initial', 'critic', 'critic', 'critic', 'critic_schema_repair', 'critic_schema_repair', 'critic_schema_repair']);
  assert.equal(result.metrics.logicalInferenceCalls, 9);
  assert.equal(result.metrics.invalidResponses, 6);
  assert.equal(result.attempts[3].validationError.code, 'CRITIC_REVISED_ANSWER_INVALID');
}

const dropdownQuestion = {
  type: 'dropdown_select',
  title: 'The following sequence executes: MOV AX, 67FE; MOV BX, AX; MOV CL, BH; MOV CH, BL. Select values at the watch point.',
  selects: [
    { id: 'q3_sel_1', label: 'CX high', options: [{ value: 'FE67', text: 'FE67' }, { value: '0000', text: '0000' }] },
    { id: 'q3_sel_2', label: 'AX', options: [{ value: '67FE', text: '67FE' }, { value: 'FFFF', text: 'FFFF' }] }
  ]
};
const dropdownAnswer = { q3_sel_1: 'FE67', q3_sel_2: '67FE' };

function initialDropdown(answer) {
  return JSON.stringify({ questionType: 'dropdown_select', answer, evidence: [{ claim: 'Register transfer', support: 'MOV transfers the exact byte values.' }], uncertainty: [], needsVerification: false });
}
function criticDropdown(answer, ids = ['candidate_1', 'candidate_2', 'candidate_3']) {
  return JSON.stringify({ critiques: ids.map(candidateId => ({ candidateId, assessment: 'supported', issue: null, evidence: 'Register transfer is consistent.' })), revisedAnswer: answer, changedAnswer: false, changeReason: null, remainingUncertainty: [] });
}

class DropdownRecoveryProvider {
  constructor({ repairSucceeds = true, criticRepairSucceeds = true } = {}) {
    this.repairSucceeds = repairSucceeds;
    this.criticRepairSucceeds = criticRepairSucceeds;
    this.calls = [];
  }
  async complete({ model, messages }) {
    const system = messages[0]?.content || '';
    this.calls.push({ model, system, user: messages[1]?.content || '' });
    if (system.includes('adversarial backward-reasoning verifier')) return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: `backward-${this.calls.length}`, usage: { total_tokens: 2 } };
    if (system.includes('Repair only your own previous response')) {
      const body = system.includes('critic response')
        ? (this.criticRepairSucceeds ? criticDropdown(dropdownAnswer) : criticDropdown('FE67, 67FE'))
        : (this.repairSucceeds ? initialDropdown(dropdownAnswer) : initialDropdown('FE67, 67FE'));
      return { content: body, actualModel: model, providerRequestId: `repair-${this.calls.length}`, usage: { total_tokens: 2 } };
    }
    if (system.includes('independent critical reviewer')) {
      const body = model === 'model-a' ? criticDropdown(dropdownAnswer) : criticDropdown('FE67, 67FE');
      return { content: body, actualModel: model, providerRequestId: `critic-${this.calls.length}`, usage: { total_tokens: 3 } };
    }
    const body = model === 'model-c' ? initialDropdown('FE67, 67FE') : initialDropdown(dropdownAnswer);
    return { content: body, actualModel: model, providerRequestId: `initial-${this.calls.length}`, usage: { total_tokens: 3 } };
  }
}

async function testDropdownContractAndInitialSchemaRecovery() {
  const provider = new DropdownRecoveryProvider();
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'dropdown-repair', question: dropdownQuestion });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.deepEqual(result.answer, dropdownAnswer);
  assert.equal(result.metrics.initialCalls, 3);
  assert.equal(result.metrics.schemaRepairCalls, 1);
  assert.equal(result.metrics.schemaRepairSuccesses, 1);
  assert.equal(result.metrics.debateCalls, 0);
  assert.equal(result.metrics.judgeCalls, 0);
  assert.deepEqual(result.attempts.map(item => item.stage), ['initial', 'initial', 'initial', 'schema_repair', 'backward']);
  assert.equal(result.attempts[2].validationError.code, 'DROPDOWN_ANSWER_TYPE_INVALID');
  assert.equal(result.attempts[3].requestedModel, 'model-c');
  assert.match(provider.calls[0].user, /"q3_sel_1"/);
  assert.match(provider.calls[0].user, /"value":"FE67"/);
}

async function testDropdownRecoveryFailureFailsClosedWithoutDebateOrJudge() {
  const provider = new DropdownRecoveryProvider({ repairSucceeds: false });
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'dropdown-repair-fails', question: dropdownQuestion });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.answer, null);
  assert.equal(result.metrics.schemaRepairCalls, 1);
  assert.equal(result.metrics.schemaRepairFailures, 1);
  assert.equal(result.metrics.debateCalls, 0);
  assert.equal(result.metrics.judgeCalls, 0);
}

async function testDropdownValidationAndCriticRecovery() {
  assert.equal(parseInitialOutputDetailed('', dropdownQuestion).error.code, 'INITIAL_EMPTY_RESPONSE');
  assert.equal(parseInitialOutputDetailed('not JSON', dropdownQuestion).error.code, 'INITIAL_JSON_PARSE_ERROR');
  assert.equal(parseInitialOutputDetailed('null', dropdownQuestion).error.code, 'INITIAL_OBJECT_REQUIRED');
  const invalidCases = [
    [{ q3_sel_1: 'FE67' }, 'DROPDOWN_REQUIRED_SELECT_MISSING'],
    [{ q3_sel_1: 'FE67', q3_sel_2: '67FE', unknown: 'x' }, 'DROPDOWN_UNKNOWN_SELECT_ID'],
    [{ q3_sel_1: '67FE', q3_sel_2: '67FE' }, 'DROPDOWN_OPTION_VALUE_INVALID'],
    ['FE67, 67FE', 'DROPDOWN_ANSWER_TYPE_INVALID'],
    [[], 'DROPDOWN_ANSWER_TYPE_INVALID']
  ];
  for (const [answer, code] of invalidCases) {
    const parsed = parseInitialOutputDetailed(initialDropdown(answer), dropdownQuestion);
    assert.equal(parsed.value, null);
    assert.equal(parsed.error.code, code);
  }
  const criticParsed = parseCriticOutputDetailed(criticDropdown(dropdownAnswer), dropdownQuestion, ['candidate_1', 'candidate_2', 'candidate_3']);
  assert.deepEqual(criticParsed.value.answer.answer, dropdownAnswer);
  const criticString = parseCriticOutputDetailed(criticDropdown('FE67, 67FE'), dropdownQuestion, ['candidate_1', 'candidate_2', 'candidate_3']);
  assert.equal(criticString.error.code, 'CRITIC_REVISED_ANSWER_INVALID');

  const provider = new DropdownRecoveryProvider();
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'] });
  // Force a valid initial disagreement so critic schema recovery, rather than initial recovery, is exercised.
  provider.complete = async ({ model, messages }) => {
    const system = messages[0]?.content || '';
    provider.calls.push({ model, system, user: messages[1]?.content || '' });
    if (system.includes('adversarial backward-reasoning verifier')) return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: `backward-${provider.calls.length}`, usage: { total_tokens: 2 } };
    if (system.includes('Repair only your own previous critic response')) return { content: criticDropdown(dropdownAnswer), actualModel: model, providerRequestId: `critic-repair-${provider.calls.length}`, usage: { total_tokens: 2 } };
    if (system.includes('independent critical reviewer')) return { content: model === 'model-a' ? criticDropdown(dropdownAnswer) : criticDropdown('FE67, 67FE'), actualModel: model, providerRequestId: `critic-${provider.calls.length}`, usage: { total_tokens: 3 } };
    const answer = model === 'model-b' ? { q3_sel_1: '0000', q3_sel_2: 'FFFF' } : dropdownAnswer;
    return { content: initialDropdown(answer), actualModel: model, providerRequestId: `initial-${provider.calls.length}`, usage: { total_tokens: 3 } };
  };
  const result = await engine.solve({ schemaVersion: 1, requestId: 'critic-dropdown-repair', question: dropdownQuestion });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.debateCalls, 3);
  assert.equal(result.metrics.schemaRepairCalls, 2);
  assert.equal(result.metrics.schemaRepairSuccesses, 2);
  assert.equal(result.metrics.judgeCalls, 0);
  assert.deepEqual(result.attempts.slice(3).map(item => item.stage), ['critic', 'critic', 'critic', 'critic_schema_repair', 'critic_schema_repair', 'backward']);
}

function shortFallbackPolicy() {
  return {
    initial: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 2 },
    schemaRepair: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 1 },
    critic: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 2 },
    backward: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 1 },
    judge: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 2 },
    globalRequestTimeoutMs: 3000
  };
}

async function testBenchmarkOptimizedFallbackRegistry() {
  assert.deepEqual(DEFAULT_BACKUP_POOLS.initial[0], ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash']);
  assert.deepEqual(DEFAULT_BACKUP_POOLS.initial[1], ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash']);
  assert.deepEqual(DEFAULT_BACKUP_POOLS.critic[0], ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash']);
  assert.deepEqual(DEFAULT_BACKUP_POOLS.critic[1], ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash']);
  assert.deepEqual(DEFAULT_BACKUP_POOLS.judge, ['gemini-3.7-flash', 'gemini-3.6-flash']);
  assert.equal(JSON.stringify(DEFAULT_BACKUP_POOLS).includes('gpt-'), false);
  assert.deepEqual(BACKWARD_GEMINI_MODELS, ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']);
  assert.deepEqual(DEFAULT_BACKUP_POOLS.backward, BACKWARD_GEMINI_MODELS.slice(1));
}

async function testGeminiBackwardPoolDoesNotChangeForwardSlots() {
  const calls = [];
  const provider = {
    complete: async ({ model, messages }) => {
      calls.push(model);
      return { content: messages[0]?.content?.includes('adversarial backward-reasoning verifier') ? backwardFromMessages(messages) : initial('A'), actualModel: model, providerRequestId: model, usage: { total_tokens: 1 } };
    }
  };
  const forward = ['gemini-a', 'gemini-b', 'gemini-c'];
  const pool = BACKWARD_GEMINI_MODELS;
  const result = await new AdaptiveDebateOrchestrator({ provider, models: forward, backwardModels: pool, backwardModel: pool[0], fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: pool.slice(1), judge: [] } })
    .solve({ schemaVersion: 1, requestId: 'gemini-backward-pool', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.deepEqual(calls.slice(0, 3).sort(), forward.slice().sort());
  assert.equal(calls[3], 'gemini-3.6-flash');
  assert.equal(result.verification.verificationMethod, 'GEMINI_BACKWARD');
}

async function testStageHealthRankingAndCircuitBreaker() {
  const health = new ModelHealthTracker({ minSamples: 2, failureThreshold: 2, cooldownMs: 60_000 });
  health.record('slow', 'critic', 'valid', 4_000);
  health.record('slow', 'critic', 'valid', 4_500);
  health.record('fast', 'critic', 'valid', 800);
  health.record('fast', 'critic', 'valid', 900);
  assert.deepEqual(health.rank(['slow', 'fast'], 'critic'), ['fast', 'slow']);
  assert.deepEqual(health.rank(['unseen-b', 'unseen-a'], 'critic'), ['unseen-b', 'unseen-a']);
  health.record('broken', 'critic', 'timeout', 500);
  health.record('broken', 'critic', 'timeout', 500);
  assert.equal(health.isOpen('broken', 'critic'), true);
  health.record('invalid-json', 'initial', 'invalid_response', 500);
  health.record('invalid-json', 'initial', 'invalid_response', 500);
  assert.equal(health.isDegraded('invalid-json', 'initial'), true);
  const snapshot = health.snapshot()['critic:fast'];
  assert.equal(snapshot.attemptCount, 2);
  assert.equal(snapshot.p95LatencyMs, 900);
  assert.equal(snapshot.validJsonRate, 1);
}

class TimeoutFallbackProvider {
  constructor({ backupFails = false } = {}) { this.backupFails = backupFails; this.calls = []; }
  async complete({ model, messages }) {
    this.calls.push(model);
    if (messages?.[0]?.content?.includes('adversarial backward-reasoning verifier')) return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: 'backward', usage: { total_tokens: 1 } };
    if (model === 'model-a') return new Promise(resolve => setTimeout(() => resolve({ content: initial('A'), actualModel: model, providerRequestId: 'late-primary', usage: { total_tokens: 1 } }), 600));
    if (model === 'backup-a') {
      if (this.backupFails) throw Object.assign(new Error('backup unavailable'), { code: 'PROVIDER_ERROR', status: 503 });
      return { content: initial('A'), actualModel: model, providerRequestId: 'backup-a', usage: { total_tokens: 2 } };
    }
    return { content: initial('A'), actualModel: model, providerRequestId: model, usage: { total_tokens: 1 } };
  }
}

async function testSlotFallbackTimeoutAndCollisionSafety() {
  const provider = new TimeoutFallbackProvider();
  const engine = new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], fallbackPolicy: shortFallbackPolicy(), minRemainingBudgetForRoundMs: 500,
    fallbackPools: { initial: [['model-b', 'backup-a'], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] }
  });
  const events = [];
  const result = await engine.solve({ schemaVersion: 1, requestId: 'slot-fallback', question }, undefined, event => events.push(event));
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.initialCalls, 3);
  assert.equal(result.metrics.fallbackCalls, 1);
  assert.equal(result.metrics.fallbackSuccesses, 1);
  assert.equal(result.metrics.modelTimeouts, 1);
  assert.equal(result.metrics.abortedAttempts, 1);
  assert.equal(result.metrics.physicalHttpAttempts, 5);
  assert.deepEqual(result.attempts.map(item => item.requestedModel).sort(), ['backup-a', 'model-a', 'model-a', 'model-b', 'model-c']);
  assert.equal(result.attempts.find(item => item.requestedModel === 'backup-a').fallbackReason, 'MODEL_TIMEOUT');
  assert.equal(new Set(result.attempts.filter(item => item.validationStatus === 'valid').map(item => item.effectiveModel)).size, 4);
  assert.equal(events.filter(event => event.type === 'initial_fallback_started').length, 1);
  assert.equal(events.filter(event => event.type === 'initial_fallback_completed').length, 1);
  assert.equal(events.find(event => event.type === 'initial_fallback_completed').slotId, 'initial_A');
}

async function testInitialEachSlotCanRecoverWithoutReusingSuccessfulVotes() {
  for (const failedIndex of [0, 1, 2]) {
    const primary = ['gemini-a', 'gemini-b', 'gemini-c'];
    const backup = `gemini-backup-${failedIndex}`;
    const calls = [];
    const provider = {
      complete: async ({ model, messages }) => {
        calls.push(model);
        if (messages[0]?.content?.includes('adversarial backward-reasoning verifier')) return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: `backward-${model}`, usage: { total_tokens: 1 } };
        if (model === primary[failedIndex]) throw Object.assign(new Error('timed out'), { code: 'MODEL_TIMEOUT' });
        return { content: initial('A'), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
      }
    };
    const pools = [[], [], []]; pools[failedIndex] = [backup];
    const result = await new AdaptiveDebateOrchestrator({
      provider, models: primary, backwardModel: 'gemini-backward', backwardModels: ['gemini-backward'],
      fallbackPools: { initial: pools, critic: [[], [], []], schemaRepair: [], backward: [], judge: [] },
      fallbackPolicy: { ...shortFallbackPolicy(), initial: { primaryTimeoutMs: 500, backupTimeoutMs: 500, maxBackupAttempts: 1 } }
    }).solve({ schemaVersion: 1, requestId: `initial-slot-recovery-${failedIndex}`, question });
    assert.equal(result.status, STATES.AI_VERIFIED, String(failedIndex));
    assert.equal(result.metrics.initialCalls, 3);
    assert.equal(result.metrics.fallbackCalls, 1);
    assert.equal(result.metrics.physicalHttpAttempts, 5);
    assert.equal(result.attempts.filter(item => item.stage === 'initial' && item.validationStatus === 'valid').length, 3);
    assert.equal(calls.filter(model => model === primary[(failedIndex + 1) % 3]).length, 1);
    assert.equal(calls.filter(model => model === primary[(failedIndex + 2) % 3]).length, 1);
    assert.equal(calls.filter(model => model === backup).length, 1);
  }
}

async function testBackupOneTimeoutThenBackupTwoSucceeds() {
  const provider = {
    complete: async ({ model, messages }) => {
      if (messages?.[0]?.content?.includes('adversarial backward-reasoning verifier')) return { content: backwardFromMessages(messages), actualModel: model, providerRequestId: 'backward', usage: { total_tokens: 1 } };
      if (model === 'model-a' || model === 'backup-one') return new Promise(resolve => setTimeout(() => resolve({ content: initial('A'), actualModel: model, providerRequestId: `late-${model}`, usage: { total_tokens: 1 } }), 600));
      if (model === 'backup-two') return { content: initial('A'), actualModel: model, providerRequestId: 'backup-two', usage: { total_tokens: 1 } };
      return { content: initial('A'), actualModel: model, providerRequestId: model, usage: { total_tokens: 1 } };
    }
  };
  const engine = new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], fallbackPolicy: shortFallbackPolicy(),
    fallbackPools: { initial: [['backup-one', 'backup-two'], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] }
  });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'second-backup', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.fallbackCalls, 2);
  assert.equal(result.metrics.fallbackSuccesses, 1);
  assert.equal(result.metrics.modelTimeouts, 2);
  assert.deepEqual(result.attempts.map(item => item.requestedModel).sort(), ['backup-one', 'backup-two', 'model-a', 'model-a', 'model-b', 'model-c']);
}

async function testFallbackFailureRemainsFailClosed() {
  const provider = new TimeoutFallbackProvider({ backupFails: true });
  const engine = new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], fallbackPolicy: shortFallbackPolicy(),
    fallbackPools: { initial: [['backup-a'], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: [] }
  });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'slot-fallback-failure', question });
  assert.equal(result.consensus, undefined);
  assert.equal(result.status, STATES.PROVIDER_ERROR);
  assert.equal(result.answer, null);
  assert.equal(result.metrics.fallbackCalls, 1);
  assert.equal(result.metrics.fallbackFailures, 1);
}

async function testJudgeFallbackPreservesJudgeRole() {
  const provider = {
    complete: async ({ model }) => {
      if (model === 'model-a') {
        return new Promise(resolve => setTimeout(() => resolve({ content: judge(), actualModel: model, providerRequestId: 'late-judge', usage: { total_tokens: 1 } }), 600));
      }
      if (model === 'backup-judge') return { content: judge(), actualModel: model, providerRequestId: 'backup-judge', usage: { total_tokens: 2 } };
      throw new Error(`Unexpected model ${model}`);
    }
  };
  const engine = new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], fallbackPolicy: shortFallbackPolicy(),
    fallbackPools: { initial: [[], [], []], critic: [[], [], []], schemaRepair: [], backward: [], judge: ['backup-judge'] }
  });
  const result = await engine.runJudge(question, [], { statuses: [] }, undefined, Date.now() + 2_500);
  assert.equal(result.value.assessment, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.fallbackCalls, 1);
  assert.equal(result.fallbackSuccesses, 1);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(result.attempts.map(item => item.provenance.requestedModel), ['model-a', 'backup-judge']);
  assert.equal(result.attempts[1].provenance.fallbackReason, 'MODEL_TIMEOUT');
}

async function testCriticFallbackOnlyReplacesTimedOutSlot() {
  const provider = {
    complete: async ({ model, messages }) => {
      const isCritic = messages[0]?.content.includes('independent critical reviewer');
      if (!isCritic) {
        const answers = { 'model-a': 'A', 'model-b': 'B', 'model-c': 'C' };
        return { content: initial(answers[model]), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
      }
      if (model === 'model-a') return new Promise(resolve => setTimeout(() => resolve({ content: critic('A'), actualModel: model, providerRequestId: 'late-critic', usage: { total_tokens: 1 } }), 600));
      if (model === 'backup-critic') return { content: critic('A'), actualModel: model, providerRequestId: 'backup-critic', usage: { total_tokens: 2 } };
      return { content: critic('A'), actualModel: model, providerRequestId: `critic-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const engine = new AdaptiveDebateOrchestrator({
    provider, models: ['model-a', 'model-b', 'model-c'], fallbackPolicy: shortFallbackPolicy(), minRemainingBudgetForRoundMs: 500,
    fallbackPools: { initial: [[], [], []], critic: [['backup-critic'], [], []], schemaRepair: [], backward: [], judge: [] }
  });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'critic-fallback', question });
  assert.equal(result.status, STATES.CONSENSUS_UNVERIFIED);
  assert.equal(result.metrics.debateCalls, 3);
  assert.equal(result.metrics.fallbackCalls, 1);
  assert.equal(result.metrics.fallbackByStage.critic, 1);
  assert.equal(result.attempts.filter(item => item.stage === 'critic').length, 4);
  assert.equal(result.attempts.find(item => item.requestedModel === 'backup-critic').slotId, 'critic_A');
}

async function testDefaultCriticAPrefersBenchmarkBackup() {
  const primaryModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const provider = {
    complete: async ({ model, messages }) => {
      const isCritic = messages[0]?.content.includes('independent critical reviewer');
      if (!isCritic) {
        const answers = { 'gemini-3.8-flash': 'A', 'gemini-2.5-flash': 'B', 'gemini-2.5-flash-lite': 'C' };
        return { content: initial(answers[model]), actualModel: model, providerRequestId: `initial-${model}`, usage: { total_tokens: 1 } };
      }
      if (model === 'gemini-3.8-flash') return new Promise(resolve => setTimeout(() => resolve({ content: critic('A'), actualModel: model, providerRequestId: 'late-default-critic', usage: { total_tokens: 1 } }), 600));
      return { content: critic('A'), actualModel: model, providerRequestId: `critic-${model}`, usage: { total_tokens: 1 } };
    }
  };
  const engine = new AdaptiveDebateOrchestrator({ provider, models: primaryModels, fallbackPolicy: shortFallbackPolicy(), minRemainingBudgetForRoundMs: 500 });
  const result = await engine.solve({ schemaVersion: 1, requestId: 'default-critic-a-backup', question });
  const fallback = result.attempts.find(item => item.stage === 'critic' && item.requestedModel === 'gemini-3.1-flash-lite');
  assert.equal(result.status, STATES.CONSENSUS_UNVERIFIED);
  assert.ok(fallback);
  assert.equal(fallback.slotId, 'critic_A');
  assert.equal(fallback.fallbackReason, 'MODEL_TIMEOUT');
}

const naturalMaskQuestion = {
  type: 'short_answer',
  title: 'EAX stores a 32-bit IP address. Network ID length = 20 bits. Write the AND EAX instruction with hexadecimal mask.'
};

async function testDeterministicVerificationDoesNotRunInPipeline() {
  const correct = 'AND EAX, 0xFFFFF000';
  const incorrect = 'AND EAX, 0xFFF00000';
  const result = await makeEngine([[initialShort(correct), initialShort(correct), initialShort(incorrect)]])
    .solve({ schemaVersion: 1, requestId: 'natural-mask-verification', question: naturalMaskQuestion });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.answer, null);
  assert.equal(result.metrics.debateCalls > 0, true);
  assert.equal(Object.hasOwn(result.metrics, 'verifierApplicable'), false);
  assert.equal(result.metrics.logicalInferenceCalls >= 3, true);
}

async function testEvidenceGuidedRoundTwoCanConverge() {
  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    [critic('A'), critic('B'), critic('C', undefined, true)],
    [critic('A'), critic('A', undefined, true), critic('A', undefined, true)]
  ]).solve({ schemaVersion: 1, requestId: 'round-two-converges', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.answer, 'A');
  assert.equal(result.metrics.debateRoundsExecuted, 2);
  assert.equal(result.metrics.debateConvergenceRound, 2);
  assert.equal(result.metrics.debateStopReason, 'AI_BACKWARD_MATCHED');
  assert.equal(result.metrics.debateCalls, 6);
}

async function testStableDisagreementStopsWithoutInfiniteDebate() {
  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    [critic('A'), critic('B'), critic('C')]
  ]).solve({ schemaVersion: 1, requestId: 'stable-disagreement', question });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.answer, null);
  assert.equal(result.metrics.debateRoundsExecuted, 1);
  assert.equal(result.metrics.debateStopReason, 'STABLE_DISAGREEMENT');
  assert.equal(result.metrics.debateCalls, 3);
}

async function testAnswerOscillationIsRecordedAndFailsClosed() {
  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    [critic('A'), critic('A', undefined, true), critic('C')],
    [critic('A'), critic('B', undefined, true), critic('C')]
  ]).solve({ schemaVersion: 1, requestId: 'answer-oscillation', question });
  assert.equal(result.status, STATES.UNRESOLVED);
  assert.equal(result.metrics.debateRoundsExecuted, 2);
  assert.equal(result.metrics.answerChanges, 2);
  assert.equal(result.metrics.answerOscillations, 1);
  assert.equal(result.answer, null);
}

async function testRoundThreeRequiresExplicitConfiguration() {
  const result = await makeEngine([
    [initial('A'), initial('B'), initial('C')],
    [critic('A'), critic('B'), critic('C', undefined, true)],
    [critic('A'), critic('B', undefined, true), critic('C')],
    [critic('A'), critic('A', undefined, true), critic('A', undefined, true)]
  ], { maxDebateRounds: 3, absoluteMaxDebateRounds: 3 }).solve({ schemaVersion: 1, requestId: 'third-round-configured', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.equal(result.metrics.debateRoundsExecuted, 3);
  assert.equal(result.metrics.debateConvergenceRound, 3);
}

async function testOnlyConfiguredGeminiModelsReceiveProviderCalls() {
  const calls = [];
  const configuredModels = ['model-a', 'model-b', 'model-c'];
  const provider = {
    complete: async ({ model, messages }) => {
      calls.push(model);
      return { content: messages[0]?.content?.includes('adversarial backward-reasoning verifier') ? backwardFromMessages(messages) : initial('A'), actualModel: model, providerRequestId: model, usage: { total_tokens: 1 } };
    }
  };
  const result = await new AdaptiveDebateOrchestrator({ provider, models: configuredModels }).solve({ schemaVersion: 1, requestId: 'gemini-only-calls', question });
  assert.equal(result.status, STATES.AI_VERIFIED);
  assert.deepEqual([...new Set(calls)].sort(), configuredModels.slice().sort());
  assert.equal(result.metrics.physicalHttpAttempts, 4);
}

async function testAllProviderErrorsDoNotRecoverWithDeterministicProof() {
  const provider = {
    complete: async () => { throw Object.assign(new Error('provider unavailable'), { code: 'PROVIDER_ERROR', status: 503, transient: true }); }
  };
  const fallbackPolicy = {
    initial: { primaryTimeoutMs: 100, backupTimeoutMs: 100, maxBackupAttempts: 0 },
    schemaRepair: { primaryTimeoutMs: 100, backupTimeoutMs: 100, maxBackupAttempts: 0 },
    critic: { primaryTimeoutMs: 100, backupTimeoutMs: 100, maxBackupAttempts: 0 },
    backward: { primaryTimeoutMs: 100, backupTimeoutMs: 100, maxBackupAttempts: 0 },
    judge: { primaryTimeoutMs: 100, backupTimeoutMs: 100, maxBackupAttempts: 0 },
    globalRequestTimeoutMs: 1_000
  };
  const engine = new AdaptiveDebateOrchestrator({ provider, models: ['model-a', 'model-b', 'model-c'], fallbackPolicy });
  const proven = await engine.solve({ schemaVersion: 1, requestId: 'provider-proof-recovery', question: clearBitMaskQuestion });
  assert.equal(proven.status, STATES.PROVIDER_ERROR);
  assert.equal(proven.answer, null);
  assert.equal(proven.attempts.every(attempt => attempt.providerDiagnostics.httpStatus === 503), true);
  const unproven = await engine.solve({ schemaVersion: 1, requestId: 'provider-no-proof', question });
  assert.equal(unproven.status, STATES.PROVIDER_ERROR);
  assert.equal(unproven.answer, null);
}

function request(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
}

async function testHttpSecurityContract() {
  const orchestrator = makeEngine([[initial('A'), initial('A'), initial('A')]]);
  const events = [];
  const server = createServer({
    orchestrator,
    authToken: 'test-token',
    allowedOrigins: new Set(['chrome-extension://test']),
    fileLogger: (event, data) => events.push({ event, data })
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const body = { schemaVersion: 1, requestId: 'http-test', mode: 'adaptive_debate', question };
    let response = await request(port, '/v1/solve', body, { authorization: 'Bearer wrong', 'idempotency-key': 'one' });
    assert.equal(response.status, 401);
    response = await request(port, '/v1/solve', body, { authorization: 'Bearer test-token', 'idempotency-key': 'two' });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, STATES.AI_VERIFIED);
    assert.ok(events.some(item => item.event === 'server.listening'));
    assert.ok(events.some(item => item.event === 'request.accepted'));
    assert.ok(events.some(item => item.event === 'request.completed'));
    const backwardPipeline = events.find(item => item.event === 'pipeline' && item.data.type === 'backward_result');
    assert.equal(backwardPipeline.data.backward.backwardStatus, 'MATCHED');
    assert.equal(backwardPipeline.data.backward.checkedRequirementCount, 1);
    assert.equal(Object.hasOwn(backwardPipeline.data.backward, 'reconstructedConsequences'), false);
    const completed = events.find(item => item.event === 'request.completed');
    assert.equal(completed.data.verification.backward.status, 'MATCHED');
    assert.equal(completed.data.verification.backward.checkedRequirementCount, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

(async () => {
  await testInitialConsensusIsNotOverclaimed();
  await testEmergencySingleModelUsesExactlyOneForwardModel();
  await testSingleModelBoundedSchemaRepair();
  await testCrossExaminationRunsInParallelRound();
  await testNoTwoOfThreeAcceptanceAfterTimeout();
  await testMalformedCriticIsInvalidNotConsensus();
  await testMissingModelMetadataFailsClosed();
  await testAssemblyCanonicalizationAndNoFalseDebate();
  await testTypeAwareSemanticNormalization();
  await testBackwardReasoningIsIndependentAndBounded();
  await testBackwardContractRejectsInvalidAndInconclusiveResults();
  await testBackwardStructuredFindingsAndMissingAssumptionsFailClosed();
  await testIpv4ContextIsPreservedAndVagueInconclusiveGetsSecondOpinion();
  await testMaterialInconclusiveStaysFailClosedWithoutSecondOpinion();
  await testBackwardProviderFailureEmitsOnlyErrorEvent();
  await testBackwardTimeoutUsesOneHealthyFallbackWithinDeadline();
  await testBackwardInvalidJsonGetsOneBoundedSchemaRepair();
  await testBackwardLogProjectionIsBoundedAndDebugControlled();
  await testBackwardContradictionTriggersOneCorrectiveRound();
  await testCorrectiveCandidateIsNotAcceptedWhenSecondBackwardUnavailable();
  await testProviderTokenMetricsDoNotTreatTotalAsReasoning();
  await testBitwiseMaskVerifier();
  await testBitPositionMaskVerifierRejectsWrongMaskAnswers();
  await testLegacyDeterministicEvidenceDoesNotVetoAiAcceptance();
  await testCriticDiagnosticsAndFullAuditTrail();
  await testDropdownContractAndInitialSchemaRecovery();
  await testDropdownRecoveryFailureFailsClosedWithoutDebateOrJudge();
  await testDropdownValidationAndCriticRecovery();
  await testBenchmarkOptimizedFallbackRegistry();
  await testGeminiBackwardPoolDoesNotChangeForwardSlots();
  await testStageHealthRankingAndCircuitBreaker();
  await testSlotFallbackTimeoutAndCollisionSafety();
  await testInitialEachSlotCanRecoverWithoutReusingSuccessfulVotes();
  await testBackupOneTimeoutThenBackupTwoSucceeds();
  await testFallbackFailureRemainsFailClosed();
  await testJudgeFallbackPreservesJudgeRole();
  await testCriticFallbackOnlyReplacesTimedOutSlot();
  await testDefaultCriticAPrefersBenchmarkBackup();
  await testDeterministicVerificationDoesNotRunInPipeline();
  await testEvidenceGuidedRoundTwoCanConverge();
  await testStableDisagreementStopsWithoutInfiniteDebate();
  await testAnswerOscillationIsRecordedAndFailsClosed();
  await testRoundThreeRequiresExplicitConfiguration();
  await testOnlyConfiguredGeminiModelsReceiveProviderCalls();
  await testAllProviderErrorsDoNotRecoverWithDeterministicProof();
  await testHttpSecurityContract();
  console.log('multi-agent debate tests passed');
})().catch(error => { console.error(error); process.exit(1); });
