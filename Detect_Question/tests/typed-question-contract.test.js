'use strict';

const assert = require('assert');
const { validateSolveRequest } = require('../orchestrator/lib/contracts');

function testTypedQuestionPreservation() {
  const request = validateSolveRequest({ schemaVersion: 1, requestId: 'typed-preservation', mode: 'adaptive_debate', question: {
    type: 'dropdown_select', title: 'MOV AX, 67FEh', passage: 'Choose each exact register value.',
    selects: [{ id: 'q3_sel_1', label: 'CX =', options: [{ value: 'FE67', text: 'FE67h' }, { value: '0000', text: '0000h' }] }]
  } });
  assert.equal(request.question.title, 'MOV AX, 67FEh');
  assert.equal(request.question.selects[0].id, 'q3_sel_1');
  assert.equal(request.question.selects[0].options[0].value, 'FE67');
}

testTypedQuestionPreservation();
console.log('typed question contract tests passed');
