'use strict';

const { canonicalAnswer, normalizeAnswer } = require('./contracts');

function sourceForParsing(question) { return [question?.title, question?.passage].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
function parseAddressBusWidth(source) { const match = source.match(/\b(\d+)\s*-?bit\s+address\s+bus\b/i); return match ? Number(match[1]) : null; }
function parseNetworkPrefix(source) {
  const slash = source.match(/\/(\s*)?(\d{1,2})\b/); if (slash) return Number(slash[2]);
  const named = source.match(/\b(?:network\s*(?:id|prefix)?|net(?:work)?\s*(?:id|prefix)?)\s*(?:length|size|bits?)?\s*(?:\([^)]*\))?\s*(?:is|=|:)?\s*(\d{1,2})\s*(?:-?bit|bits?)?\b/i);
  if (named) return Number(named[1]);
  const explicit = source.match(/\b(\d{1,2})\s*(?:-?bit)?\s*(?:network|net(?:work)?\s*(?:id|prefix)?|prefix)\b/i);
  return explicit ? Number(explicit[1]) : null;
}
function parseExtensionSpec(question) {
  const source = sourceForParsing(question); if (!/\b(?:sign[- ]?extend|zero[- ]?extend)\b/i.test(source)) return null;
  const bits = source.match(/\b([01]{2,128})\b/); const explicit = source.match(/\bfrom\s+(\d+)\s*-?bit\s+to\s+(\d+)\s*-?bit\b/i);
  const annotated = source.match(/\b([01]{2,128})\s*\(\s*(\d+)\s*-?bit(?:\s+binary)?\s*\)\s+to\s+(\d+)\s*-?bit\b/i);
  return { bits: annotated?.[1] || bits?.[1] || null, from: explicit ? Number(explicit[1]) : annotated ? Number(annotated[2]) : null, to: explicit ? Number(explicit[2]) : annotated ? Number(annotated[3]) : null, sign: /\bsign[- ]?extend\b/i.test(source) };
}
function parseBitPositionSpec(question) {
  const source = sourceForParsing(question);
  if (!/\bclear\b/i.test(source) || !/\bAND\b/i.test(source) || !/\b(?:hex|hexadecimal)\b/i.test(source)) return null;
  const widthMatch = source.match(/\b(8|16|32|64)\s*-?bit\b/i); const width = /\bbyte\b/i.test(source) ? 8 : (widthMatch ? Number(widthMatch[1]) : null);
  const lsbOne = /\bLSB\b[^.]{0,80}\b(?:1st|first|1-based)\b/i.test(source); const lsbZero = /\bLSB\b[^.]{0,80}\b(?:0th|zero|0-based)\b/i.test(source);
  const msbOne = /\bMSB\b[^.]{0,80}\b(?:1st|first|1-based)\b/i.test(source); const msbZero = /\bMSB\b[^.]{0,80}\b(?:0th|zero|0-based)\b/i.test(source);
  const listing = source.match(/\bclear\b[^.]{0,120}?\bbit(?:s)?(?:\s+positions?)?\s+(\d+(?:st|nd|rd|th)?(?:(?:\s*,\s*|\s+and\s+)\d+(?:st|nd|rd|th)?)*)/i);
  if (!width || !listing || [lsbOne, lsbZero, msbOne, msbZero].filter(Boolean).length !== 1) return null;
  const namedPositions = [...listing[1].matchAll(/\d+/g)].map(item => Number(item[0]));
  const positions = namedPositions.map(position => lsbOne ? position : lsbZero ? position + 1 : msbOne ? width - position + 1 : width - position);
  if (!positions.length || new Set(positions).size !== positions.length || positions.some(position => position < 1 || position > width)) return { ambiguous: true };
  return { width, positions, namedPositions, bitOrder: lsbOne || lsbZero ? 'LSB_FIRST' : 'MSB_FIRST', positionBase: lsbZero || msbZero ? 0 : 1, complete: true };
}

function optionForNumericValue(question, value) {
  if (question.type !== 'single_choice') return null;
  const option = question.options.find(item => {
    const match = String(item.text).trim().replace(',', '.').match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
    return match && Number(match[1]) === value;
  });
  return option ? { answer: option.key } : null;
}

function optionForText(question, value) {
  if (question.type !== 'single_choice') return null;
  const normalized = String(value).normalize('NFC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const option = question.options.find(item => item.text.normalize('NFC').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === normalized);
  return option ? { answer: option.key } : null;
}

function expectedAnswer(question, value) {
  if (question.type === 'short_answer') return { answer: value };
  return optionForText(question, value);
}

function sourceFor(question) { return [question.title, question.passage].filter(Boolean).join('\n').normalize('NFC'); }

function verifyNumberSystem(question) {
  const source = sourceFor(question);
  let value = null;
  let match = source.match(/\bconvert\s+(?:the\s+)?decimal\s+(\d+)\s+(?:to|into)\s+hex(?:adecimal)?\b/i) ||
    source.match(/\bconvert\s+(?:the\s+)?(\d+)\s+(?:from\s+)?decimal\s+(?:to|into)\s+hex(?:adecimal)?\b/i);
  if (match) value = BigInt(match[1]);
  if (value === null) {
    match = source.match(/\bconvert\s+([01]+)\s+(?:from\s+)?binary\s+(?:to|into)\s+hex(?:adecimal)?\b/i);
    if (match) value = BigInt(`0b${match[1]}`);
  }
  if (value === null) return { applicable: false };
  const answer = expectedAnswer(question, `0x${value.toString(16).toUpperCase()}`);
  return answer ? { applicable: true, verified: true, answer, evidence: 'Exact integer radix conversion.', rule: 'NumberSystemVerifier' } : { applicable: true, verified: false, reason: 'The converted value does not map to an allowed answer.' };
}

function verifySignExtension(question) {
  const source = sourceFor(question);
  if (!/\b(?:sign[- ]?extend|zero[- ]?extend)\b/i.test(source)) return { applicable: false };
  const spec = parseExtensionSpec(question);
  if (!spec?.bits || !spec.from || !spec.to) return { applicable: true, verified: false, reason: 'Extension source bits or source/target widths are missing.' };
  const { from, to, bits: binary } = spec;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to <= from || to > 128 || binary.length !== from) return { applicable: true, verified: false, reason: 'Extension widths do not match the supplied bit pattern.' };
  const original = BigInt(`0b${binary}`);
  const signExtension = spec.sign;
  const extended = signExtension && binary[0] === '1'
    ? original | (((1n << BigInt(to - from)) - 1n) << BigInt(from))
    : original;
  const answer = expectedAnswer(question, `0x${extended.toString(16).toUpperCase().padStart(Math.ceil(to / 4), '0')}`);
  return answer ? { applicable: true, verified: true, answer, evidence: `${signExtension ? 'Sign' : 'Zero'} extension with explicit ${from}-bit to ${to}-bit width.`, rule: 'SignExtensionVerifier' } : { applicable: true, verified: false, reason: 'The extended value does not map to an allowed answer.' };
}

function verifyMemoryCapacity(question) {
  const source = sourceFor(question);
  if (!/\b(?:memory\s+capacity|address\s+bus|8086)\b/i.test(source)) return { applicable: false };
  const width = parseAddressBusWidth(source);
  const byteAddressable = /\bbyte[- ]addressable\b/i.test(source);
  if (!width || !byteAddressable) return { applicable: true, verified: false, reason: 'Address-bus width or byte-addressable unit is missing.' };
  if (!Number.isInteger(width) || width < 1 || width > 63) return { applicable: true, verified: false, reason: 'Address-bus width is outside the supported exact range.' };
  const bytes = 1n << BigInt(width);
  const value = width >= 20 && (width - 20) % 10 === 0 ? `${1n << BigInt((width - 20) / 10)} MiB` : `${bytes} bytes`;
  const answer = expectedAnswer(question, value);
  return answer ? { applicable: true, verified: true, answer, evidence: `Byte-addressable memory with ${width} address bits has exactly 2^${width} addressable bytes.`, rule: 'MemoryAddressVerifier' } : { applicable: true, verified: false, reason: 'The capacity does not map to an allowed answer.' };
}

const REGISTER_ALIASES = Object.freeze({
  AL: ['A', 0, 8], AH: ['A', 8, 8], AX: ['A', 0, 16], EAX: ['A', 0, 32],
  BL: ['B', 0, 8], BH: ['B', 8, 8], BX: ['B', 0, 16], EBX: ['B', 0, 32],
  CL: ['C', 0, 8], CH: ['C', 8, 8], CX: ['C', 0, 16], ECX: ['C', 0, 32],
  DL: ['D', 0, 8], DH: ['D', 8, 8], DX: ['D', 0, 16], EDX: ['D', 0, 32],
  SI: ['SI', 0, 16], ESI: ['SI', 0, 32], DI: ['DI', 0, 16], EDI: ['DI', 0, 32]
});

function registerValue(state, register) {
  const alias = REGISTER_ALIASES[register];
  if (!alias) return null;
  return (state[alias[0]] >> BigInt(alias[1])) & ((1n << BigInt(alias[2])) - 1n);
}

function writeRegister(state, register, value) {
  const alias = REGISTER_ALIASES[register];
  if (!alias || value < 0n || value >= (1n << BigInt(alias[2]))) return false;
  const [base, offset, width] = alias;
  const fieldMask = ((1n << BigInt(width)) - 1n) << BigInt(offset);
  state[base] = ((state[base] || 0n) & ~fieldMask) | (value << BigInt(offset));
  return true;
}

function parseImmediate(text) {
  if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text);
  if (/^[0-9][0-9a-f]*h$/i.test(text)) return BigInt(`0x${text.slice(0, -1)}`);
  return null;
}

function verifyRegisterTrace(question) {
  const source = sourceFor(question);
  const instructions = [...source.matchAll(/\b([A-Za-z]{2,8})\s+([A-Za-z][A-Za-z0-9]*)\s*,\s*(0x[0-9a-f]+|[0-9][0-9a-f]*h|[A-Za-z][A-Za-z0-9]*)\b/ig)];
  const targetMatch = source.match(/\b(?:final\s+)?(?:value\s+of|what\s+is|find|determine|giá\s*trị\s*của)\s+(AL|AH|AX|EAX|BL|BH|BX|EBX|CL|CH|CX|ECX|DL|DH|DX|EDX|SI|ESI|DI|EDI)\b/i);
  if (!instructions.length || !targetMatch) return { applicable: false };
  if (instructions.some(item => item[1].toUpperCase() !== 'MOV')) return { applicable: true, verified: false, reason: 'Register trace contains an instruction outside the sandboxed MOV subset.' };
  const state = Object.fromEntries(['A', 'B', 'C', 'D', 'SI', 'DI'].map(key => [key, 0n]));
  for (const instruction of instructions) {
    const destination = instruction[2].toUpperCase(); const operand = instruction[3].toUpperCase();
    if (!REGISTER_ALIASES[destination]) return { applicable: true, verified: false, reason: 'Unsupported destination register in MOV trace.' };
    const immediate = parseImmediate(operand);
    const value = immediate === null ? registerValue(state, operand) : immediate;
    if (value === null || !writeRegister(state, destination, value)) return { applicable: true, verified: false, reason: 'MOV operand width or register alias is unsupported.' };
  }
  const target = targetMatch[1].toUpperCase();
  const value = registerValue(state, target);
  const width = REGISTER_ALIASES[target][2];
  const answer = expectedAnswer(question, `0x${value.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0')}`);
  return answer ? { applicable: true, verified: true, answer, evidence: `Sandboxed MOV-only register trace for ${target}.`, rule: 'RegisterTraceVerifier' } : { applicable: true, verified: false, reason: 'The traced register value does not map to an allowed answer.' };
}

function verifyE3M4(question) {
  const source = [question.title, question.passage].filter(Boolean).join('\n');
  if (!/\be\s*3\s*m\s*4\b/i.test(source)) return { applicable: false };
  const bias = /\bbias\s*(?:=|:|is|of)\s*3\b/i.test(source) && !/\b(?:not|without|khÃ´ng)\s+(?:use\s+)?bias/i.test(source);
  const hidden = /implicit\s*(?:leading\s*)?1|hidden\s*(?:leading\s*)?(?:bit|1)|bit\s*1\s*(?:áº©n|ngáº§m)/i.test(source);
  const value = source.match(/\b(?:hex(?:adecimal)?\s*(?:value\s*)?(?:is|=|:)?\s*|0x)([0-9a-f]{2})h?\b/i);
  if (!bias || !hidden || !value) return { applicable: true, verified: false, reason: 'The numeric representation lacks an explicit convention.' };
  const byte = Number.parseInt(value[1], 16);
  const sign = (byte >> 7) & 1;
  const exponent = (byte >> 4) & 0x7;
  const mantissa = byte & 0xf;
  if (exponent === 7) return { applicable: true, verified: false, reason: 'Reserved exponent cannot be deterministically decoded.' };
  const decoded = (sign ? -1 : 1) * (exponent === 0 ? mantissa / 16 * 2 ** -2 : (1 + mantissa / 16) * 2 ** (exponent - 3));
  const expected = question.type === 'short_answer' ? { answer: String(decoded) } : optionForNumericValue(question, decoded);
  return expected ? { applicable: true, verified: true, answer: expected, evidence: 'Deterministic E3M4 calculation.', rule: 'E3M4Verifier' } : { applicable: true, verified: false, reason: 'Calculated value does not map to an allowed answer.' };
}

function sourceText(question) {
  return [question.title, question.passage, ...(question.options || []).map(item => item.text), ...(question.items || []).map(item => item.text)]
    .filter(value => typeof value === 'string')
    .join('\n')
    .normalize('NFC')
    .toLocaleLowerCase();
}

function assessEvidence(question, evidence) {
  const source = sourceText(question);
  return (Array.isArray(evidence) ? evidence : []).map(item => {
    const support = typeof item?.support === 'string' ? item.support.normalize('NFC').trim() : '';
    const normalized = support.toLocaleLowerCase();
    if (!support || support.length < 5) return { kind: 'insufficient', critical: false, support };
    if (source.includes(normalized)) return { kind: 'supplied_input', critical: false, support };
    if (/\b(?:calculate|calculation|derive|derived|therefore|because|mask|binary|hexadecimal)\b/i.test(support)) return { kind: 'derived', critical: false, support };
    if (/\b(?:the\s+)?(?:supplied|provided|given|question|passage|prompt|input)\s+(?:says|states|shows|contains|is)\b/i.test(support)) {
      return { kind: 'unsupported_supplied_input_claim', critical: true, support };
    }
    return { kind: 'external_or_unverified', critical: false, support };
  });
}

function maskForPrefix(width, prefix) {
  const allOnes = (1n << BigInt(width)) - 1n;
  return (allOnes << BigInt(width - prefix)) & allOnes;
}

function buildClearMask(width, positions) {
  if (!Number.isInteger(width) || width < 1 || width > 128) throw new Error('INVALID_BIT_WIDTH');
  if (!Array.isArray(positions) || new Set(positions).size !== positions.length) throw new Error('DUPLICATE_BIT_POSITION');
  let mask = (1n << BigInt(width)) - 1n;
  for (const position of positions) {
    if (!Number.isInteger(position) || position < 1 || position > width) throw new Error('INVALID_BIT_POSITION');
    mask &= ~(1n << BigInt(position - 1));
  }
  return mask;
}

function buildClearMaskByArray(width, positions) {
  if (!Number.isInteger(width) || width < 1 || width > 128) throw new Error('INVALID_BIT_WIDTH');
  if (!Array.isArray(positions) || new Set(positions).size !== positions.length || positions.some(position => !Number.isInteger(position) || position < 1 || position > width)) throw new Error('INVALID_BIT_POSITION');
  const bits = Array(width).fill('1');
  for (const position of positions) bits[width - position] = '0';
  return BigInt(`0b${bits.join('')}`);
}

function candidateMask(answer) {
  if (typeof answer?.answer !== 'string') return null;
  const text = answer.answer.trim();
  const hex = text.match(/0x([0-9a-f]+)\b/i) || text.match(/\b([0-9a-f]+)h\b/i);
  return hex ? BigInt(`0x${hex[1]}`) : null;
}

function validateClearMaskProperties(width, positions, mask) {
  const violations = [];
  if (mask < 0n || mask >= (1n << BigInt(width))) return [{ code: 'MASK_WIDTH_EXCEEDED', width }];
  const expectedZero = new Set(positions);
  for (let position = 1; position <= width; position += 1) {
    const actual = Number((mask >> BigInt(position - 1)) & 1n);
    const expected = expectedZero.has(position) ? 0 : 1;
    if (actual !== expected) violations.push({ code: expected ? 'UNREQUESTED_BIT_CLEARED' : 'REQUESTED_BIT_NOT_CLEARED', bitPosition: position, expected, actual });
  }
  if (width === 8) {
    for (let input = 0; input < 256; input += 1) {
      let expected = input;
      for (const position of positions) expected &= ~(1 << (position - 1));
      if ((input & Number(mask)) !== expected) { violations.push({ code: 'PROPERTY_CHECK_FAILED', input }); break; }
    }
  }
  return violations;
}

function verifyBitPositionMask(question, candidate) {
  const spec = parseBitPositionSpec(question);
  if (spec?.ambiguous) return { applicable: true, verified: false, reason: 'Bit positions are ambiguous or invalid.' };
  if (!spec || !spec.complete) return { applicable: false };
  const oracleA = buildClearMask(spec.width, spec.positions);
  const oracleB = buildClearMaskByArray(spec.width, spec.positions);
  if (oracleA !== oracleB) return { applicable: true, verified: false, reason: 'Independent mask construction disagreed.', rule: 'BitPositionMaskVerifier', oracleAgreement: false };
  const expected = { answer: `0x${oracleA.toString(16).toUpperCase().padStart(spec.width / 4, '0')}` };
  const mask = candidateMask(candidate.answer);
  const violations = mask == null ? [{ code: 'MASK_HEX_REQUIRED' }] : validateClearMaskProperties(spec.width, spec.positions, mask);
  return {
    applicable: true, verified: !violations.length, answer: normalizeAnswer(question, expected), evidence: `Two independent ${spec.width}-bit clear-mask constructions and constraint checks.`, rule: 'BitPositionMaskVerifier',
    oracleAgreement: true, propertyChecksPassed: !violations.length, propertyChecksFailed: violations.length, violations
  };
}

function verifyBitwiseMask(question) {
  const source = [question.title, question.passage].filter(Boolean).join('\n');
  const is32Bit = /\b32\s*-?bit\b/i.test(source);
  const prefix = parseNetworkPrefix(source);
  const requestsAnd = /\b(?:and|anding|bitwise\s+and)\b/i.test(source);
  const requiresHex = /\b(?:hex|hexadecimal)\b/i.test(source);
  const destination = source.match(/\b(?:from|in|register)\s+(EAX|EBX|ECX|EDX|ESI|EDI|EBP|ESP)\b/i) || source.match(/\b(EAX|EBX|ECX|EDX|ESI|EDI|EBP|ESP)\s+(?:register|stores|contains|holds)\b/i);
  if (!is32Bit || !Number.isInteger(prefix) || prefix < 0 || prefix > 32 || !requestsAnd || !requiresHex || !destination) return { applicable: false };
  const register = destination[1].toUpperCase();
  const expected = { answer: `AND ${register}, 0x${maskForPrefix(32, prefix).toString(16).toUpperCase().padStart(8, '0')}` };
  const answer = normalizeAnswer(question, expected);
  if (!answer) return { applicable: true, verified: false, reason: 'Unable to normalize the deterministic mask answer.' };
  return { applicable: true, verified: true, answer, evidence: `Deterministic 32-bit /${prefix} mask calculation.`, rule: 'BitwiseMaskVerifier' };
}

function verify(question, candidate) {
  const bitPosition = verifyBitPositionMask(question, candidate);
  const mask = bitPosition.applicable ? bitPosition : verifyBitwiseMask(question);
  const extension = mask.applicable ? mask : verifySignExtension(question);
  const numeric = extension.applicable ? extension : verifyNumberSystem(question);
  const trace = numeric.applicable ? numeric : verifyRegisterTrace(question);
  const memory = trace.applicable ? trace : verifyMemoryCapacity(question);
  const deterministic = memory.applicable ? memory : verifyE3M4(question);
  if (deterministic.applicable) {
    if (!deterministic.verified) return { independentVerification: false, deterministic, evidenceConflicts: [] };
    const expected = normalizeAnswer(question, deterministic.answer);
    const correct = canonicalAnswer(expected, question) === canonicalAnswer(candidate.answer, question);
    return {
      independentVerification: correct,
      deterministic,
      evidenceConflicts: correct ? [] : ['Candidate answer conflicts with deterministic verification.'],
      criticalEvidenceConflicts: correct ? [] : ['Candidate answer conflicts with deterministic verification.']
    };
  }
  const evidenceAssessment = assessEvidence(question, candidate.evidence);
  const critical = evidenceAssessment.filter(item => item.critical);
  return {
    independentVerification: false,
    deterministic: { applicable: false },
    evidenceAssessment,
    evidenceConflicts: critical.map(() => 'Evidence makes an unsupported claim about the supplied input.'),
    criticalEvidenceConflicts: critical.map(() => 'Evidence makes an unsupported claim about the supplied input.')
  };
}

// This is intentionally a recovery-only helper. It never replaces the normal
// three independent AI proposals; it may run only after they produced no valid
// candidate and only returns an answer that the same checker can verify.
function deriveVerifiedProof(question) {
  const probe = verify(question, { answer: { answer: null }, evidence: [] });
  const deterministic = probe.deterministic;
  if (!deterministic?.applicable || !deterministic.answer) return null;
  const normalized = normalizeAnswer(question, deterministic.answer);
  if (!normalized) return null;
  const candidate = { answer: normalized, evidence: [] };
  const checked = verify(question, candidate);
  if (!checked.independentVerification || (checked.criticalEvidenceConflicts || []).length) return null;
  return { candidate, verification: checked };
}

const VERIFIER_REGISTRY = Object.freeze([
  { id: 'BitPositionMaskVerifier', domains: ['BITWISE'], status: 'IMPLEMENTED', verify: verifyBitPositionMask },
  { id: 'BitwiseMaskVerifier', domains: ['BITWISE'], status: 'IMPLEMENTED', verify: verifyBitwiseMask },
  { id: 'SignExtensionVerifier', domains: ['NUMBER_SYSTEM'], status: 'IMPLEMENTED', verify: verifySignExtension },
  { id: 'NumberSystemVerifier', domains: ['NUMBER_SYSTEM'], status: 'PARTIALLY_SUPPORTED', verify: verifyNumberSystem },
  { id: 'RegisterTraceVerifier', domains: ['REGISTER_TRACE'], status: 'PARTIALLY_SUPPORTED', verify: verifyRegisterTrace },
  { id: 'MemoryAddressVerifier', domains: ['MEMORY_ADDRESSING'], status: 'PARTIALLY_SUPPORTED', verify: verifyMemoryCapacity },
  { id: 'E3M4Verifier', domains: ['NUMBER_SYSTEM'], status: 'IMPLEMENTED', verify: verifyE3M4 }
]);

module.exports = {
  verify, verifyBitPositionMask, verifyBitwiseMask, verifySignExtension, verifyNumberSystem, verifyRegisterTrace, verifyMemoryCapacity,
  assessEvidence, buildClearMask, buildClearMaskByArray, deriveVerifiedProof, VERIFIER_REGISTRY
};
