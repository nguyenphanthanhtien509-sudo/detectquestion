# QUESTION DETECT V2 — IMPLEMENTATION RESULTS

Updated 2026-10-20. This is an implementation report based on local mocked-provider tests; it does not claim a paid/live-provider run.

## 1. Architecture Before

The backend depended on a Question Intelligence Router for domain/subtype classification, routing metadata, prompt context, telemetry, and an advisory semantic-arbitration path.

## 2. Architecture After

Active pipeline: `typed extraction → 3 independent Gemini slots → typed normalization/equivalence → bounded debate when needed → one Gemini backward review → final evidence gate → extension mapping`.

See `AdaptiveDebateOrchestrator.solve` in `orchestrator/lib/orchestrator.js`. A normal non-deterministic success uses four logical calls: three initial slots plus one backward call.

## 3. Removed Router Components

`orchestrator/lib/question-intelligence.js` was removed. There is no taxonomy, domain/subtype classifier, regex routing, primary-domain ranking, routing prompt context, router telemetry, or router-specific test.

## 4. Preserved Typed Contracts

`orchestrator/lib/contracts.js` preserves/validates question title, optional passage/image URL, choices, true/false items, dropdown IDs, actual option values, and option text. `AdaptiveDebateApiClient.toContractQuestion` transports these fields without domain transformation.

## 5. Independent Gemini Solving

`AdaptiveDebateOrchestrator` requires exactly three distinct logical models. `runInitialRound` runs in parallel; `acceptedConsensus` requires three valid responses from three distinct effective models. It never accepts 2/3. Initial prompts receive only the original typed question and answer schema.

## 6. Adaptive Debate Flow

If typed/canonical equivalence cannot establish 3/3 agreement, `runCriticRound` performs bounded evidence-guided review. Existing cancellation, deadline, schema repair, dynamic fallback, health tracking, and unresolved-judge behavior remain active.

## 7. Gemini Backward Reasoning Implementation

`runBackwardVerification` executes only after a non-null consensus candidate exists. `backwardMessages` supplies the original question, answer schema, and candidate answer—not solver answers, critic history, vote count, or consensus labels. It reconstructs consequences/assumptions from the candidate and compares them against the original requirements.

## 8. Backward Output Schema

`parseBackwardOutputDetailed` requires `candidateAnswer`, `backwardStatus`, `reconstructedConsequences`, `satisfiedRequirements`, `violatedRequirements`, `missingAssumptions`, `counterexamples`, `uncheckedRequirements`, `suggestedReevaluation`, and `explanation`.

Allowed statuses are `MATCHED`, `CONTRADICTION_FOUND`, and `INCONCLUSIVE`. Candidate mismatch, a contradiction with no concrete violation, and `MATCHED` with violations are rejected fail-closed.

## 9. Corrective Re-evaluation Policy

On `CONTRADICTION_FOUND`, concrete backward feedback triggers at most one corrective critic round. Its candidate must again pass typed validation, 3/3 consensus, and a second backward review. A second contradiction, no consensus, or insufficient budget ends `UNRESOLVED`; there is no unbounded loop.

## 10. Final Acceptance Policy

AI consensus plus backward `MATCHED` remains `CONSENSUS_UNVERIFIED`; it is not `VERIFIED`. `VERIFIED` still requires trusted deterministic evidence. `INCONCLUSIVE` and unavailable review are recorded without fabricated success. `finalDecision` exposes `eligibleForAutoApply` and `requiresManualReview`; `AdaptiveDebateApiClient.toLegacyResult` preserves them.

## 11. Legacy Code Removed

Removed the active router and semantic-arbitration path from `orchestrator/lib/orchestrator.js`, `orchestrator/lib/equivalence.js`, and `orchestrator/lib/fallback.js`. No replacement router was added. The Gemini-compatible provider, localhost bridge, authentication, CORS/rate limiting, idempotency, and manual-review clicker remain.

## 12. API Latency Optimizations

The three initial slots remain parallel. Backward review is one serialized call only after a candidate exists. `DEFAULT_FALLBACK_POLICY` and `DEFAULT_BACKUP_POOLS` provide bounded backward timeout/fallback using the existing configured Gemini pool; no new provider or model family is added.

## 13. Provider Error Handling

Backward review shares `AbortSignal`, global deadline, stage timeout, model-identity validation, bounded fallback, and circuit-breaker health tracking through `callSlot`. Error/timeout becomes `backwardVerification.status: "UNAVAILABLE"`, increments real metrics, and preserves solver provenance.

## 14. Modified Files

- `orchestrator/lib/orchestrator.js` — backward stage, corrective re-evaluation, decision flags.
- `orchestrator/lib/contracts.js` — strict backward contract.
- `orchestrator/lib/fallback.js` — backward timeout/pool; no semantic-arbitration policy.
- `orchestrator/lib/equivalence.js` — typed/canonical equivalence only.
- `orchestrator/server.js` — `ORCHESTRATOR_BACKWARD_MODEL` support.
- `src/content/solver/AdaptiveDebateApiClient.js` — manual-review decision fields.
- `tests/multi-agent-debate.test.js`, `tests/typed-question-contract.test.js`, `package.json` — regression coverage/entry point.

`dist/` was rebuilt from the updated source.

## 15. Deleted Files

- `orchestrator/lib/question-intelligence.js`
- `tests/question-intelligence.test.js`

## 16. Tests Executed

Executed locally on 2026-10-20:

```text
npm test
npm run build
git diff --check
```

The suite covers production hardening, audit, typed-question preservation, multi-agent/backward scenarios, and the 50-question Moodle KTMT fixture.

## 17. Tests Passed

All final commands passed. Backward tests cover `MATCHED`, `INCONCLUSIVE`, invalid/candidate-mismatched JSON, contradiction-driven correction, strict 3/3 consensus, fallback, and failure-closed behavior. Build regenerated `dist/` successfully.

## 18. Tests Failed

None in the final local run. No real provider request was made, so the result does not prove live endpoint/model compatibility.

## 19. Performance Measurements

No production latency or cost improvement is claimed. Mock normal-path behavior confirms four physical calls (3 initial + 1 backward). Runtime telemetry reports real backward calls, successes/failures/timeouts, contradictions, inconclusive results, corrective rounds, candidate changes, latency, attempts, tokens when provided, and wall duration.

## 20. Known Limitations

Backward reasoning can detect inconsistencies but is not a mathematical proof. Trusted deterministic verification stays intentionally narrow. Free-text equivalence is conservative. Real provider rate limits, model availability, and response quality need deployment monitoring.

## 21. Remaining Risks

Three logical slots reduce but cannot remove correlated model errors, especially during fallback. Backward review can be unavailable/inconclusive, leaving explicit unverified or unresolved output by policy. Browser/manual-review behavior and real endpoint credentials still need local integration checking; no secret is stored in this report.

# GEMINI BACKWARD REASONING OBSERVABILITY

## 1. Backward Execution Path

`AdaptiveDebateOrchestrator.completeConsensus` calls `runBackwardVerification` only after a typed 3/3 candidate exists. The same call path emits exactly one `backward_result` on validated success or one `backward_error` on failure; it does not make an extra provider request for logging.

## 2. Backward Response Contract

`parseBackwardOutputDetailed` in `orchestrator/lib/contracts.js` validates the existing backward object. It now also limits list entries to 20 strings of at most 1,000 characters, violation fields to the same size, and explanation to 2,000 characters.

## 3. Backward Verdict Schema

The supported model-reported verdicts remain `MATCHED`, `CONTRADICTION_FOUND`, and `INCONCLUSIVE`. The full validated record is retained at `result.backwardVerification`, including candidate answer, consequences, satisfied/violated/unchecked requirements, missing assumptions, counterexamples, explanation, and reevaluation recommendation.

## 4. New Structured Logging Events

`orchestrator/lib/orchestrator.js` emits:

- `backward_result` — a validated backward verdict.
- `backward_error` — provider, timeout, or validation failure; never a fabricated successful verdict.
- `backward_reevaluation` — one permitted corrective round starts.
- `backward_candidate_update` — the corrective round produced a distinct accepted candidate.

`orchestrator/server.js` attaches the request ID when it serializes each pipeline event.

## 5. Evidence and Explanation Fields

The detailed `backward_result` holds only model-supplied, contract-validated checkable findings: reconstructed consequences, satisfied requirements, violations, unchecked requirements, missing assumptions, counterexamples, concise explanation, and suggested reevaluation. These fields are explicitly AI-reported observations, not deterministic proof or hidden reasoning.

## 6. Contradiction Logging

For `CONTRADICTION_FOUND`, the event preserves every validated `violatedRequirements` object. The result summary reports the verdict, candidate, model, latency, checked/satisfied/violated/unchecked counts, short explanation, and reevaluation flag. A contradiction does not itself establish mathematical proof.

## 7. Corrective Round Logging

Before the bounded corrective critic pass, the backend emits `backward_reevaluation` with previous candidate, reason `CONTRADICTION_FOUND`, and round. When a new candidate passes typed consensus, it emits `backward_candidate_update`; a second backward event then records its actual verdict.

## 8. Final Response Integration

Every runtime result contains `verification.backward`, a compact final-completion summary, while the full details remain in `backwardVerification`. `MATCHED` remains distinct from `CONSENSUS_UNVERIFIED`; no observability field changes final acceptance semantics.

## 9. Privacy and Debug Controls

Default production pipeline/file logs contain only the bounded verdict summary. Detailed backward evidence is emitted to logs only when both `ORCHESTRATOR_DEBUG_LOGGING=true` and `ORCHESTRATOR_DETAILED_BACKWARD_LOGGING=true`; the latter is documented in `.env.example`. No prompt transcript, reasoning tokens, credentials, authorization headers, or image bytes are logged. Server-side projection caps detailed arrays at eight entries and detailed strings at 500 characters.

## 10. Performance Impact

Observability reuses the already parsed backward response and only performs bounded in-memory projection/JSON serialization. It adds no model, HTTP, retry, fallback, or timeout call. Normal non-deterministic success remains three initial provider calls plus one backward call.

## 11. Regression Tests

`tests/multi-agent-debate.test.js` now verifies successful structured event emission, `INCONCLUSIVE`, provider error without a false success event, contradiction/corrective events, final `verification.backward` summary, production summary redaction, debug-detail projection, bounded logging, and existing solver/debate/fallback behavior.

## 12. Files Changed

- `orchestrator/lib/contracts.js`
- `orchestrator/lib/orchestrator.js`
- `orchestrator/server.js`
- `.env.example`
- `tests/multi-agent-debate.test.js`
- `main.markdown`

## 13. Remaining Limitations

The evidence text remains model-generated and can be incomplete or wrong; it is intentionally labeled as a backward reviewer report, not independently verified proof. Detailed debug logs may contain candidate/evidence content and should be enabled only for authorized local diagnostics. Live provider behavior is not asserted by mocked regression tests.

# QUESTION DETECT V2 — RELIABILITY HARDENING

## 1. Executive Summary

Audited and hardened the AI-first pipeline without restoring the removed question router or adding domain-specific solvers. The fixes cover backward-schema consistency, corrective final acceptance, explicit missing-assumption handling, token metrics, canonical final metrics, and extension auto-apply enforcement.

## 2. Root Cause Analysis

- Backward evidence-list fields were validated as strings only, while the contract also needs to preserve checkable structured findings returned by a provider. This produced `BACKWARD_STRING_LIST_INVALID` for otherwise usable evidence objects.
- A corrected candidate could continue to the normal consensus return path after its own second backward call failed, even though it had no inherited verification.
- `reasoningTokens` was assigned from aggregate `totalTokens`, which is incorrect when the provider reports separate reasoning usage.
- The content runner considered `consensus` sufficient to fill an answer and did not enforce `finalDecision.eligibleForAutoApply`.

## 3. Backward Schema Fix

`parseBackwardOutputDetailed` now accepts bounded strings or bounded structured findings in non-violation evidence lists. Structured values may use only `requirement`, `observedConsequence`, `reason`, `support`, and `conclusion`, all with non-empty bounded text. Invalid objects still fail closed with a field-specific JSON path and expected type.

Both initial and second backward calls use the same `runBackwardVerification` parser and prompt. `MATCHED` is rejected when violations or missing assumptions are present; `INCONCLUSIVE` must retain an unchecked requirement, missing assumption, or counterexample.

## 4. Final Acceptance Fix

If the corrective candidate’s second backward call is unavailable, the result is now `UNRESOLVED`, contains no answer, requires manual review, and is ineligible for auto-apply. A corrected candidate only returns an answer after its own final acceptance path completes.

## 5. Missing Assumption Handling

The backward prompt explicitly distinguishes supplied facts from unstated conventions/initial state. It requires `missingAssumptions` plus `INCONCLUSIVE` when a unique answer depends on an unstated requirement. Final metrics expose `scopeAmbiguityDetected` and `missingInformationDetected` from validated backward evidence; no floating-point or assembly-specific production rule was added.

## 6. Debate & Fallback Optimization

Existing global deadline, bounded fallback, model-health, cancellation, and strict 3/3 consensus controls were audited and retained. No new provider calls, retries, models, or debate rounds were added. The corrective loop remains bounded to one corrective pass.

## 7. Canonicalization & Metrics Fix

The final response now projects its canonical answer into `metrics.canonicalAnswer` whenever an answer is accepted. Metrics separately report `promptTokens`, `completionTokens`, `reasoningTokens`, and `totalTokens`; reasoning usage is read only from provider-reported reasoning metadata and is `null` when absent. It is never copied from total usage.

## 8. Extension Integration Audit

`ContinuousSolveRunner.canApplyResult` now requires all of: current request, backend consensus, and `eligibleForAutoApply === true`. Thus `CONSENSUS_UNVERIFIED`, `UNRESOLVED`, provider failures, and manual-review-only results cannot write into a Moodle control.

## 9. Regression Tests

Added mock-only regressions for structured backward findings, invalid nested objects, missing assumptions on `MATCHED`, corrective second-backward unavailability, accurate token metrics, and extension auto-apply eligibility. Existing tests retain strict typed dropdown mapping, fallback/deadline behavior, cancellation, and canonicalization coverage.

## 10. Performance Before / After

No production benchmark was run and no latency improvement is claimed. The changes add no HTTP call. Structured backward validation and final-decision checks are bounded in-memory operations; normal mock flow remains three initial calls plus one backward call.

## 11. Files Changed

- `orchestrator/lib/contracts.js` — structured backward evidence validation and verdict consistency.
- `orchestrator/lib/orchestrator.js` — fail-closed corrective acceptance, provider token metrics, final canonical metric, and assumption flags.
- `src/content/solver/ContinuousSolveRunner.js` — enforce backend auto-apply eligibility.
- `tests/multi-agent-debate.test.js` — backward/corrective/metrics regressions.
- `tests/production-hardening.test.js` — extension application-policy regression.
- `main.markdown` — this report.

## 12. Remaining Known Limitations

Mock tests cannot prove a live provider always obeys JSON instructions. Backward evidence is still AI-generated and does not constitute deterministic proof. `CONSENSUS_UNVERIFIED` is intentionally manual-review-only under the current safe policy.

## 13. Final Verification Status

Final local verification was run with `npm test`, `npm run build`, and `git diff --check`. The mocked suite covers the modified contracts and does not require credentials or a live API.

# QUESTION DETECT V2 — FINAL AI-FIRST PRODUCTION REPORT

## 1. Executive Summary

The active decision path is now AI-first only: typed extraction → three Gemini logical slots → strict 3/3 consensus → independent Gemini Backward → centralized `AI_VERIFIED` acceptance. Deterministic proof code remains as an isolated legacy utility for compatibility tests, but is not imported or invoked by the orchestrator.

## 2. Final AI-FIRST Architecture

Normal successful path has exactly four logical inference calls: three parallel initial slots and one Backward request. Debate runs only after disagreement. A contradiction can cause one bounded critic correction and one fresh Backward request for the new candidate.

## 3. Deterministic Verification Removal

Removed the `verification` module import, all `verify(...)` calls, deterministic early success, deterministic conflict veto, and provider-failure recovery from `orchestrator/lib/orchestrator.js`. `MemoryAddressVerifier`, bit-mask verifiers, sign-extension verifier, register trace verifier, and the registry no longer influence status, candidate selection, backward execution, metrics, or auto-apply.

## 4. Legacy Consumer Audit

Obsolete active metrics (`selectedVerifier`, `verifierProofStatus`, `deterministicCoverage`, and verifier applicability) were removed from orchestrator results. `VERIFIED` remains only as a non-authorizing legacy response value in the MV3 mapper; it cannot set `eligibleForAutoApply`.

## 5. Gemini Consensus Contract

`acceptedConsensus` still requires three valid logical slots and typed equivalence. Two-of-three, invalid output, timeout, and unresolved debate remain non-accepting paths.

## 6. Gemini Backward Final Verification

Backward is a separate provider request and receives the typed question and candidate—not solver votes/explanations. `MATCHED` is accepted only after the shared contract validates candidate identity and semantic consistency. It is an AI check, not an independent mathematical proof.

## 7. AI_VERIFIED Status and Metadata

`AI_VERIFIED` is now the only successful central status. It requires strict 3/3 consensus plus valid `MATCHED`; metadata reports `verificationMethod: GEMINI_BACKWARD` and `independentVerification: false`. `CONSENSUS_UNVERIFIED` remains manual-review-only.

## 8. Corrective Re-evaluation

One contradiction-triggered correction is bounded by existing deadline and round policy. The changed candidate emits `backward_candidate_update`, reaches fresh 3/3 consensus, and must pass a second Backward check. Unavailable/inconclusive/contradictory second checks never become `AI_VERIFIED`.

## 9. Final Acceptance Gate

`completeConsensus` is the sole success gate. It emits a real `final_acceptance` event only for `AI_VERIFIED`, including candidate, consensus, Backward status, method, and application eligibility.

## 10. Missing Assumptions

Validated `missingAssumptions` on `MATCHED` fail closed. Inconclusive reports require an unchecked requirement, missing assumption, or counterexample. This prevents unprovided floating-point conventions or register initial state from silently becoming facts.

## 11. Backward JSON Schema

Initial and corrective Backward calls share `parseBackwardOutputDetailed`. Bounded string or structured findings are preserved; malformed objects, candidate mismatches, invalid verdicts, contradictions without violations, and semantically inconsistent MATCHED reports are rejected.

## 12. Typed Normalization

Added regression checks showing decimal `12` canonicalizes to `number:12`, while hexadecimal `0x12` and `12h` canonicalize to `hex:12`. They are intentionally not equal. Existing assembly, dropdown, multiple-choice, textarea, and exact-text contracts are retained.

## 13. Debate and Fallback Optimization

The shared global deadline, abort propagation, bounded per-slot fallback, health tracking, and maximum debate/corrective limits remain active. Removed the now-dead `stopOnVerifiedEvidence` policy/configuration; no additional provider calls were added.

## 14. MV3 Extension Integration

The client recognizes `AI_VERIFIED`. The content runner additionally requires the backend's `eligibleForAutoApply === true`, current request identity, and consensus before filling a DOM control. Legacy `VERIFIED` can be displayed during migration but never grants application permission by itself.

## 15. Security Hardening

Existing loopback binding, token authentication, origin restrictions, body limit, concurrency ceiling, request isolation, cancellation, and redacted bounded logging were audited. No secret, authorization header, prompt transcript, or image bytes are added to logs.

## 16. Metrics and Logging

Metrics retain logical calls, physical attempts, fallbacks, schema repairs, backward counts/latency, debate rounds, timeouts, wall duration, and non-double-counted provider usage. Lifecycle logs now include `final_acceptance` only when a real AI acceptance occurs.

## 17. Regression Tests

Mock-only tests cover AI success, strict consensus, Backward invalid/missing-assumption paths, contradiction/correction, correction unavailable, fallback, deadlines, request security, token accounting, canonical decimal/hex behavior, final-acceptance event, and extension application policy.

## 18. 20-Question Test Results

The existing offline Moodle KTMT fixture test ran successfully: 50 extracted questions (`single=17`, `multiple=9`, `dropdown=13`, `short=11`). It validates fixture structure only; no live 20-question provider benchmark was run in this change.

## 19. Performance Before and After

No comparable production benchmark is available, so no latency/cost improvement is claimed. Actual mock success trace: 4 logical calls and 4 physical attempts (3 initial + 1 Backward). Deterministic short circuits were intentionally removed, so formerly short-circuited live questions will need the Backward call.

## 20. Files Changed

- `orchestrator/lib/orchestrator.js` — removes active deterministic verification; adds `AI_VERIFIED` central acceptance/event.
- `orchestrator/lib/contracts.js` — accepts the new terminal status; retains strict Backward contracts.
- `orchestrator/server.js` — removes obsolete deterministic-stop configuration.
- `src/content/solver/AdaptiveDebateApiClient.js` — maps `AI_VERIFIED` safely.
- `tests/multi-agent-debate.test.js` — updates architecture tests and adds acceptance/normalization coverage.
- `main.markdown` — this final report.

## 21. Remaining Risks

Live provider reliability, latency, and adherence to JSON schemas still require monitored deployment tests. Three Gemini slots and a Gemini Backward check reduce but do not eliminate correlated model mistakes. Backward remains AI-generated evidence, not deterministic proof.

## 22. Production Readiness Assessment

**CONDITIONALLY READY.** Offline test suite and extension build pass, input/logging controls are present, deterministic bypasses were removed, and final AI acceptance is centralized. Live credentials, provider behavior, and a real 20-question run remain required before classifying the deployment as fully READY.

# QUESTION DETECT V2 — PRODUCTION RELIABILITY FIX V3

## 1. Executive Summary

Hardened the bounded AI-first recovery path without restoring deterministic answer verification. The active pipeline now reserves request budget for Backward, emits explicit Backward timeout telemetry, and gives malformed Backward JSON one validated schema-only recovery pass.

## 2. Observed Runtime Failures

The supplied runtime cases showed 12-second primary Backward waits followed by fallback waits, plus malformed output that could not be recovered at the Backward stage. These are addressed as deadline/recovery issues; no live provider latency claim is made from mock tests.

## 3. Root Cause Analysis

The code already applied each call timeout against `deadlineAt`, but debate admission only used a fixed 10-second threshold and did not reserve the configured primary-plus-fallback Backward budget. Backward validation also had no schema-repair path, unlike initial and critic responses.

## 4. Backward Timeout Fix

`completeConsensus` now emits `backward_started`, and each real timeout emits `backward_timeout` with actual model, attempt, elapsed time, remaining budget, recovery decision, and the actual next fallback model. The existing AbortController cancels the timed-out provider request before a bounded fallback is considered.

## 5. Smart Fallback

Existing `callSlot` behavior is retained: valid verdicts stop retries; timeout/provenance/transient provider failures may use one configured fallback; 401/403 do not retry; cancellation and exhausted deadlines stop. Fallback selection continues to reject reserved, open-circuit, degraded, unsupported, and latency-incompatible models.

## 6. Global Deadline Management

`backwardReserveMs` is derived from the single fallback-policy source: configured Backward primary budget + at most one configured backup budget + validation margin. A debate round now starts only when its own minimum budget and this final-verification reserve remain. Each provider call still clamps its timeout to the shared absolute deadline.

## 7. Model Health & Circuit Breaker

The existing per-stage tracker records timeouts/invalid responses/provider errors, ranks recovery candidates, opens a temporary circuit after consecutive failures, and observes cooldown. The V3 changes reuse this mechanism rather than adding shared mutable request state.

## 8. Schema Repair Recovery

Malformed Backward content now gets one schema-only repair attempt under the existing schema-repair policy and global deadline. The repair receives the original question, exact candidate, bounded previous output, and validation error; it cannot change the candidate or fabricate `MATCHED`. Repair transport failure may use the configured schema-repair backup pool. Unrepairable output remains nonverified.

## 9. Backward Schema Validation

Both original and repaired output use the same authoritative `parseBackwardOutputDetailed` contract. Candidate mismatch, malformed evidence, missing required fields, unsupported assumptions on `MATCHED`, and semantic contradictions still fail closed.

## 10. Missing Assumptions

No change weakens missing-assumption behavior: a unique answer depending on missing convention/state must be `INCONCLUSIVE`; `MATCHED` with `missingAssumptions` is invalid.

## 11. Numeric Canonicalization

The prior decimal/hex repair remains covered: decimal `12` is `number:12`; hexadecimal `0x12` and `12h` are `hex:12`; they are not equivalent.

## 12. Adaptive Debate Optimization

Debate remains bounded and strict 3/3. Its new budget admission preserves final verification rather than spending the entire global deadline on critic rounds. No extra call is made on the normal successful path.

## 13. Corrective Re-evaluation

The existing one-round correction and second fresh Backward gate remain unchanged. A second Backward timeout, unavailable result, or non-MATCHED verdict cannot inherit the first candidate's acceptance.

## 14. Final Acceptance

Only 3/3 typed consensus plus validated Backward `MATCHED` emits `final_acceptance` and returns `AI_VERIFIED`. Timeout, repair failure, `INCONCLUSIVE`, and contradiction remain safe nonverified/unresolved outcomes.

## 15. Extension Integration

MV3 still requires `eligibleForAutoApply === true` and a current request before DOM application. The new backend events are server observability only; no key, provider response, or secret is sent to the content script.

## 16. Security Hardening

Loopback binding, auth, body limits, concurrent-request cap, cancellation, and redacted logging were preserved. New timeout telemetry uses bounded model/metrics fields only and contains no headers, credentials, raw prompts, or hidden reasoning.

## 17. Metrics & Observability

Backward repair contributes to schema-repair counts; fallback/timeout counters remain sourced from actual attempts. `backward_started`, `backward_timeout`, `backward_result`/`backward_error`, and `final_acceptance` are emitted only when the stage occurs.

## 18. Regression Tests

Added mocked tests for primary Backward timeout → healthy fallback → `AI_VERIFIED`, including timeout event/recovery metadata, and malformed Backward JSON → one schema repair → validated `AI_VERIFIED`. Existing tests cover fallback failure, second-Backward unavailability, deadline/cancellation, strict consensus, typed dropdowns, and auto-apply policy.

## 19. Performance Before / After

No equivalent live 15-request benchmark is available in the repository, so no before/after latency or SLO improvement is claimed. Actual mocked timeout recovery completes one 500 ms timeout plus one fallback, bounded by a 2 s global deadline. Normal mock success remains 4 logical calls (3 initial + 1 Backward).

## 20. Files Changed

- `orchestrator/lib/orchestrator.js` — Backward reserve, recovery telemetry, and bounded Backward schema repair.
- `tests/multi-agent-debate.test.js` — timeout-fallback and Backward schema-repair regressions.
- `.env.example` — documents existing shared timeout/fallback environment settings.
- `main.markdown` — this V3 report.

## 21. Remaining Risks

Provider abort behavior depends on the provider adapter honoring AbortSignal. A live provider may still timeout or rate-limit; bounded fallback cannot guarantee a verdict. The repository has no reproducible pre-change live 15-request data, so production latency claims remain intentionally absent.

## 22. Production Readiness

**CONDITIONALLY READY.** Offline suite confirms bounded primary timeout fallback, repair, strict acceptance, build, and safety contracts. A live run with the configured Key4U-compatible provider and actual Gemini model availability is still required for READY, together with the requested 15-question latency benchmark.

# OPENAI 5-MODEL BACKWARD ENGINE

## 1. Existing Gemini Backward Issues

Backward previously inherited the first Gemini forward model and Gemini fallback pool. That coupled final verification to forward-provider timeouts and made a Backward fallback capable of returning to Gemini.

## 2. New Architecture

Forward remains three independent configured Gemini slots. After strict 3/3 consensus, only the separate OpenAI-compatible Backward provider/pool performs the final AI verification. Corrective Gemini rounds remain unchanged; their new candidate returns to OpenAI Backward.

## 3. Five-Model OpenAI Pool

The production server defaults to this ordered eligible pool: `gpt-5.4-mini`, `gpt-4.1-mini`, `gpt-5.6-terra`, `gpt-6.1-sol`, `gpt-6-sol`. Default primary is `gpt-5.4-mini`; default recovery candidates are the remaining four. Policy still allows only one recovery attempt by default, not five sequential calls.

## 4. API Compatibility Audit

The existing `OpenAICompatibleProvider` Chat Completions transport is reused; no duplicate API client was created. Backward may use `BACKWARD_AI_PROVIDER_URL` and `BACKWARD_AI_PROVIDER_API_KEY`, otherwise it uses the existing backend transport configuration. Actual provider/model support was not live-tested because no authorized credentials/model-smoke run was supplied.

## 5. Adaptive Model Selection

The existing stage-specific health tracker ranks recovery candidates and rejects unsupported, reserved, circuit-open, degraded, and latency-incompatible models. Backward fallback is additionally filtered to `backwardModels`, preventing arbitrary fallback JSON from routing final verification to Gemini.

## 6. Timeout & Fallback Recovery

Backward retains one logical call with at most one configured fallback by default. Timeout, transient transport/provider error, and provenance mismatch may recover; valid `INCONCLUSIVE` and `CONTRADICTION_FOUND` are verdicts and never trigger a search for `MATCHED`.

## 7. Global Deadline

The V3 shared deadline and Backward reserve remain active. Every OpenAI attempt is clamped to the common deadline and uses AbortSignal. The fallback controller will not start an attempt after cancellation or deadline exhaustion.

## 8. Structured Output Validation

OpenAI Backward output uses the same strict parsed schema and candidate comparison as all prior Backward calls. Invalid JSON/schema gets only the bounded schema repair path; malformed output cannot become `MATCHED`.

## 9. Corrective Re-evaluation

OpenAI `CONTRADICTION_FOUND` triggers at most one Gemini corrective round. The corrected candidate requires fresh strict consensus and a second OpenAI Backward result; it inherits no prior verdict.

## 10. AI_VERIFIED Final Acceptance

Final acceptance now declares `verificationMethod: OPENAI_BACKWARD` and decision source `OPENAI_BACKWARD_MATCHED`. `independentVerification` remains false: cross-family AI review is not deterministic proof.

## 11. Provider and Token Metrics

Backward provenance now carries `provider: openai_compatible`, requested/actual model, attempt, request ID, response status, duration, usage, validation status, and fallback reason. Existing token accounting is unchanged and remains provider-reported only.

## 12. Performance Benchmarks

No live five-model benchmark was run: `npm run benchmark` reports `NOT_RUN` without an authorized fixture/provider. No p50/p95, timeout, cost, or model-validity numbers are fabricated.

## 13. Regression Results

Added offline coverage proving all five model aliases are configured, the fallback list is OpenAI-only, three Gemini forward calls remain unchanged, and `gpt-5.4-mini` is the Backward primary. Existing timeout-fallback, schema-repair, contradiction, strict-consensus, and MV3 safety regressions remain passing.

## 14. Files Changed

- `orchestrator/lib/fallback.js` — fixed OpenAI Backward pool and fallback order.
- `orchestrator/lib/orchestrator.js` — isolated Backward provider/model pool, OpenAI method metadata, provider provenance, and no-Gemini fallback filter.
- `orchestrator/server.js` — production OpenAI Backward provider/configuration and pool injection.
- `.env.example` — documented separate backend-only Backward provider configuration.
- `tests/multi-agent-debate.test.js` — OpenAI pool and Gemini-forward isolation test.
- `main.markdown` — this report.

## 15. Remaining Risks

Provider aliases are configuration, not a guarantee that Key4U currently serves each alias. The server safely marks unavailable/failed attempts but cannot verify live routing without credentials. No secret is placed in source or test output.

## 16. Production Readiness

**CONDITIONALLY READY.** Offline tests/build pass and production defaults are isolated as requested. Run a controlled one-request smoke test for each enabled alias, then the authorized benchmark, before declaring the actual five-model deployment READY.

# OPENAI BACKWARD — FALSE INCONCLUSIVE HARDENING

## Context Preservation

`backwardMessages` sends the complete typed `question` object, including title, passage, all option text/keys, true/false items, and dropdown labels/actual values, alongside the candidate and answer schema. Regression coverage verifies an IPv4 netID 20-bit title and its passage reach the raw Backward payload.

## Grounded Technical Conventions

The Backward system prompt now distinguishes established domain conventions from unsupported assumptions. It explicitly identifies IPv4/netID with an explicit 20-bit network ID as sufficient to establish the `/20` mask convention unless supplied context conflicts. This is prompt guidance only; it does not add a deterministic answer verifier.

## Material Ambiguity Rule

`INCONCLUSIVE` is instructed to occur only when omitted information can materially change the answer. A missing-assumption finding must state the missing fact, material impact, and why the supplied question/options do not resolve it. Structured findings can now use bounded `impact` and `whyUnresolved` fields.

## Bounded Second Opinion

For only a vague inconclusive claim (for example, an unspecified-convention assertion without impact), the orchestrator selects at most one unused healthy OpenAI Backward model when budget remains. It receives the original independent Backward prompt, not the first model's explanation or Gemini votes. A valid second `MATCHED` may pass final acceptance; valid material `INCONCLUSIVE` remains nonverified; contradiction continues through the existing corrective path. No automatic conversion occurs.

## Regression Evidence

Offline tests now cover: IPv4 `/20` context payload, false/vague INCONCLUSIVE → second opinion → `AI_VERIFIED`, and genuinely missing address-family context → single `INCONCLUSIVE` → `CONSENSUS_UNVERIFIED`. Existing missing-assumption, contradiction, timeout, correction, strict-consensus, and MV3 policy tests remain passing.

## Files Changed

- `orchestrator/lib/orchestrator.js` — context-aware prompt, bounded second-opinion routing, vague-ambiguity classifier.
- `orchestrator/lib/contracts.js` — bounded structured impact/reason fields for Backward findings.
- `tests/multi-agent-debate.test.js` — IPv4 context and genuine/false inconclusive regressions.
- `main.markdown` — this audit result.

## Remaining Risk

The vague-ambiguity classifier is intentionally conservative and lexical; it never turns the first verdict into success itself. Live review quality still depends on configured OpenAI aliases, so this remains **CONDITIONALLY READY** until monitored provider runs confirm false-inconclusive behavior.

# INITIAL SOLVER TIMEOUT RECOVERY

## Confirmed Root Cause

The OpenAI Backward-pool server wiring accidentally constructed `fallbackPools` with only a `backward` property. That replaced, rather than extended, `DEFAULT_BACKUP_POOLS`; consequently Initial A/B/C had no configured fallback candidates. A primary timeout therefore produced `fallbackCalls=0`, incomplete initial round, no Backward call, and an incorrect generic `EVIDENCE_CONFLICT` stop reason.

## Implementation

`orchestrator/server.js` now merges `DEFAULT_BACKUP_POOLS`, optional user overrides, and the isolated OpenAI Backward list. Initial and critic Gemini recovery pools are preserved. `callSlot` retains one logical slot per A/B/C: it preserves successful slot responses and only replaces the failed slot with an eligible, unreserved Gemini fallback.

## Strict Consensus and Final Acceptance

Fallback remains a replacement, not a fourth vote. Three logical slots must still validate and normalize to the same answer. Only then does the existing OpenAI Backward engine run; a valid `MATCHED` produces `AI_VERIFIED`. Failed recovery remains nonverified and never bypasses strict consensus.

## Telemetry

Initial fallback attempts now emit `initial_fallback_started` and `initial_fallback_completed` with slot ID, requested/actual model, attempt, remaining budget, status, validation result, and failure code. Incomplete initial rounds use `MODEL_TIMEOUT`, `RECOVERY_EXHAUSTED`, or `INCOMPLETE_ROUND` instead of incorrectly calling every timeout an `EVIDENCE_CONFLICT`.

## Regression Results

Mock tests verify Initial A, B, and C timeout independently; each performs exactly one slot fallback, preserves the two successful responses, reaches strict 3/3, invokes OpenAI Backward, and returns `AI_VERIFIED`. Existing fallback-failure, cancellation, deadline, no-duplicate-vote, typed normalization, Backward, and MV3 tests remain passing.

## Files Changed

- `orchestrator/server.js` — fixes fallback-registry merge root cause.
- `orchestrator/lib/orchestrator.js` — initial recovery telemetry and accurate incomplete-round reasons.
- `tests/multi-agent-debate.test.js` — A/B/C initial recovery and telemetry regression tests.
- `main.markdown` — this root-cause report.
# GEMINI-ONLY BACKWARD POOL

Backward no longer uses an OpenAI model pool or separate Backward provider credentials. It uses the same Gemini-capable backend and `AI_PROVIDER_API_KEY` as Forward.

The production pool contains five Gemini models in this exact order:

1. `gemini-3.6-flash` — primary
2. `gemini-3.7-flash` — fallback 1
3. `gemini-3.5-flash` — fallback 2
4. `gemini-2.5-flash` — fallback 3
5. `gemini-3.1-flash-lite` — fallback 4

Only one Backward model is ever a logical verifier for a request. The remaining four models are sequential recovery attempts after timeout, retryable provider failure, or model-identity failure; they are not extra votes and do not relax the strict 3/3 Forward consensus. Default time budgets are 7 seconds for the primary and 5 seconds per backup, bounded by the shared request deadline. Set `ORCHESTRATOR_BACKWARD_GEMINI_MODELS` only when overriding this entire pool.

---

# MOODLE QUESTION TYPE COMPATIBILITY AUDIT

Audit date: 2026-10-21. Scope: all nine supplied local Moodle fixtures and the
current DOM-to-answer-application implementation. This is a read/test audit;
no source code or fixture code was changed. Existing fixture tests are static
Node tests, not browser DOM end-to-end tests, so this report does not claim
unproven application coverage.

## 1. Fixture Inventory

All 9/9 fixtures exist and are readable. Question blocks are the real
Moodle-style `div.que#qN` blocks; IDs below are DOM IDs, not synthetic. The
per-question inventory is traceable in `tests/moodle-ktmt-*-fixture.test.js`:
each contract test asserts every contiguous `qN`, its displayed `.no`, `.qtext`,
control family/count, IDs/names/labels, and select option bindings.

| Fixture | IDs | Total | Radio single | Checkbox multi | Dropdown | Short answer* | Image questions | Table questions |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `moodle-ktmt-2019-exam.html` | q1-q45 | 45 | 10 | 12 | 12 | 11 | 7 | 0 |
| `moodle-ktmt-clc-2017.html` | q1-q53 | 53 | 15 | 20 | 12 | 6 | 9 | 12 |
| `moodle-ktmt-k15-de2.html` | q1-q45 | 45 | 10 | 12 | 16 | 7 | 2 | 0 |
| `moodle-ktmt-k15-exam.html` | q1-q45 | 45 | 10 | 14 | 14 | 7 | 3 | 0 |
| `moodle-ktmt-lopchan-2019.html` | q1-q45 | 45 | 10 | 11 | 14 | 10 | 5 | 0 |
| `moodle-ktmt-midterm-gk.html` | q1-q40 | 40 | 18 | 9 | 0 | 13 | 4 | 0 |
| `moodle-ktmt-quiz-clc-2017.html` | q1-q24 | 24 | 2 | 1 | 11 | 10 | 0 | 0 |
| `moodle-ktmt-quiz.html` | q1-q50 | 50 | 17 | 9 | 13 | 11 | 0 | 0 |
| `moodle-ktmt-thichung-2018.html` | q1-q42 | 42 | 10 | 13 | 12 | 7 | 1 | 12 |
| **Total** |  | **389** | **102** | **101** | **104** | **82** | **31** | **24** |

\* Short answer includes two actual `<textarea>` controls in
`moodle-ktmt-lopchan-2019.html`; all other free-answer controls are
`input[type=text]`.

Raw question-block scan found 148 radio controls, 445 checkboxes, 82 text
inputs, 2 textareas, and 317 selects. It found **no `input[type=number]`**, no
question-local hidden inputs, and no MathML. It found 102 `<pre>`, 57 `<code>`,
24 table-bearing questions, and 31 image-bearing questions. Thus numeric and
assembly prompts occur as content, not distinct numeric-control types.

## 2. DOM Structure and Extractor Coverage

The only control families actually found are single radio choice, multi
checkbox choice, select/dropdown (including multiple selects in one question),
and text/textarea answer. There is no fixture evidence for matching,
true/false-group, number input, cloze input, file upload, drag/drop, or a rich
essay editor.

`src/content/scanner/MoodleScanner.js` discovers roots with `.que`,
`[class*="que "]`, `div[id^="q"]`, and `div[id^="question-"]`; it extracts stems
from `.qtext`/`.formulation`, choices from radio/checkbox inputs, free answers
from text/no-type inputs and textarea, and dropdowns from `select`. It excludes
Moodle clear-choice inputs. `TextUtils.extractRichText` flattens rich stem
content and `DomMediaExtractor` extracts one image. Tables, code, and multiple
images therefore have no lossless typed payload representation.

## 3. Data-path Trace

| Stage | Implementation | Audit result |
|---|---|---|
| Discovery/classification | `MoodleScanner.scan`; fallback `ExamDomScanner.scanAll` | Source paths exist for all four discovered families; no browser test calls the scanner for all 389 cards. |
| Extraction | `MoodleScanner`, `TextUtils`, `DomMediaExtractor` | Choice labels and select `value` + text are extracted; rich table/code structure is flattened. |
| Serialization/validation | `AdaptiveDebateApiClient.toContractQuestion`; `orchestrator/lib/contracts.js` | Strict typed support for `single_choice`, `multiple_choice`, `dropdown_select`, `short_answer`. Dropdown keeps real select IDs and values. |
| Normalization | `normalizeAnswerDetailed` in `contracts.js` | Validates one choice key, a non-empty array of choice keys, complete select-ID/value mappings, or one short-answer string. |
| Mapping/application | `ContinuousSolveRunner`; `DomAnswerClicker` | Current policy is manual-review for choices/dropdowns; text/textarea has a value setter plus `input`/`change` events. |

## 4. Strict Coverage Matrix

“Fully supported” requires demonstrated detection, extraction, normalization,
mapping, and local DOM application. No Playwright/jsdom/browser fixture suite
performs those applications, so fully-passed coverage is zero rather than a
misleading 100%.

| Question Type | Total Found | Detected | Extracted | Normalized | Mapped | Applied | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Single choice radio | 102 | Source path | Source path + bindings tested | Contract tested | Source path | 0 / 102 | PARTIALLY_SUPPORTED |
| Multiple choice checkbox | 101 | Source path | Source path + bindings tested | Contract tested | Source path | 0 / 101 | PARTIALLY_SUPPORTED |
| Dropdown / multiple dropdown | 104 | Source path | Source path + IDs/values tested | Contract tested | Source path | 0 / 104 actual selections | PARTIALLY_SUPPORTED |
| Short answer / textarea | 82 | Source path | Source path + bindings tested | Contract tested | Source path | 0 / 82 browser applications | NOT_TESTED |

`Applied = 0` means no local browser application test was executed; it does not
mean there is no application code.

## 5. Per-fixture Coverage

| Fixture | Total | Passed end-to-end | Failed | Unsupported/manual-only | Coverage |
|---|---:|---:|---:|---:|---:|
| 2019 exam | 45 | 0 | 0 | 45 | 0.00% |
| CLC 2017 | 53 | 0 | 0 | 53 | 0.00% |
| K15 de 2 | 45 | 0 | 0 | 45 | 0.00% |
| K15 exam | 45 | 0 | 0 | 45 | 0.00% |
| Lop chan 2019 | 45 | 0 | 0 | 45 | 0.00% |
| Midterm GK | 40 | 0 | 0 | 40 | 0.00% |
| Quiz CLC 2017 | 24 | 0 | 0 | 24 | 0.00% |
| Quiz | 50 | 0 | 0 | 50 | 0.00% |
| Thi chung 2018 | 42 | 0 | 0 | 42 | 0.00% |
| **All fixtures** | **389** | **0** | **0** | **389** | **0.00%** |

Coverage formula: `fully passed / discovered questions x 100`. “Failed” means
an executed test failed; none did. Manual-only records lack of proven automatic
application, not a parsing failure.

## 6. Edge Cases

- Multiple control handling exists mainly in the 104 dropdown questions; the
  contract requires every real select ID to be supplied once with an allowed value.
- Select display text and option value are distinct and retained. Empty and
  disabled values are filtered by the scanner.
- Three disabled controls exist; no test proves application safely avoids them.
- Assembly, hexadecimal, and binary content is retained as text, but no
  structured code-token schema exists.
- Tables are flattened; only one image is serialized. No support is claimed
  for absent question families.

## 7. Bugs and Gaps

| Severity | Fixture / question | Root cause / source | Fix and regression state |
|---|---|---|---|
| P0 for auto-apply expectation | All 203 radio/checkbox questions | `DomAnswerClicker.forceClickTarget` and `markSuggestedAnswer` return `false`; choices are intentionally manual-review/display-only. | Not changed per request; no fixture browser application regression exists. |
| P1 | All 104 dropdown questions | `MANUAL_REVIEW_MODE = true` in `DomAnswerClicker`; matching option is marked with `.` instead of changing `selectedIndex`. | Not changed per request; no browser test demonstrates actual selection. |
| P1 | 24 table questions; 31 image questions; 102 pre / 57 code occurrences | Scanner flattens text and contract has no table/code/multi-image field. | Not changed per request; fixture checks cover presence, not lossless structured extraction. |
| P1 test gap | All 389 | Tests parse fixture HTML but do not load a browser DOM, scan every card, serialize every result, or test events/application. | Not changed per request. |

## 8. Validation Results

- `npm test`: **PASS** — production hardening, comprehensive audit, typed
  contract, multi-agent debate, and all nine fixture-contract tests passed.
- `npm run build`: **PASS** — generated `dist/` artifacts were restored, so
  this audit leaves no code/artifact change.
- `git diff --check`: pre-existing trailing-whitespace warnings remain in
  `fixtures/moodle-ktmt-quiz.html` lines 240 and 307; that fixture was not edited.
- Missing regression evidence: browser fixture loading, scanner discovery and
  classification per card, extraction/serialization, mapping, and DOM
  application/event tests.

## 9. Before/After, Readiness, and Conclusion

No fix was requested or made: before/after remain 389 discovered by fixture
contracts, 0 fully end-to-end passed, and 0.00% strict coverage. The current
implementation is suitable only for a **manual-review-assisted** workflow for
these files. It is not ready for automated answer application without a policy
change and real browser regression evidence.

**Conclusion: PARTIALLY COMPATIBLE.** The four control families in the nine
fixtures have extraction and typed-contract paths, but full end-to-end support
is not proven; choice and dropdown automatic application are deliberately
disabled/manual-only, and short-answer application lacks fixture browser tests.

---

## QUESTION DETECT V2 — GEMINI THIRD-PARTY API + AUTOMATIC ANSWER SELECTION REPORT

Date: 2026-10-23
Repository: `C:\Users\Admin\Documents\Workspace\Detect_Question`
Release Target: `release\DetectQuestion.exe`

### 1. Architectural Overview & Request Flow

The system runs strictly on the configured Gemini Third-Party OpenAI-compatible API (`key4u.vn` endpoint). Zero local AI (no Ollama, Qwen, llama.cpp, or LocalModelManager) is used or included.

End-to-End Pipeline:
```text
User presses solve hotkey (Alt+N)
    ↓
Scanner scans active question & records fingerprint
    ↓
Backend: 3 independent Gemini model slots executed in parallel
    ↓
Typed normalization & equivalence check
    ↓
Bounded multi-model debate (if disagreement)
    ↓
Gemini Backward Reasoning check (candidate verification)
    ↓
Final Decision Acceptance (Strict Consensus 3/3 + Backward MATCHED => AI_VERIFIED, eligibleForAutoApply: true)
    ↓
Answer Mapper & DomAnswerClicker
    ↓
DOM Auto-Apply (Click radio/checkbox/card, fill input, select dropdown)
    ↓
DOM state confirmation & event dispatches (mouse events, input, change)
    ↓
Stealth Badge display (compact ordinal/text) + Clipboard copy + Storage Cache
```

### 2. Supported Question Types & Auto-Apply Behavior

1. **Single Choice (Radio & Custom Cards)**:
   - Example: Option C.
   - Identifies question card and option key 'C'.
   - Performs public/native click sequence (`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`).
   - Verifies `checked === true` (falls back to prototype descriptor setter if framework overrides native click).
   - Shows badge `C`, copies `C` to clipboard.

2. **Multiple Choice (Checkboxes)**:
   - Example: `answer: ["A", "C", "D"]`.
   - Clears unselected checkboxes (`clearUnselectedCheckboxes`) without touching other question blocks.
   - Clicks options A, C, D in succession.
   - Compact display: `134` (1-based ordinal positions without separators).

3. **Short Answer (Text/Numeric inputs & textareas)**:
   - Example: `answer: "0xE9"`.
   - Fills value using prototype descriptor setter, dispatches `input` and `change` events.
   - Leaves `readonly`, `disabled`, and `role="combobox"` inputs untouched.
   - Verifies input value matches filled answer.

4. **Dropdown & Matching Questions**:
   - Supports Native HTML `<select>` and Ant Design Virtualized Select (`.ant-select`, `role="combobox"`).
   - Ant Design Select uses React component fiber props `onChange(val, option)` + fallback DOM simulation.
   - Matching Example: CX -> option 5, BX -> option 4.
   - Compact display: `54` (1-based ordinal positions in visual field order).

5. **True / False Group**:
   - Matches sub-item keys and clicks corresponding true/false inputs.

### 3. Fail-Closed & Safety Policies

Auto-Apply is strictly gated by `canApplyResult(request, question, result)`:
- `isRequestCurrent(request, question)`: Verifies request ID matches `activeRequestId`, `isSolvingProcess` is true, element is connected, and question fingerprint matches. Prevents wrong-question application upon user scrolling, switching questions, or navigation during inference.
- Fails closed without touching the DOM on:
  - `PROVIDER_ERROR`
  - `MODEL_TIMEOUT`
  - `INVALID_RESPONSE`
  - `UNRESOLVED`
  - `CONSENSUS_UNVERIFIED`
  - `answer = null`
  - `eligibleForAutoApply = false`
  - `DOM_MAPPING_AMBIGUOUS`
  - `QUESTION_CONTEXT_CHANGED`
- **Single-model Emergency (`Alt+M` / `Alt+U`)**: Gated as display-only (`eligibleForAutoApply: false`). Displays compact badge and copies to clipboard without altering DOM or claiming consensus.
- **Continuous Single-model (`Alt+K`)**: Applies to visible cards with explicit `USER_REQUESTED_SINGLE_MODEL_APPLIED` audit trail. Never upgraded to `AI_VERIFIED`.
- **No Auto-Submit**: `isAutoAdvanceEnabled() => false`. Never clicks quiz finish/submit buttons.

### 4. Cache & Alt+B Review Behavior

- When a valid answer is received, it is cached in `chrome.storage.local` (extension) and `%LOCALAPPDATA%\DetectQuestionBackend\answer-cache.json` (standalone) with:
  `siteOrigin`, `questionFingerprint`, `questionType`, `answer`, `compactAnswer`, `model`, `verificationStatus`, `autoApplyStatus`, `timestamp`.
- Errors are never cached.
- **`Alt+B`**:
  - Scans active question fingerprint.
  - Retrieves cached entry.
  - Displays compact badge for 5 seconds (`StealthToastNotifier.showAnswer(answer, 5000)`).
  - Copies compact answer to clipboard.
  - Zero API calls, zero DOM modifications.

### 5. Verification & Test Suite Results

- **Unit, Contract, and Debate Tests**: 14 test suites executed via `npm test`.
- **Moodle Fixtures**: All 9 Moodle exam fixtures (389 questions total) passed contract validation.
- **Dedicated Regression Suite (`tests/auto-apply-regression.test.js`)**: All 22 test scenarios passed:
  1. Single choice auto-apply
  2. Multiple choice compact 134 mapping & checkbox selection
  3. Short answer text filling & readonly/combobox safety
  4. Moodle radio selection & active state
  5. Moodle checkbox selection
  6. Native select dropdown matching
  7. Ant Design Select React onChange synchronization
  8. Multiple dropdown matching compact 54 position mapping
  9. React selectable cards (`div.cursor-pointer`)
  10. React full mouse & input/change state synchronization
  11. Multiple questions on one page isolation
  12. Duplicate option text disambiguation
  13. Duplicate DOM IDs scoped by question card
  14. Wrong question prevention via question fingerprint
  15. Page navigation during inference aborts apply
  16. Multiple hotkeys concurrently (latest request wins)
  17. Provider error fail-closed
  18. Invalid JSON fail-closed
  19. Timeout fail-closed
  20. Rejected Final Decision fail-closed
  21. Cache Alt+B display 5s & clipboard copy without AI/DOM
  22. No auto-submit guarantee
- **Lint / Diff check**: `git diff --check` passed with 0 errors.

### 6. Portable Release Build

- Built via `npm run build:portable-app`:
  - Output: `release\DetectQuestion.exe`
  - File Size: ~48.8 MB (pure standalone executable, zero local model / GGUF bloat).
  - Includes updated extension parity bundle in `desktop/generatedExtensionParityScripts.js`.
