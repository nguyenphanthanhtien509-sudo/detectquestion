'use strict';

require('./lib/local-env').loadLocalEnv();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { AdaptiveDebateOrchestrator } = require('./lib/orchestrator');
const { validateSolveRequest } = require('./lib/contracts');
const { OpenAICompatibleProvider } = require('./lib/provider');
const { BACKWARD_GEMINI_MODELS, DEFAULT_BACKUP_POOLS, readFallbackPolicy } = require('./lib/fallback');

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function parseOrigins(value) {
  return new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean));
}

function parseJsonEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_) { return fallback; }
}

function parseJsonStringArrayEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : fallback;
  } catch (_) { return fallback; }
}

function parseBooleanEnv(name, fallback) {
  if (process.env[name] == null) return fallback;
  return String(process.env[name]).trim().toLowerCase() === 'true';
}

function createFileLogger(options = {}) {
  const enabled = options.enabled !== false;
  const logDir = path.resolve(options.logDir || process.env.ORCHESTRATOR_LOG_DIR || path.join(__dirname, 'logs'));
  let writable = enabled;
  if (writable) {
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) { writable = false; }
  }

  return (event, data = {}) => {
    if (!writable) return;
    const timestamp = new Date().toISOString();
    const filename = `adaptive-debate-${timestamp.slice(0, 10)}.log`;
    try {
      // Callers pass only redacted request summaries and result telemetry; never
      // send credentials, authorization headers, or image bytes to this sink.
      fs.appendFileSync(path.join(logDir, filename), `${JSON.stringify({ timestamp, event, ...data })}\n`, 'utf8');
    } catch (_) {
      // File logging must never make a solve request fail.
      writable = false;
    }
  };
}

function shortText(value, max = 160) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function boundedLogText(value, max = 500) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function debugQuestion(question) {
  return {
    type: question.type,
    titlePreview: shortText(question.title),
    titleLength: String(question.title || '').length,
    passageLength: String(question.passage || '').length || undefined,
    optionCount: question.options?.length,
    itemCount: question.items?.length,
    selects: question.selects?.map(select => ({ id: select.id, optionCount: select.options.length })),
    hasImage: !!(question.image || question.imageUrl)
  };
}

function safeLogValue(value, maxLength = 500) {
  if (typeof value === 'string') return boundedLogText(value, maxLength);
  if (Array.isArray(value)) return value.slice(0, 8).map(item => safeLogValue(item, maxLength));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, safeLogValue(item, maxLength)]));
  return value == null || ['number', 'boolean'].includes(typeof value) ? value : null;
}

function backwardLogSummary(backward = {}) {
  const satisfied = Array.isArray(backward.satisfiedRequirements) ? backward.satisfiedRequirements.length : Number(backward.satisfiedRequirementCount) || 0;
  const violated = Array.isArray(backward.violatedRequirements) ? backward.violatedRequirements.length : Number(backward.violatedRequirementCount) || 0;
  const unchecked = Array.isArray(backward.uncheckedRequirements) ? backward.uncheckedRequirements.length : Number(backward.uncheckedRequirementCount) || 0;
  return {
    model: shortText(backward.model, 256) || null,
    candidateAnswer: safeLogValue(backward.candidateAnswer),
    backwardStatus: backward.backwardStatus || backward.status || 'UNAVAILABLE',
    latencyMs: Number.isFinite(backward.latencyMs) ? backward.latencyMs : null,
    checkedRequirementCount: satisfied + violated,
    satisfiedRequirementCount: satisfied,
    violatedRequirementCount: violated,
    uncheckedRequirementCount: unchecked,
    suggestedReevaluation: backward.suggestedReevaluation === true,
    explanation: boundedLogText(backward.explanation, 500) || null,
    responseStatus: shortText(backward.responseStatus, 96) || null,
    failureCode: shortText(backward.failureCode, 96) || null
  };
}

function backwardLogDetail(backward = {}) {
  return {
    ...backwardLogSummary(backward),
    reconstructedConsequences: safeLogValue(backward.reconstructedConsequences, 500) || [],
    satisfiedRequirements: safeLogValue(backward.satisfiedRequirements, 500) || [],
    violatedRequirements: safeLogValue(backward.violatedRequirements, 400) || [],
    uncheckedRequirements: safeLogValue(backward.uncheckedRequirements, 500) || [],
    missingAssumptions: safeLogValue(backward.missingAssumptions, 500) || [],
    counterexamples: safeLogValue(backward.counterexamples, 500) || []
  };
}

function projectPipelineEvent(event, detailedBackwardLogging) {
  if (event?.type !== 'backward_result' && event?.type !== 'backward_error') return event;
  return { ...event, backward: detailedBackwardLogging && event.type === 'backward_result' ? backwardLogDetail(event.backward) : backwardLogSummary(event.backward) };
}

function readJson(request, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, content = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > limit) {
        reject(Object.assign(new Error('Request body exceeds limit.'), { statusCode: 413 }));
        request.destroy();
      } else content += chunk;
    });
    request.on('end', () => {
      try { resolve(JSON.parse(content)); } catch (_) { reject(Object.assign(new Error('Malformed JSON.'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}

class SlidingWindowRateLimiter {
  constructor(limit = 20, windowMs = 60_000) { this.limit = limit; this.windowMs = windowMs; this.entries = new Map(); }
  take(key) {
    const now = Date.now();
    const recent = (this.entries.get(key) || []).filter(value => now - value < this.windowMs);
    if (recent.length >= this.limit) { this.entries.set(key, recent); return false; }
    recent.push(now); this.entries.set(key, recent); return true;
  }
}

function createServer(options = {}) {
  const authToken = options.authToken ?? process.env.ORCHESTRATOR_AUTH_TOKEN;
  if (!authToken && !options.allowUnauthenticatedForTests) throw new Error('ORCHESTRATOR_AUTH_TOKEN must be configured.');
  const allowedOrigins = options.allowedOrigins || parseOrigins(process.env.ORCHESTRATOR_ALLOWED_ORIGINS);
  const maxConcurrent = Number(options.maxConcurrent || process.env.ORCHESTRATOR_MAX_CONCURRENT || 8);
  const debugEnabled = options.debug ?? String(process.env.ORCHESTRATOR_DEBUG_LOGGING || '').toLowerCase() === 'true';
  const detailedBackwardLogging = debugEnabled && (options.detailedBackwardLogging ?? parseBooleanEnv('ORCHESTRATOR_DETAILED_BACKWARD_LOGGING', false));
  const fileLogger = options.fileLogger || createFileLogger({
    enabled: options.fileLogging ?? parseBooleanEnv('ORCHESTRATOR_FILE_LOGGING', true),
    logDir: options.logDir
  });
  const debug = (event, data = {}) => {
    fileLogger(event, data);
    if (!debugEnabled) return;
    // Never pass credentials, authorization headers, or full image data here.
    console.log(`[adaptive-debate] ${event} ${JSON.stringify(data)}`);
  };
  const rateLimiter = options.rateLimiter || new SlidingWindowRateLimiter(Number(process.env.ORCHESTRATOR_RATE_LIMIT || 20));
  const transport = options.transport || process.env.AI_TRANSPORT || 'direct';
  if (!options.provider && !['direct', 'esp32'].includes(transport)) throw new Error('AI_TRANSPORT must be direct or esp32.');
  const forwardProvider = options.provider || (transport === 'esp32'
    ? new (require('./lib/esp32-usb-provider').Esp32UsbProvider)()
    : new OpenAICompatibleProvider());
  // Backward uses the same Gemini-compatible backend and credentials as the
  // forward slots. There is no OpenAI model/provider path in production.
  const backwardProvider = options.backwardProvider || forwardProvider;
  const backwardModels = options.backwardModels || parseJsonStringArrayEnv('ORCHESTRATOR_BACKWARD_GEMINI_MODELS', BACKWARD_GEMINI_MODELS);
  const configuredFallbackPools = options.fallbackPools || parseJsonEnv('ORCHESTRATOR_FALLBACK_POOLS', undefined);
  // Preserve all per-slot Gemini recovery pools. The Gemini Backward override
  // must not erase initial/critic/schema-repair pools, otherwise a timed-out
  // initial solver has no eligible fallback and fails the whole round early.
  const fallbackPools = {
    ...DEFAULT_BACKUP_POOLS,
    ...(configuredFallbackPools || {}),
    backward: configuredFallbackPools?.backward || backwardModels.slice(1)
  };
  const orchestrator = options.orchestrator || new AdaptiveDebateOrchestrator({
    provider: forwardProvider,
    backwardProvider,
    backwardProviderName: 'gemini',
    models: options.models || String(process.env.ORCHESTRATOR_MODELS || 'gemini-3.8-flash,gemini-2.5-flash,gemini-2.5-flash-lite').split(',').map(item => item.trim()).filter(Boolean),
    emergencyModel: options.emergencyModel || process.env.ORCHESTRATOR_EMERGENCY_MODEL || 'gemini-2.5-flash-lite',
    judgeModel: options.judgeModel || process.env.ORCHESTRATOR_JUDGE_MODEL,
    backwardModel: options.backwardModel || process.env.ORCHESTRATOR_BACKWARD_MODEL || backwardModels[0],
    backwardModels,
    maxSchemaRepairAttempts: options.maxSchemaRepairAttempts ?? process.env.ORCHESTRATOR_SCHEMA_REPAIR_ATTEMPTS,
    maxDebateRounds: options.maxDebateRounds ?? process.env.ORCHESTRATOR_MAX_DEBATE_ROUNDS,
    absoluteMaxDebateRounds: options.absoluteMaxDebateRounds ?? process.env.ORCHESTRATOR_ABSOLUTE_MAX_DEBATE_ROUNDS,
    minRemainingBudgetForRoundMs: options.minRemainingBudgetForRoundMs ?? process.env.ORCHESTRATOR_MIN_REMAINING_DEBATE_BUDGET_MS,
    stopOnValidatedConsensus: options.stopOnValidatedConsensus ?? parseBooleanEnv('ORCHESTRATOR_STOP_ON_VALIDATED_CONSENSUS', true),
    stopOnStableUnresolvedDisagreement: options.stopOnStableUnresolvedDisagreement ?? parseBooleanEnv('ORCHESTRATOR_STOP_ON_STABLE_UNRESOLVED', true),
    fallbackPolicy: options.fallbackPolicy || readFallbackPolicy(),
    fallbackPools,
    modelCapabilities: options.modelCapabilities || parseJsonEnv('ORCHESTRATOR_MODEL_CAPABILITIES', undefined),
    availableModels: options.availableModels || parseJsonStringArrayEnv('ORCHESTRATOR_AVAILABLE_MODELS', undefined)
  });
  const active = new Map();
  let inFlight = 0;

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.size && !allowedOrigins.has(origin)) return json(response, 403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (origin && allowedOrigins.has(origin)) response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, idempotency-key' });
      return response.end();
    }
    if (request.method !== 'POST') return json(response, 404, { error: 'NOT_FOUND' });
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return json(response, 415, { error: 'CONTENT_TYPE_REQUIRED' });
    const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (authToken && supplied !== authToken) return json(response, 401, { error: 'UNAUTHORIZED' });
    const subject = supplied || request.socket.remoteAddress || 'unknown';
    if (!rateLimiter.take(subject)) return json(response, 429, { error: 'RATE_LIMITED' });

    const cancel = request.url?.match(/^\/v1\/solve\/([^/]+)\/cancel$/);
    if (cancel) {
      const activeRequest = active.get(decodeURIComponent(cancel[1]));
      if (!activeRequest) return json(response, 404, { error: 'REQUEST_NOT_ACTIVE' });
      activeRequest.abort();
      return json(response, 202, { cancelled: true });
    }
    if (request.url !== '/v1/solve') return json(response, 404, { error: 'NOT_FOUND' });
    if (inFlight >= maxConcurrent) return json(response, 503, { error: 'QUEUE_OVERLOADED' });
    try {
      const body = validateSolveRequest(await readJson(request));
      debug('request.accepted', { requestId: body.requestId, mode: body.mode, question: debugQuestion(body.question) });
      const idempotencyKey = request.headers['idempotency-key'];
      if (!idempotencyKey || String(idempotencyKey).length > 128) return json(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
      if (active.has(body.requestId) || [...active.values()].some(entry => entry.idempotencyKey === idempotencyKey)) return json(response, 409, { error: 'DUPLICATE_IN_FLIGHT_REQUEST' });
      const controller = new AbortController();
      active.set(body.requestId, { abort: () => controller.abort(), idempotencyKey });
      inFlight += 1;
      const result = body.mode === 'single_model'
        ? await orchestrator.solveSingleModel(body, controller.signal, event => debug('pipeline', { requestId: body.requestId, ...projectPipelineEvent(event, detailedBackwardLogging) }))
        : await orchestrator.solve(body, controller.signal, event => debug('pipeline', { requestId: body.requestId, ...projectPipelineEvent(event, detailedBackwardLogging) }));
      debug('request.completed', {
        requestId: body.requestId, status: result.status, answer: result.answer,
        verification: result.verification, metrics: result.metrics, provenance: result.provenance
      });
      return json(response, 200, result);
    } catch (error) {
      debug('request.failed', { code: error.code || 'INVALID_REQUEST', message: shortText(error.message, 300) });
      return json(response, error.statusCode || 400, { error: error.code || 'INVALID_REQUEST', message: error.message });
    } finally {
      inFlight = Math.max(0, inFlight - 1);
      // Active request state is deliberately removed after completion: this is not an answer cache.
      for (const [requestId, entry] of active) if (entry.idempotencyKey === request.headers['idempotency-key']) active.delete(requestId);
    }
  });
  server.on('listening', () => {
    const address = server.address();
    debug('server.listening', {
      host: typeof address === 'object' && address ? address.address : null,
      port: typeof address === 'object' && address ? address.port : null
    });
  });
  return server;
}

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT || 8787);
  server.listen(port, '127.0.0.1', async () => {
    console.log(`Adaptive debate orchestrator listening on 127.0.0.1:${port}`);
    if (process.argv.includes('--standalone')) {
      try { await require('../desktop/StandaloneChromeController').launchStandaloneChrome(); }
      catch (error) { console.error(`[standalone] ${error.message}`); }
    }
  });
}

module.exports = { createFileLogger, createServer, projectPipelineEvent, SlidingWindowRateLimiter };
