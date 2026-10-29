'use strict';

const DEFAULT_FALLBACK_POLICY = Object.freeze({
  initial: { primaryTimeoutMs: 12_000, backupTimeoutMs: 10_000, maxBackupAttempts: 2 },
  schemaRepair: { primaryTimeoutMs: 8_000, backupTimeoutMs: 8_000, maxBackupAttempts: 1 },
  critic: { primaryTimeoutMs: 12_000, backupTimeoutMs: 8_000, maxBackupAttempts: 2 },
  // Five Gemini models are available to the final verifier: one primary and
  // four ordered recovery candidates. Short bounded attempts are faster than
  // waiting for one slow model and still remain inside the shared deadline.
  backward: { primaryTimeoutMs: 7_000, backupTimeoutMs: 5_000, maxBackupAttempts: 4 },
  judge: { primaryTimeoutMs: 12_000, backupTimeoutMs: 8_000, maxBackupAttempts: 2 },
  globalRequestTimeoutMs: 45_000
});

const DEFAULT_BACKUP_POOLS = Object.freeze({
  initial: [
    ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash'],
    ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash'],
    ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.6-flash']
  ],
  critic: [
    ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash'],
    ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash'],
    ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.6-flash']
  ],
  schemaRepair: ['gemini-3.6-flash', 'gemini-3.7-flash'],
  backward: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
  judge: ['gemini-3.7-flash', 'gemini-3.6-flash']
});

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}

function readFallbackPolicy(env = process.env) {
  const stage = (name, prefix) => ({
    primaryTimeoutMs: boundedNumber(env[`ORCHESTRATOR_${prefix}_PRIMARY_TIMEOUT_MS`], DEFAULT_FALLBACK_POLICY[name].primaryTimeoutMs, 500, 60_000),
    backupTimeoutMs: boundedNumber(env[`ORCHESTRATOR_${prefix}_BACKUP_TIMEOUT_MS`], DEFAULT_FALLBACK_POLICY[name].backupTimeoutMs, 500, 60_000),
    maxBackupAttempts: boundedNumber(env[`ORCHESTRATOR_${prefix}_MAX_BACKUPS`], DEFAULT_FALLBACK_POLICY[name].maxBackupAttempts, 0, 4)
  });
  return {
    initial: stage('initial', 'INITIAL'),
    schemaRepair: stage('schemaRepair', 'SCHEMA_REPAIR'),
    critic: stage('critic', 'CRITIC'),
    backward: stage('backward', 'BACKWARD'),
    judge: stage('judge', 'JUDGE'),
    globalRequestTimeoutMs: boundedNumber(env.ORCHESTRATOR_GLOBAL_TIMEOUT_MS, DEFAULT_FALLBACK_POLICY.globalRequestTimeoutMs, 2_000, 120_000)
  };
}

function mergeFallbackPolicy(overrides = {}, base = DEFAULT_FALLBACK_POLICY) {
  const output = {};
  for (const name of ['initial', 'schemaRepair', 'critic', 'backward', 'judge']) {
    const source = overrides[name] || {};
    output[name] = {
      primaryTimeoutMs: boundedNumber(source.primaryTimeoutMs, base[name].primaryTimeoutMs, 500, 60_000),
      backupTimeoutMs: boundedNumber(source.backupTimeoutMs, base[name].backupTimeoutMs, 500, 60_000),
      maxBackupAttempts: boundedNumber(source.maxBackupAttempts, base[name].maxBackupAttempts, 0, 4)
    };
  }
  output.globalRequestTimeoutMs = boundedNumber(overrides.globalRequestTimeoutMs, base.globalRequestTimeoutMs, 2_000, 120_000);
  return output;
}

class ModelHealthTracker {
  constructor(options = {}) {
    this.limit = options.limit || 150;
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 60_000;
    this.minSamples = options.minSamples || 5;
    this.latencyLimit = options.latencyLimit || 40;
    this.items = new Map();
  }
  key(model, stage) { return `${stage || 'unknown'}:${model}`; }
  empty() {
    return {
      attemptCount: 0, successCount: 0, validResponseCount: 0, timeoutCount: 0, invalidResponseCount: 0, providerFailureCount: 0,
      consecutiveFailures: 0, lastFailureReason: null, latencies: [], averageLatencyMs: null, p50LatencyMs: null,
      p95LatencyMs: null, successRate: null, validJsonRate: null, openUntil: 0
    };
  }
  summarize(item) {
    const latencies = [...item.latencies].sort((a, b) => a - b);
    const percentile = ratio => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * ratio) - 1)] : null;
    const attemptCount = item.attemptCount;
    return {
      ...item,
      latencies,
      averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
      p50LatencyMs: percentile(0.5),
      p95LatencyMs: percentile(0.95),
      successRate: attemptCount ? item.successCount / attemptCount : null,
      validJsonRate: item.successCount ? item.validResponseCount / item.successCount : null
    };
  }
  get(model, stage) { return this.summarize(this.items.get(this.key(model, stage)) || this.empty()); }
  record(model, stage, outcome, latencyMs) {
    if (!model) return;
    const key = this.key(model, stage);
    const current = this.items.get(key) || this.empty();
    const failed = ['timeout', 'provider_error', 'provenance_error', 'invalid_response'].includes(outcome);
    const successful = outcome === 'valid' || outcome === 'invalid_response';
    const valid = outcome === 'valid';
    const latencies = Number.isFinite(latencyMs) && latencyMs >= 0 ? [...current.latencies, latencyMs].slice(-this.latencyLimit) : current.latencies;
    const next = {
      attemptCount: current.attemptCount + 1,
      successCount: current.successCount + (successful ? 1 : 0),
      validResponseCount: current.validResponseCount + (valid ? 1 : 0),
      timeoutCount: current.timeoutCount + (outcome === 'timeout' ? 1 : 0),
      invalidResponseCount: current.invalidResponseCount + (outcome === 'invalid_response' ? 1 : 0),
      providerFailureCount: current.providerFailureCount + (['provider_error', 'provenance_error'].includes(outcome) ? 1 : 0),
      consecutiveFailures: failed ? current.consecutiveFailures + 1 : 0,
      lastFailureReason: failed ? outcome : null,
      latencies,
      openUntil: 0
    };
    if (next.consecutiveFailures >= this.failureThreshold) next.openUntil = Date.now() + this.cooldownMs;
    this.items.delete(key); this.items.set(key, next);
    while (this.items.size > this.limit) this.items.delete(this.items.keys().next().value);
  }
  isOpen(model, stage) { return this.get(model, stage).openUntil > Date.now(); }
  isDegraded(model, stage) {
    const health = this.get(model, stage);
    if (health.attemptCount < this.minSamples) return false;
    const timeoutRate = health.timeoutCount / health.attemptCount;
    const invalidRate = health.invalidResponseCount / health.attemptCount;
    return timeoutRate >= 0.5 || invalidRate >= 0.5 || health.validJsonRate < 0.5;
  }
  rank(models, stage) {
    return models.map((model, index) => ({ model, index, health: this.get(model, stage) })).sort((left, right) => {
      const leftReady = left.health.attemptCount >= this.minSamples;
      const rightReady = right.health.attemptCount >= this.minSamples;
      if (leftReady !== rightReady) return leftReady ? -1 : 1;
      if (!leftReady) return left.index - right.index;
      const score = health => (health.validJsonRate * 0.55) + (health.successRate * 0.25) - ((health.timeoutCount / health.attemptCount) * 0.25) - ((health.providerFailureCount / health.attemptCount) * 0.2) - ((health.p95LatencyMs || 0) / 1_000_000);
      const delta = score(right.health) - score(left.health);
      return delta || left.index - right.index;
    }).map(item => item.model);
  }
  fitsLatencyBudget(model, stage, remainingMs) {
    const health = this.get(model, stage);
    return health.attemptCount < this.minSamples || health.p95LatencyMs == null || health.p95LatencyMs + 250 <= remainingMs;
  }
  snapshot() {
    return Object.fromEntries([...this.items.entries()].map(([key, item]) => {
      const { latencies, ...summary } = this.summarize(item);
      return [key, summary];
    }));
  }
}

function stageKey(stage) {
  if (stage === 'schema_repair' || stage === 'critic_schema_repair') return 'schemaRepair';
  return stage;
}

// The final verifier is Gemini-only. The first item is primary; remaining
// items are ordered fallbacks, never additional votes.
const BACKWARD_GEMINI_MODELS = Object.freeze(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']);

module.exports = { BACKWARD_GEMINI_MODELS, DEFAULT_BACKUP_POOLS, DEFAULT_FALLBACK_POLICY, ModelHealthTracker, mergeFallbackPolicy, readFallbackPolicy, stageKey };
