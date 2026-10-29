'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateSolveRequest } = require('../orchestrator/lib/contracts');

function testTypedContractsRemainStrict() {
  const dropdown = validateSolveRequest({ schemaVersion: 1, requestId: 'dropdown-contract', mode: 'adaptive_debate', question: { type: 'dropdown_select', title: 'Register values', selects: [{ id: 'CX', label: 'CX', options: [{ value: 'FE67', text: 'FE67' }] }] } }).question;
  assert.equal(dropdown.selects[0].id, 'CX');
  assert.throws(() => validateSolveRequest({ schemaVersion: 1, requestId: 'invalid-contract', mode: 'adaptive_debate', question: { type: 'single_choice', title: 'Q', options: [{ key: 'A', text: '1' }, { key: 'A', text: '2' }] } }));
  assert.equal(validateSolveRequest({ schemaVersion: 1, requestId: 'audit-contract', mode: 'adaptive_debate', question: { type: 'short_answer', title: '1 + 1' } }).requestId, 'audit-contract');
}

function testLegacyDirectSolverIsRemoved() {
  for (const relative of ['src/content/solver/ConsensusSolverEngine.js', 'src/background/Key4uApiClient.js', 'src/background/StealthCaptureSolver.js', 'src/shared/AiPrompts.js', 'src/shared/ModelConfig.js', 'src/content/ui/StealthSnipOverlay.js']) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', relative)), false, `${relative} must not remain in the active extension`);
  }
}

testTypedContractsRemainStrict();
testLegacyDirectSolverIsRemoved();
console.log('comprehensive audit tests passed');
