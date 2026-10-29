'use strict';

// Deterministic, non-AI ground truth.  Each generated answer is independently
// derived with integer arithmetic and exercised by the corresponding verifier.
function hex(value, digits = 0) { return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`; }

function buildGoldenDataset() {
  const records = [];
  for (let value = 0; value < 64; value += 1) records.push({
    id: `number-${value}`, domain: 'NUMBER_SYSTEM', question: { type: 'short_answer', title: `Convert decimal ${value} to hexadecimal.` }, answer: hex(BigInt(value)), deterministic: true
  });
  for (let value = 128; value < 160; value += 1) {
    const binary = value.toString(2).padStart(8, '0');
    records.push({ id: `sign-extension-${value}`, domain: 'NUMBER_SYSTEM', question: { type: 'short_answer', title: `Sign-extend ${binary} from 8-bit to 16-bit. Give hexadecimal output.` }, answer: hex(BigInt(value | 0xFF00), 4), deterministic: true });
  }
  const patterns = [[2], [3], [5], [2, 3], [2, 5], [3, 5], [2, 3, 5], [1, 8]];
  for (let index = 0; index < 32; index += 1) {
    const positions = patterns[index % patterns.length];
    let mask = 0xFF;
    for (const position of positions) mask &= ~(1 << (position - 1));
    records.push({ id: `clear-mask-${index}`, domain: 'BITWISE', question: { type: 'short_answer', title: `Write mask byte (in hex) to clear bits ${positions.join(', ')} with AND instruction (LSB is 1st bit).` }, answer: hex(BigInt(mask), 2), deterministic: true });
  }
  for (let index = 0; index < 32; index += 1) {
    const word = (0x1200 + index * 73) & 0xFFFF;
    const swapped = ((word & 0xFF) << 8) | (word >> 8);
    records.push({ id: `register-trace-${index}`, domain: 'REGISTER_TRACE', question: { type: 'short_answer', title: `MOV AX, ${word.toString(16).toUpperCase().padStart(4, '0')}h\nMOV BX, AX\nMOV CL, BH\nMOV CH, BL\nWhat is final value of CX in hexadecimal?` }, answer: hex(BigInt(swapped), 4), deterministic: true });
  }
  for (let width = 1; width <= 20; width += 1) {
    const answer = width === 20 ? '1 MiB' : `${1n << BigInt(width)} bytes`;
    records.push({ id: `memory-capacity-${width}`, domain: 'MEMORY_ADDRESSING', question: { type: 'short_answer', title: `A processor has a ${width}-bit address bus and byte-addressable memory. What is the memory capacity?` }, answer, deterministic: true });
  }
  for (let index = 0; index < 20; index += 1) records.push({
    id: `insufficient-bit-index-${index}`, domain: 'BITWISE', question: { type: 'short_answer', title: `Write an 8-bit hexadecimal mask to clear bits ${index % 4 + 1}, ${index % 4 + 3} using AND.` }, answer: null, deterministic: false
  });
  return records.map((record, index) => ({ ...record, split: index % 5 === 0 ? 'holdout' : 'development', groundTruthSource: 'INTEGER_OR_REGISTER_STATE_INVARIANT' }));
}

module.exports = { buildGoldenDataset };
