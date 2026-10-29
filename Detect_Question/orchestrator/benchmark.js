'use strict';

// Offline harness. Supply a JSONL fixture with {request, expectedAnswer}; it
// intentionally reports NOT RUN unless an authorized provider is configured.
const fs = require('fs');
const path = require('path');

const fixture = process.argv[2] || path.join(__dirname, 'fixtures', 'benchmark.jsonl');
if (!fs.existsSync(fixture)) {
  console.log(JSON.stringify({ status: 'NOT_RUN', reason: 'No authorized benchmark fixture was supplied.', fixture }, null, 2));
  process.exit(0);
}
const rows = fs.readFileSync(fixture, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
console.log(JSON.stringify({ status: 'NOT_RUN', reason: 'Harness loaded fixtures; execute only with an authorized provider and ground-truth evaluation runner.', cases: rows.length, metrics: ['accuracy', 'falseAcceptanceRate', 'abstentionRate', 'agreementRate', 'recoveryRate', 'correctToIncorrectFlipRate', 'averageLatency', 'p95Latency', 'tokenConsumption', 'requestCount', 'costPerResolvedQuestion', 'timeoutRate', 'providerFailureRate'] }, null, 2));
