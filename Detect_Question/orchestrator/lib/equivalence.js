'use strict';

const { canonicalizeAnswer } = require('./contracts');

const EQUIVALENCE_STATUS = Object.freeze({ EQUIVALENT: 'EQUIVALENT', NOT_EQUIVALENT: 'NOT_EQUIVALENT', UNKNOWN: 'UNKNOWN' });

function rawAnswer(value) {
  return typeof value?.answer?.answer === 'string' ? value.answer.answer.normalize('NFC').trim() : JSON.stringify(value?.answer?.answer);
}

function evaluateEquivalence(candidates, question) {
  const details = candidates.map(candidate => ({ raw: rawAnswer(candidate), ...canonicalizeAnswer(candidate.answer, question) }));
  if (details.length !== 3 || details.some(item => !item.canonical)) {
    return { status: EQUIVALENCE_STATUS.UNKNOWN, method: 'typed_validation', details, falseDisagreementPrevented: false };
  }
  const canonicalValues = new Set(details.map(item => item.canonical));
  const rawValues = new Set(details.map(item => item.raw));
  if (canonicalValues.size === 1) {
    const deterministic = details.every(item => item.status === EQUIVALENCE_STATUS.EQUIVALENT) || rawValues.size === 1;
    return {
      status: deterministic ? EQUIVALENCE_STATUS.EQUIVALENT : EQUIVALENCE_STATUS.UNKNOWN,
      method: rawValues.size === 1 ? 'exact_typed_answer' : [...new Set(details.map(item => item.method))].join('+'),
      canonicalAnswer: details[0].canonical,
      details,
      falseDisagreementPrevented: deterministic && rawValues.size > 1
    };
  }
  const allUnknownText = details.every(item => item.method === 'exact_text');
  return {
    status: allUnknownText ? EQUIVALENCE_STATUS.UNKNOWN : EQUIVALENCE_STATUS.NOT_EQUIVALENT,
    method: allUnknownText ? 'unverified_free_text' : [...new Set(details.map(item => item.method))].join('+'),
    details,
    falseDisagreementPrevented: false
  };
}

module.exports = { EQUIVALENCE_STATUS, evaluateEquivalence };
