'use strict';

const SCHEMA_VERSION = 1;
const QUESTION_TYPES = new Set([
  'single_choice', 'multiple_choice', 'true_false_group', 'dropdown_select', 'multi_input', 'short_answer', 'image_vision'
]);
const TERMINAL_STATES = new Set([
  'AI_VERIFIED', 'VERIFIED', 'CONSENSUS_UNVERIFIED', 'UNRESOLVED', 'INVALID_RESPONSE',
  'MODEL_TIMEOUT', 'PROVIDER_ERROR', 'CANCELLED'
]);

function fail(message, code = 'INVALID_REQUEST') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, maxLength = 20000) {
  if (typeof value !== 'string') throw fail('Expected a string.');
  const result = value.normalize('NFC').trim();
  if (!result || result.length > maxLength) throw fail('String is empty or exceeds its size limit.');
  return result;
}

function validateQuestion(question) {
  if (!isPlainObject(question)) throw fail('question must be an object.');
  const type = cleanText(question.type, 64);
  if (!QUESTION_TYPES.has(type)) throw fail(`Unsupported question type: ${type}.`);
  const normalized = { type, title: cleanText(question.title || question.prompt || '', 30000) };
  if (question.passage != null) normalized.passage = cleanText(question.passage, 50000);
  if (question.image != null) {
    if (!isPlainObject(question.image)) throw fail('image must be an object.');
    const mimeType = cleanText(String(question.image.mimeType || ''), 32).toLowerCase();
    const data = cleanText(String(question.image.data || ''), 1_400_000);
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) throw fail('Unsupported image MIME type.');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw fail('image.data must be base64.');
    normalized.imageUrl = `data:${mimeType};base64,${data}`;
  } else if (question.imageUrl != null) {
    // Legacy compatibility only. New extension requests send image bytes in
    // the structured image field so the provider never receives localhost URLs.
    const imageUrl = cleanText(question.imageUrl, 2_000_000);
    if (/^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(imageUrl)) {
      throw fail('imageUrl must not point to localhost; send image bytes in question.image.');
    }
    normalized.imageUrl = imageUrl;
  }

  if (type === 'single_choice' || type === 'multiple_choice') {
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 20) {
      throw fail('Choice questions require 2–20 options.');
    }
    const optionKeys = new Set();
    normalized.options = question.options.map(option => {
      if (!isPlainObject(option)) throw fail('Each option must be an object.');
      const key = cleanText(String(option.key || ''), 32).toUpperCase();
      if (optionKeys.has(key)) throw fail('Option keys must be unique.');
      optionKeys.add(key);
      return { key, text: cleanText(String(option.text || ''), 10000) };
    });
  }

  if (type === 'true_false_group') {
    if (!Array.isArray(question.items) || question.items.length < 1 || question.items.length > 20) {
      throw fail('True/false questions require 1–20 items.');
    }
    const itemKeys = new Set();
    normalized.items = question.items.map(item => {
      if (!isPlainObject(item)) throw fail('Each true/false item must be an object.');
      const key = cleanText(String(item.key || ''), 32).toUpperCase();
      if (itemKeys.has(key)) throw fail('True/false item keys must be unique.');
      itemKeys.add(key);
      return { key, text: cleanText(String(item.text || ''), 10000) };
    });
  }

  if (type === 'dropdown_select') {
    if (!Array.isArray(question.selects) || question.selects.length < 1 || question.selects.length > 20) {
      throw fail('Dropdown questions require 1–20 select controls.');
    }
    const selectIds = new Set();
    normalized.selects = question.selects.map(select => {
      if (!isPlainObject(select)) throw fail('Each dropdown must be an object.');
      const id = cleanText(String(select.id || ''), 128);
      if (selectIds.has(id)) throw fail('Dropdown ids must be unique.');
      selectIds.add(id);
      if (!Array.isArray(select.options) || select.options.length < 1 || select.options.length > 100) {
        throw fail('Each dropdown requires 1–100 options.');
      }
      const values = new Set();
      return {
        id,
        label: typeof select.label === 'string' ? select.label.normalize('NFC').trim() : id,
        options: select.options.map(option => {
          const value = cleanText(String(option.value ?? option.text ?? ''), 10000);
          if (values.has(value)) throw fail('Dropdown option values must be unique.');
          values.add(value);
          return { value, text: cleanText(String(option.text ?? value), 10000) };
        })
      };
    });
  }

  if (type === 'multi_input') {
    if (!Array.isArray(question.fields) || question.fields.length < 2 || question.fields.length > 20) {
      throw fail('Multi-input questions require 2-20 fields.');
    }
    const fieldIds = new Set();
    normalized.fields = question.fields.map(field => {
      if (!isPlainObject(field)) throw fail('Each multi-input field must be an object.');
      const id = cleanText(String(field.id || ''), 128);
      if (fieldIds.has(id)) throw fail('Multi-input field IDs must be unique.');
      fieldIds.add(id);
      const kind = cleanText(String(field.kind || ''), 16);
      if (!['text', 'select'].includes(kind)) throw fail('Multi-input field kind must be text or select.');
      const normalizedField = { id, kind, label: typeof field.label === 'string' ? field.label.normalize('NFC').trim() : id };
      if (kind === 'select') {
        if (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 100) throw fail('Each select field requires 1-100 options.');
        const values = new Set();
        normalizedField.options = field.options.map(option => {
          const value = cleanText(String(option.value ?? option.text ?? ''), 10000);
          if (values.has(value)) throw fail('Select field option values must be unique.');
          values.add(value);
          return { value, text: cleanText(String(option.text ?? value), 10000) };
        });
      }
      return normalizedField;
    });
  }
  return normalized;
}

function validateSolveRequest(body) {
  if (!isPlainObject(body)) throw fail('Request body must be a JSON object.');
  if (body.schemaVersion !== SCHEMA_VERSION) throw fail(`schemaVersion must be ${SCHEMA_VERSION}.`);
  const requestId = cleanText(body.requestId, 128);
  if (!/^[A-Za-z0-9._:-]+$/.test(requestId)) throw fail('requestId has unsupported characters.');
  const mode = body.mode || 'adaptive_debate';
  if (!['adaptive_debate', 'single_model'].includes(mode)) throw fail('mode must be adaptive_debate or single_model.');
  return { schemaVersion: SCHEMA_VERSION, requestId, mode, question: validateQuestion(body.question) };
}

function normalizeAnswer(question, raw) {
  return normalizeAnswerDetailed(question, raw).answer;
}

function typedAnswerError(code, jsonPath, expectedType, actualValue) {
  return { code, jsonPath, expectedType, actualType: Array.isArray(actualValue) ? 'array' : actualValue === null ? 'null' : typeof actualValue };
}

function boundedNonEmptyText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

// Backward evidence may be terse text or a structured finding.  The provider
// prompt explicitly permits both forms, so accepting only strings made a
// semantically valid response fail with BACKWARD_STRING_LIST_INVALID.
function validBackwardFinding(value) {
  if (boundedNonEmptyText(value, 1_000)) return true;
  if (!isPlainObject(value) || Object.keys(value).length > 6) return false;
  const allowed = new Set(['requirement', 'observedConsequence', 'reason', 'support', 'conclusion', 'impact', 'whyUnresolved']);
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(key => allowed.has(key) && boundedNonEmptyText(value[key], 1_000)) &&
    keys.some(key => key === 'requirement' || key === 'conclusion' || key === 'support');
}

function normalizeAnswerDetailed(question, raw) {
  if (!isPlainObject(raw)) return { answer: null, error: typedAnswerError('ANSWER_OBJECT_REQUIRED', '$', 'object', raw) };
  if (question.type === 'single_choice') {
    if (typeof raw.answer !== 'string') return { answer: null, error: typedAnswerError('SINGLE_CHOICE_ANSWER_TYPE_INVALID', '$.answer', 'string option key', raw.answer) };
    const answer = raw.answer.trim().toUpperCase();
    return question.options.some(option => option.key === answer)
      ? { answer: { answer }, error: null }
      : { answer: null, error: typedAnswerError('SINGLE_CHOICE_OPTION_INVALID', '$.answer', 'one configured option key', raw.answer) };
  }
  if (question.type === 'multiple_choice') {
    if (!Array.isArray(raw.answer) || raw.answer.length === 0) return { answer: null, error: typedAnswerError('MULTIPLE_CHOICE_ANSWER_TYPE_INVALID', '$.answer', 'non-empty array', raw.answer) };
    if (!raw.answer.every(value => typeof value === 'string')) return { answer: null, error: typedAnswerError('MULTIPLE_CHOICE_ITEM_TYPE_INVALID', '$.answer[]', 'string option key', raw.answer) };
    const answer = [...new Set(raw.answer.map(value => value.trim().toUpperCase()))].sort();
    return answer.every(value => question.options.some(option => option.key === value))
      ? { answer: { answer }, error: null }
      : { answer: null, error: typedAnswerError('MULTIPLE_CHOICE_OPTION_INVALID', '$.answer', 'configured option keys only', raw.answer) };
  }
  if (question.type === 'true_false_group') {
    if (!isPlainObject(raw.answer)) return { answer: null, error: typedAnswerError('TRUE_FALSE_ANSWER_TYPE_INVALID', '$.answer', 'object', raw.answer) };
    const answer = {};
    for (const item of question.items) {
      const value = normalizeBoolean(raw.answer[item.key]);
      if (value === null) return { answer: null, error: typedAnswerError('TRUE_FALSE_VALUE_INVALID', `$.answer.${item.key}`, 'boolean or supported boolean alias', raw.answer[item.key]) };
      answer[item.key] = value;
    }
    const unknownKey = Object.keys(raw.answer).find(key => !question.items.some(item => item.key === key));
    if (unknownKey) return { answer: null, error: typedAnswerError('TRUE_FALSE_UNKNOWN_ITEM_ID', `$.answer.${unknownKey}`, 'configured item id', raw.answer[unknownKey]) };
    return { answer: { answer }, error: null };
  }
  if (question.type === 'dropdown_select') {
    if (!isPlainObject(raw.answer)) return { answer: null, error: typedAnswerError('DROPDOWN_ANSWER_TYPE_INVALID', '$.answer', 'object mapping select id to option value', raw.answer) };
    const answer = {};
    for (const select of question.selects) {
      if (!Object.prototype.hasOwnProperty.call(raw.answer, select.id)) return { answer: null, error: typedAnswerError('DROPDOWN_REQUIRED_SELECT_MISSING', `$.answer.${select.id}`, 'required select id', undefined) };
      if (typeof raw.answer[select.id] !== 'string') return { answer: null, error: typedAnswerError('DROPDOWN_OPTION_VALUE_TYPE_INVALID', `$.answer.${select.id}`, 'string option value', raw.answer[select.id]) };
      const value = raw.answer[select.id].normalize('NFC');
      if (!select.options.some(option => option.value === value)) return { answer: null, error: typedAnswerError('DROPDOWN_OPTION_VALUE_INVALID', `$.answer.${select.id}`, `one allowed option value for ${select.id}`, raw.answer[select.id]) };
      answer[select.id] = value;
    }
    const unknownKey = Object.keys(raw.answer).find(key => !question.selects.some(select => select.id === key));
    if (unknownKey) return { answer: null, error: typedAnswerError('DROPDOWN_UNKNOWN_SELECT_ID', `$.answer.${unknownKey}`, 'configured select id', raw.answer[unknownKey]) };
    return { answer: { answer }, error: null };
  }
  if (question.type === 'multi_input') {
    if (!isPlainObject(raw.answer)) return { answer: null, error: typedAnswerError('MULTI_INPUT_ANSWER_TYPE_INVALID', '$.answer', 'object mapping every field id', raw.answer) };
    const answer = {};
    for (const field of question.fields) {
      const value = raw.answer[field.id];
      if (typeof value !== 'string' || !value.normalize('NFC').trim()) return { answer: null, error: typedAnswerError('MULTI_INPUT_VALUE_INVALID', `$.answer.${field.id}`, 'non-empty string', value) };
      const normalizedValue = value.normalize('NFC').trim();
      if (field.kind === 'text' && (normalizedValue.length > 500 || /[\r\n]/.test(normalizedValue))) return { answer: null, error: typedAnswerError('MULTI_INPUT_TEXT_INVALID', `$.answer.${field.id}`, 'single-line string up to 500 characters', value) };
      if (field.kind === 'select' && !field.options.some(option => option.value === normalizedValue)) return { answer: null, error: typedAnswerError('MULTI_INPUT_SELECT_VALUE_INVALID', `$.answer.${field.id}`, 'configured option value', value) };
      answer[field.id] = normalizedValue;
    }
    const unknownKey = Object.keys(raw.answer).find(key => !question.fields.some(field => field.id === key));
    return unknownKey
      ? { answer: null, error: typedAnswerError('MULTI_INPUT_UNKNOWN_FIELD_ID', `$.answer.${unknownKey}`, 'configured field id', raw.answer[unknownKey]) }
      : { answer: { answer }, error: null };
  }
  // A structured answer object is valid for true/false and dropdown only.
  // Coercing one here would turn it into "[object Object]" and can fabricate
  // a critic consensus for a short-answer question.
  if (typeof raw.answer !== 'string') return { answer: null, error: typedAnswerError('SHORT_ANSWER_TYPE_INVALID', '$.answer', 'string', raw.answer) };
  const answer = raw.answer.normalize('NFC').trim();
  return answer && answer.length <= 500 && !/[\r\n]/.test(answer)
    ? { answer: { answer }, error: null }
    : { answer: null, error: typedAnswerError('SHORT_ANSWER_VALUE_INVALID', '$.answer', 'non-empty single-line string up to 500 characters', raw.answer) };
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const alias = value.normalize('NFC').trim().toLocaleLowerCase();
  if (['true', 't', 'yes', 'y', '1', 'đúng', 'dung'].includes(alias)) return true;
  if (['false', 'f', 'no', 'n', '0', 'sai'].includes(alias)) return false;
  return null;
}

function isAssemblyContext(question) {
  const source = [question?.title, question?.passage].filter(Boolean).join('\n');
  return /\b(?:assembly|instruction|opcode|register|immediate|hex(?:adecimal)?|bitwise|mask|\beax\b|\bebx\b|\becx\b|\bedx\b)\b/i.test(source);
}

function requiredAssemblyDialect(question) {
  const source = [question?.title, question?.passage].filter(Boolean).join('\n');
  if (/\bmasm\b/i.test(source)) return 'masm';
  if (/\b(?:nasm|gas|gnu\s+as)\b/i.test(source)) return 'nasm';
  return null;
}

function isHexadecimalContext(question) {
  const source = [question?.title, question?.passage].filter(Boolean).join('\n');
  return /\b(?:hex|hexadecimal|base\s*16|radix\s*16)\b/i.test(source);
}

function isNumericExpressionContext(question) {
  const source = [question?.title, question?.passage].filter(Boolean).join('\n');
  return /\b(?:calculate|compute|evaluate|numeric(?:al)?\s+(?:value|expression)|arithmetic|result\s+of|decimal|base\s*10|radix\s*10)\b/i.test(source) &&
    !/\b(?:round|decimal\s+places?|significant\s+figures?|precision)\b/i.test(source);
}

function parseAssemblyImmediate(value) {
  const source = String(value || '').trim();
  if (/^0x[0-9a-f]+$/i.test(source)) return BigInt(source);
  // MASM hexadecimal literals which begin A-F require a leading zero. This
  // prevents normal words ending in h from being treated as numbers.
  if (/^[0-9][0-9a-f]*h$/i.test(source)) return BigInt(`0x${source.slice(0, -1)}`);
  return null;
}

function canonicalAssembly(text, question) {
  if (!isAssemblyContext(question) || typeof text !== 'string') return null;
  const match = text.normalize('NFC').trim().match(/^([A-Za-z]{2,10})\s+([A-Za-z][A-Za-z0-9]{1,4})\s*,\s*(0x[0-9a-f]+|[0-9][0-9a-f]*h)$/i);
  if (!match) return null;
  const opcode = match[1].toUpperCase();
  const register = match[2].toUpperCase();
  const registerWidths = { AL: 8, AH: 8, BL: 8, BH: 8, CL: 8, CH: 8, DL: 8, DH: 8, AX: 16, BX: 16, CX: 16, DX: 16, EAX: 32, EBX: 32, ECX: 32, EDX: 32, RAX: 64, RBX: 64, RCX: 64, RDX: 64 };
  const bitWidth = registerWidths[register];
  const immediate = parseAssemblyImmediate(match[3]);
  if (!bitWidth || immediate === null || immediate < 0n || immediate >= (1n << BigInt(bitWidth))) return null;
  const dialect = requiredAssemblyDialect(question);
  if (dialect === 'masm' && !/h$/i.test(match[3])) return null;
  if (dialect === 'nasm' && !/^0x/i.test(match[3])) return null;
  return `assembly:${opcode}:${register}:immediate:${bitWidth}:${immediate.toString(16)}`;
}

function canonicalHexLiteral(text, question) {
  if (!isHexadecimalContext(question) || typeof text !== 'string') return null;
  const source = text.normalize('NFC').trim();
  const value = /^0x([0-9a-f]+)$/i.test(source) ? source.slice(2) : (/^[0-9a-f]+h$/i.test(source) ? source.slice(0, -1) : (/^[0-9a-f]+$/i.test(source) ? source : null));
  if (!value) return null;
  return `hex:${BigInt(`0x${value}`).toString(16)}`;
}

function parseNumericExpression(text) {
  if (typeof text !== 'string' || text.length > 200) return null;
  const tokens = text.match(/\s*(?:\d+(?:\.\d+)?|\.\d+|[()+\-*/])\s*/g);
  if (!tokens || tokens.join('').replace(/\s/g, '') !== text.replace(/\s/g, '')) return null;
  let position = 0;
  const next = () => tokens[position]?.trim();
  const consume = () => tokens[position++]?.trim();
  const expression = () => {
    let value = term();
    while (value !== null && ['+', '-'].includes(next())) {
      const op = consume(); const right = term();
      if (right === null) return null;
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };
  const term = () => {
    let value = factor();
    while (value !== null && ['*', '/'].includes(next())) {
      const op = consume(); const right = factor();
      if (right === null || (op === '/' && right === 0)) return null;
      value = op === '*' ? value * right : value / right;
    }
    return value;
  };
  const factor = () => {
    const token = next();
    if (token === '+' || token === '-') { consume(); const value = factor(); return value === null ? null : (token === '-' ? -value : value); }
    if (token === '(') { consume(); const value = expression(); return consume() === ')' ? value : null; }
    if (!token || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return null;
    consume(); return Number(token);
  };
  const value = expression();
  return position === tokens.length && Number.isFinite(value) ? value : null;
}

function canonicalizeAnswer(answer, question = null) {
  if (!answer) return { canonical: '', method: 'invalid', status: 'UNKNOWN' };
  if (Array.isArray(answer.answer)) return { canonical: `multiple:${[...answer.answer].sort().join('|')}`, method: 'typed_multiple_choice', status: 'EQUIVALENT' };
  if (answer.answer && typeof answer.answer === 'object') {
    return { canonical: `object:${Object.keys(answer.answer).sort().map(key => `${key}:${String(answer.answer[key])}`).join('|')}`, method: 'typed_mapping', status: 'EQUIVALENT' };
  }
  if (typeof answer.answer === 'string') {
    const assembly = canonicalAssembly(answer.answer, question);
    if (assembly) return { canonical: assembly, method: 'assembly_ast', status: 'EQUIVALENT' };
    const hex = canonicalHexLiteral(answer.answer, question);
    if (hex) return { canonical: hex, method: 'hex_literal', status: 'EQUIVALENT' };
    if (isNumericExpressionContext(question)) {
      const number = parseNumericExpression(answer.answer);
      if (number !== null) return { canonical: `number:${number}`, method: 'numeric_expression', status: 'EQUIVALENT' };
    }
    // Free text and code are intentionally case-sensitive. Do not turn an
    // unverified formatting similarity into semantic consensus.
    return { canonical: `text:${answer.answer.normalize('NFC').trim()}`, method: 'exact_text', status: 'UNKNOWN' };
  }
  return { canonical: '', method: 'invalid', status: 'UNKNOWN' };
}

function canonicalAnswer(answer, question = null) {
  return canonicalizeAnswer(answer, question).canonical;
}

function parseJsonObject(content) {
  if (typeof content !== 'string') return null;
  let source = content.trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) source = fenced[1].trim();
  try { return JSON.parse(source); } catch (_) {}
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

function parseJsonObjectDetailed(content, codePrefix) {
  if (typeof content !== 'string' || !content.trim()) return { value: null, error: typedAnswerError(`${codePrefix}_EMPTY_RESPONSE`, '$', 'non-empty JSON object string', content) };
  let source = content.trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) source = fenced[1].trim();
  try { return { value: JSON.parse(source), error: null }; } catch (_) {}
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return { value: null, error: typedAnswerError(`${codePrefix}_JSON_PARSE_ERROR`, '$', 'JSON object', content) };
  try { return { value: JSON.parse(match[0]), error: null }; } catch (_) { return { value: null, error: typedAnswerError(`${codePrefix}_JSON_PARSE_ERROR`, '$', 'JSON object', content) }; }
}

function parseInitialOutput(content, question) {
  return parseInitialOutputDetailed(content, question).value;
}

function parseInitialOutputDetailed(content, question) {
  const parsed = parseJsonObjectDetailed(content, 'INITIAL');
  if (parsed.error) return parsed;
  const value = parsed.value;
  if (!isPlainObject(value)) return { value: null, error: typedAnswerError('INITIAL_OBJECT_REQUIRED', '$', 'object', value) };
  if (value.questionType !== question.type) return { value: null, error: typedAnswerError('INITIAL_QUESTION_TYPE_INVALID', '$.questionType', question.type, value.questionType) };
  if (!Array.isArray(value.evidence)) return { value: null, error: typedAnswerError('INITIAL_EVIDENCE_REQUIRED', '$.evidence', 'array', value.evidence) };
  if (!Array.isArray(value.uncertainty)) return { value: null, error: typedAnswerError('INITIAL_UNCERTAINTY_REQUIRED', '$.uncertainty', 'array', value.uncertainty) };
  if (typeof value.needsVerification !== 'boolean') return { value: null, error: typedAnswerError('INITIAL_NEEDS_VERIFICATION_REQUIRED', '$.needsVerification', 'boolean', value.needsVerification) };
  if (value.evidence.length > 12 || !value.evidence.every(item => isPlainObject(item) && typeof item.claim === 'string' && typeof item.support === 'string')) return { value: null, error: typedAnswerError('INITIAL_EVIDENCE_INVALID', '$.evidence', 'up to 12 {claim:string,support:string} objects', value.evidence) };
  if (value.uncertainty.length > 12 || !value.uncertainty.every(item => typeof item === 'string')) return { value: null, error: typedAnswerError('INITIAL_UNCERTAINTY_INVALID', '$.uncertainty', 'up to 12 strings', value.uncertainty) };
  const normalized = normalizeAnswerDetailed(question, value);
  if (!normalized.answer) return { value: null, error: normalized.error };
  return { value: { answer: normalized.answer, evidence: value.evidence, uncertainty: value.uncertainty, needsVerification: value.needsVerification }, error: null };
}

function criticValidationError(code, jsonPath, expectedType, actualValue) {
  return { code, jsonPath, expectedType, actualType: Array.isArray(actualValue) ? 'array' : actualValue === null ? 'null' : typeof actualValue };
}

function parseCriticOutputDetailed(content, question, candidateIds) {
  const value = parseJsonObject(content);
  if (!isPlainObject(value)) return { value: null, error: criticValidationError('CRITIC_JSON_OBJECT_REQUIRED', '$', 'object', value) };
  if (!Array.isArray(value.critiques)) return { value: null, error: criticValidationError('CRITIC_CRITIQUES_REQUIRED', '$.critiques', 'array', value.critiques) };
  if (!Array.isArray(value.remainingUncertainty)) return { value: null, error: criticValidationError('CRITIC_UNCERTAINTY_REQUIRED', '$.remainingUncertainty', 'array', value.remainingUncertainty) };
  if (typeof value.changedAnswer !== 'boolean') return { value: null, error: criticValidationError('CRITIC_CHANGED_ANSWER_REQUIRED', '$.changedAnswer', 'boolean', value.changedAnswer) };
  const seen = new Set();
  for (const critique of value.critiques) {
    if (!isPlainObject(critique)) return { value: null, error: criticValidationError('CRITIC_ITEM_INVALID', '$.critiques[]', 'object', critique) };
    if (!candidateIds.includes(critique.candidateId) || seen.has(critique.candidateId)) return { value: null, error: criticValidationError('CRITIC_CANDIDATE_ID_INVALID', '$.critiques[].candidateId', 'unique known candidate id', critique.candidateId) };
    if (!['supported', 'contradicted', 'insufficient_evidence'].includes(critique.assessment)) return { value: null, error: criticValidationError('CRITIC_ASSESSMENT_INVALID', '$.critiques[].assessment', 'assessment enum', critique.assessment) };
    if (!(critique.issue === null || typeof critique.issue === 'string') || typeof critique.evidence !== 'string') return { value: null, error: criticValidationError('CRITIC_EVIDENCE_INVALID', '$.critiques[]', 'string evidence and nullable issue', critique) };
    seen.add(critique.candidateId);
  }
  if (seen.size !== candidateIds.length) return { value: null, error: criticValidationError('CRITIC_CANDIDATE_COVERAGE_INCOMPLETE', '$.critiques', `${candidateIds.length} candidates`, value.critiques) };
  if (!(value.changeReason === null || typeof value.changeReason === 'string') || (value.changedAnswer && !value.changeReason)) return { value: null, error: criticValidationError('CRITIC_CHANGE_REASON_INVALID', '$.changeReason', 'string when changedAnswer is true', value.changeReason) };
  if (!value.remainingUncertainty.every(item => typeof item === 'string')) return { value: null, error: criticValidationError('CRITIC_UNCERTAINTY_ITEM_INVALID', '$.remainingUncertainty[]', 'string', value.remainingUncertainty) };
  const normalized = normalizeAnswerDetailed(question, { answer: value.revisedAnswer });
  if (!normalized.answer) return {
    value: null,
    error: { ...criticValidationError('CRITIC_REVISED_ANSWER_INVALID', '$.revisedAnswer', `valid ${question.type} answer`, value.revisedAnswer), detail: normalized.error }
  };
  return { value: { answer: normalized.answer, critiques: value.critiques, changedAnswer: value.changedAnswer, changeReason: value.changeReason || null, remainingUncertainty: value.remainingUncertainty }, error: null };
}

function parseCriticOutput(content, question, candidateIds) {
  return parseCriticOutputDetailed(content, question, candidateIds).value;
}

function parseJudgeOutput(content, candidateIds) {
  const value = parseJsonObject(content);
  if (!isPlainObject(value) || !['INSUFFICIENT_EVIDENCE', 'SUPPORTED_CANDIDATE', 'CONFLICTING_EVIDENCE'].includes(value.assessment) || !Array.isArray(value.criticalIssues) || !Array.isArray(value.verifiedEvidence) || !Array.isArray(value.unresolvedConflicts) || !['UNRESOLVED', 'CONSENSUS_UNVERIFIED'].includes(value.recommendedStatus)) return null;
  if (value.supportedCandidate !== null && !candidateIds.includes(value.supportedCandidate)) return null;
  return value;
}

function parseBackwardOutputDetailed(content, question, candidate) {
  const parsed = parseJsonObjectDetailed(content, 'BACKWARD');
  if (parsed.error) return parsed;
  const value = parsed.value;
  if (!isPlainObject(value)) return { value: null, error: typedAnswerError('BACKWARD_OBJECT_REQUIRED', '$', 'object', value) };
  const required = ['candidateAnswer', 'backwardStatus', 'reconstructedConsequences', 'satisfiedRequirements', 'violatedRequirements', 'missingAssumptions', 'counterexamples', 'uncheckedRequirements', 'suggestedReevaluation', 'explanation'];
  if (required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return { value: null, error: typedAnswerError('BACKWARD_REQUIRED_FIELD_MISSING', '$', 'all backward fields', value) };
  if (!['MATCHED', 'CONTRADICTION_FOUND', 'INCONCLUSIVE'].includes(value.backwardStatus)) return { value: null, error: typedAnswerError('BACKWARD_STATUS_INVALID', '$.backwardStatus', 'backward verdict enum', value.backwardStatus) };
  const candidateAnswer = normalizeAnswer(question, { answer: value.candidateAnswer });
  if (!candidateAnswer || canonicalAnswer(candidateAnswer, question) !== canonicalAnswer(candidate.answer, question)) return { value: null, error: typedAnswerError('BACKWARD_CANDIDATE_MISMATCH', '$.candidateAnswer', 'the exact typed candidate answer', value.candidateAnswer) };
  const findingLists = ['reconstructedConsequences', 'satisfiedRequirements', 'missingAssumptions', 'counterexamples', 'uncheckedRequirements'];
  for (const key of findingLists) {
    if (!Array.isArray(value[key]) || value[key].length > 20 || !value[key].every(validBackwardFinding)) {
      return { value: null, error: typedAnswerError('BACKWARD_FINDING_LIST_INVALID', `$.${key}`, 'at most 20 non-empty strings or bounded structured findings', value[key]) };
    }
  }
  if (!Array.isArray(value.violatedRequirements) || value.violatedRequirements.length > 20 || !value.violatedRequirements.every(item => isPlainObject(item) && boundedNonEmptyText(item.requirement, 1_000) && boundedNonEmptyText(item.observedConsequence, 1_000) && boundedNonEmptyText(item.reason, 1_000))) return { value: null, error: typedAnswerError('BACKWARD_VIOLATION_INVALID', '$.violatedRequirements', 'at most 20 bounded violation objects', value.violatedRequirements) };
  if (typeof value.suggestedReevaluation !== 'boolean' || !boundedNonEmptyText(value.explanation, 2_000)) return { value: null, error: typedAnswerError('BACKWARD_EXPLANATION_INVALID', '$', 'boolean suggestion and explanation string up to 2000 characters', value) };
  if (value.backwardStatus === 'CONTRADICTION_FOUND' && value.violatedRequirements.length === 0) return { value: null, error: typedAnswerError('BACKWARD_CONTRADICTION_EVIDENCE_REQUIRED', '$.violatedRequirements', 'at least one concrete violation', value.violatedRequirements) };
  if (value.backwardStatus === 'MATCHED' && value.violatedRequirements.length) return { value: null, error: typedAnswerError('BACKWARD_MATCHED_WITH_VIOLATIONS', '$.violatedRequirements', 'empty list for MATCHED', value.violatedRequirements) };
  if (value.backwardStatus === 'MATCHED' && value.missingAssumptions.length) return { value: null, error: typedAnswerError('BACKWARD_MATCHED_WITH_MISSING_ASSUMPTIONS', '$.missingAssumptions', 'empty list for MATCHED', value.missingAssumptions) };
  if (value.backwardStatus === 'INCONCLUSIVE' && value.uncheckedRequirements.length === 0 && value.missingAssumptions.length === 0 && value.counterexamples.length === 0) return { value: null, error: typedAnswerError('BACKWARD_INCONCLUSIVE_EVIDENCE_REQUIRED', '$', 'unchecked requirement, missing assumption, or counterexample', value) };
  return { value: { ...value, candidateAnswer: candidateAnswer.answer }, error: null };
}

module.exports = {
  SCHEMA_VERSION, TERMINAL_STATES, canonicalAnswer, canonicalizeAnswer, canonicalAssembly, fail, normalizeAnswer, normalizeAnswerDetailed, parseCriticOutput, parseCriticOutputDetailed,
  parseInitialOutput, parseInitialOutputDetailed, parseJudgeOutput, parseBackwardOutputDetailed, validateSolveRequest
};
