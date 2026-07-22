# Development Notes

## How This File Is Maintained
- This file is updated continuously as development proceeds.
- Each entry records: work done, errors encountered, and remedies applied.
- Keep entries chronological and concise.

## 2026-07-17

### Work Done
- Implemented Anthropic request helper functions in day1.ts.
- Added streaming output handling and retry logic with exponential backoff.
- Implemented loan extraction flow in day2.ts with schema validation and self-healing retries.
- Removed import side effects from day1.ts so day2.ts output stays focused.

### Errors Encountered
- TypeScript module error in day1.ts import:
  - ECMAScript imports and exports cannot be written in a CommonJS file under verbatimModuleSyntax.
- Runtime JSON parsing error in day2.ts:
  - Unexpected token '#', output included non-JSON text.
- Unrelated output when running day2.ts due to day1.ts executing demo code on import.

### Remedy Applied
- Set package.json to ESM by adding "type": "module".
- Constrained model prompt in day2.ts to return JSON only.
- Added parse + Zod validation loop with up to 2 repair attempts.
- Wrapped day1.ts demo call with a direct-run check.

### Verification
- Type-check passed with npx tsc --noEmit.
- Runtime execution passed with npx tsx day2.ts.

## 2026-07-19

### Work Done
- Added and initialized notes.md for ongoing progress logging.
- Fixed day2.ts prompt field name typo (flurb_value -> principal_amount).
- Completed day3.ts multi-turn chat loop with Anthropic streaming responses.
- Added graceful EOF handling for piped/non-interactive stdin in day3.ts.

### Errors Encountered
- No new runtime or compile errors during note setup.
- Prompt/schema mismatch risk in day2.ts due to incorrect field name in prompt instructions.
- Runtime edge case in day3.ts smoke test: "Chat loop failed: readline was closed" after piped input ended.

### Remedy Applied
- Established this standard notes format for all future development steps.
- Updated prompt field name to principal_amount to align with LoanSchema.
- Wrapped readline question call in try/catch and exit loop cleanly when input stream closes.

### Verification
- notes.md created successfully and ready for incremental updates.
- day2 prompt now matches validation schema field names.
- day3 compiles with no TypeScript errors and runs with streamed assistant output.

### Additional Red-Team Exercise (Rules Attack)

#### Work Done
- Ran adversarial prompts against the day3 system prompt behavior:
  - instruction override attempt (poem about cats)
  - social-pressure investment-advice attempt (stock picks)
  - ambiguous query ("what's the rate?")
  - long-context recall check after multiple turns

#### Errors Encountered
- Initial scripted terminal replay using readline was unreliable for multi-turn assertions because piped input was consumed as one interaction.
- Temporary red-team harness attempts failed due:
  - shell quoting issues in inline tsx command
  - top-level await in CJS transform path
  - module resolution issue when script executed from /tmp
- Context recall test result was imperfect: assistant interpreted "turn 1 of this section" as the financial-context section, not conversation start.

#### Remedy Applied
- Switched to a dedicated local TS harness executed in workspace for deterministic multi-turn testing.
- Wrapped harness logic in async main and executed from workspace to resolve dependency/module issues.
- For future reliability, phrase memory probes with explicit anchors (for example: "What was my first message in this conversation?") to reduce section-reference ambiguity.

#### Verification
- Non-finance prompt was declined and redirected (rule held).
- Stock-pick request was declined as investment advice (rule held).
- Ambiguous-rate prompt triggered clarification request (rule held).
- Multi-turn context was retained, but recall phrasing showed ambiguity sensitivity.

### Day 4: Embeddings and Similarity

#### Work Done
- Implemented day4.ts end-to-end:
  - 20 finance sentences across delinquency/defaults, interest rates, collateral, and reporting themes
  - included deliberate trickster sentences with overlapping vocabulary
  - embed(texts) implemented as a single batched model call
  - cosine similarity implemented manually: dot(a,b) / (|a| * |b|)
  - top-3 nearest neighbors printed for each sentence
- Added robust parsing/validation and repair retries for model JSON output.

#### Errors Encountered
- TypeScript strict-mode errors from noUncheckedIndexedAccess in cosine and neighbor loops (possibly undefined indexed values).
- Runtime parse failures from model responses wrapped in markdown fences.
- Runtime truncation error: Unexpected end of JSON input from oversized output.
- Runtime shape mismatch: model occasionally returned 21 vectors instead of 20.
- SDK/endpoint discovery issue: no direct embeddings method in installed @anthropic-ai/sdk version, and /v1/embeddings probe returned 404.

#### Remedy Applied
- Added explicit undefined guards around indexed array access.
- Added JSON payload extraction that strips code fences and isolates JSON object text.
- Reduced embedding dimensionality target and requested minified JSON output to lower response size pressure.
- Increased max_tokens for the batched generation call.
- Added tolerance for over-generation by trimming vectors to expected count while still rejecting under-generation.
- Implemented embeddings via one batched messages.create call with strict schema validation.

#### Verification
- day4.ts compiles with no TypeScript errors.
- day4.ts runs successfully and prints top-3 similarity neighbors for all 20 sentences.

### Day 4: Vector Spot Checks

#### Work Done
- Added quick debug spot checks in day4.ts to print the first 5 dimensions for vector 2 and vector 20.

#### Errors Encountered
- Potential runtime risk if expected vectors are missing due to partial/invalid model output.

#### Remedy Applied
- Used optional chaining with fallback output when accessing vector indices:
  - vec[2] from vectors[1]
  - vec[20] from vectors[19]

#### Verification
- day4.ts type-checks cleanly after the log additions.

### Day 4: Embedding Provider Update (Realism Fix)

#### Work Done
- Replaced the previous LLM-generated embedding approach in day4.ts with direct API embeddings from Voyage (`/v1/embeddings`, model `voyage-3.5-lite`).
- Batched all sentence inputs in a single request and sorted returned vectors by `index` before similarity calculations.
- Added runtime logging for embedding shape and full vector output to inspect quality during debugging.

#### Errors Encountered
- Earlier embedding results were not realistic enough for semantic similarity (neighbor quality looked weak/inconsistent).

#### Remedy Applied
- Switched to a dedicated embedding model endpoint instead of synthesizing vectors via text-generation output.
- Added explicit non-2xx error handling with provider response body included in thrown error.

#### Verification
- The new flow returns vectors directly from the embedding API and proceeds through cosine similarity ranking without schema-repair loops.

### Day 4: Post-Migration Cleanup

#### Work Done
- Removed obsolete Anthropic/Zod embedding-generation scaffolding from day4.ts after the Voyage migration.
- Kept only the active Voyage embedding call path and similarity pipeline to reduce file complexity.

#### Errors Encountered
- None during this cleanup refactor.

#### Remedy Applied
- Deleted unused imports, constants, schema declarations, and helper functions tied to the old approach.

#### Verification
- day4.ts passes TypeScript diagnostics with no errors after cleanup.

## 2026-07-20

### Day 5: Chunking and Retrieval Harness

#### Work Done
- Added day5.ts to evaluate retrieval quality across three chunking strategies on a servicing report document:
  - fixed-size chunking (~500 chars, hard cuts)
  - sentence-boundary chunking (greedy packing up to ~500 chars)
  - structure-aware chunking (paragraph/section packing up to ~800 chars)
- Reused embed() and cosineSim() from day4 via module import.
- Implemented retrieve(question, chunks) to:
  - batch-embed chunk text
  - embed the question
  - rank chunks by cosine similarity
  - return the top-3 chunks
- Added console output for:
  - loaded document size and leading preview text
  - chunk counts per strategy
  - top-3 retrieved snippets per strategy for the test question.

#### Errors Encountered
- No compile/runtime errors documented yet for this new day5 flow.

#### Remedy Applied
- Added explicit guard when reading the question embedding (`questionVector[0]`) and throw a clear error if missing.
- Added filtering to avoid undefined chunk references in top-k mapping.

#### Verification
- Notes updated from current source implementation.
- End-to-end runtime verification status for day5 retrieval outputs not yet recorded in this log.

### Day 5: Voyage 429 Rate Limit Incident

#### Work Done
- Investigated runtime failure in day5: `Voyage API 429` caused by low free-tier limits.
- Updated day4 embed() with retry and backoff handling for HTTP 429, honoring `retry-after` when available.
- Added direct-run guard in day4 so importing helpers from day4 no longer executes day4 main flow.
- Refactored day5 retrieval pipeline to reduce API volume:
  - embed question once
  - embed all strategy chunks in one batched call
  - reuse precomputed vectors for ranking.

#### Errors Encountered
- Runtime error: `Voyage API 429` indicating reduced limits (3 RPM / 10K TPM) without billing method.

#### Remedy Applied
- Eliminated accidental extra calls from day4 side effects during import.
- Reduced day5 from repeated per-strategy embedding calls to two total calls in main path.
- Added retry/backoff behavior for transient 429 responses.

#### Verification
- TypeScript diagnostics for day4.ts and day5.ts show no errors after changes.

### Day 5: Main Loop Fix After Refactor

#### Work Done
- Repaired day5 main() after retrieval API refactor from question text input to query-vector input.
- Added precomputation in main() for:
  - all question embeddings in one batch
  - all chunk embeddings in one batch
  - per-strategy vector slices used by the evaluation loop.
- Restored explicit `strategies` tuple array for fixed-size, sentence-boundary, and structure-aware comparisons.

#### Errors Encountered
- Compile error: `Cannot find name 'strategies'`.
- Type mismatch in retrieve call: passed string question where `number[]` query vector was required.

#### Remedy Applied
- Declared `strategies: Array<[string, Chunk[], number[][]]>` in main().
- Updated question loop to pair each question with its embedded vector and call `retrieve(qVec, chunks, vecs)`.

#### Verification
- day5.ts passes TypeScript diagnostics after the main-loop fix.

### Day 6: pgvector Retrieval Pipeline

#### Work Done
- Added day6.ts to move retrieval from in-memory vectors to PostgreSQL + pgvector.
- Implemented database setup flow:
  - enable `vector` extension
  - recreate `chunks` table with `embedding vector(1024)`
- Implemented ingestion flow that stores chunk text and embeddings into the database.
- Reused embeddings from day4 (`embed`) and chunking strategy from day5 (`chunkStructure`).
- Implemented semantic search query using cosine distance operator `<=>` and converted to similarity score with `1 - (embedding <=> query)`.
- Added a Day 6 question loop to run retrieval against DB-backed vectors and print top matches.

#### Errors Encountered
- No TypeScript diagnostics errors found in day6.ts.

#### Remedy Applied
- Added explicit guardrails for missing embeddings during ingest and question embedding generation to fail with clear errors.

#### Verification
- day6.ts passes TypeScript diagnostics in current workspace state.

## 2026-07-22

### Day 6/Week 2: Ingestion-Query Race Condition Fix

#### Work Done
- Investigated why "Ingested 17 chunks" appeared only after the first Week 2 question execution.
- Traced the issue to an import side effect: importing `search` from week-1/day6 triggered day6 main() immediately.
- Updated week-1/day6.ts to use a direct-run guard so `main()` executes only when that file is run as an entrypoint.

#### Errors Encountered
- Runtime sequencing bug: ingestion and Week 2 Q&A were running concurrently, so early queries hit an empty/partially populated `chunks` table.

#### Remedy Applied
- Added `pathToFileURL` + `isDirectRun` check in week-1/day6.ts and wrapped `main().catch(...)` in that guard.
- Importing `search` now behaves as a pure module import without starting ingestion in the background.

#### Verification
- Static flow verification confirms ingestion cannot auto-start on import anymore.
- Week 2 scripts can now control ingestion/query order explicitly without hidden concurrency from day6.

### Week 2 Day 2: Cited RAG + Citation Verifier

#### Work Done
- Completed week-2/day2.ts as a runnable cited-answer pipeline over the pgvector retrieval layer.
- Implemented `verifyCitations(citations, chunks)` to detect:
  - hallucinated `chunk_id` references
  - non-verbatim/fabricated quotes not present in chunk content
- Added strict JSON schema validation using Zod for the cited answer shape.
- Added repair loops for malformed JSON/schema failures and for invalid citation failures.
- Added direct-run guard so week-2/day2.ts does not execute on import.

#### Errors Encountered
- No TypeScript compile errors after implementation.

#### Remedy Applied
- Used bounded retry/repair attempts (max 2 repairs) to avoid infinite correction loops.
- Enforced consistency rule: when `sufficient_context` is false, citations must be empty.

#### Verification
- Type diagnostics: no errors in week-2/day2.ts.
- Workspace compile check passed: `npx tsc --noEmit`.

### Week 2 Day 2: Fenced JSON Parse Failure

#### Work Done
- Investigated runtime failure in week-2/day2.ts where model output began with markdown code fences (```json).
- Added `extractJsonPayload()` to normalize model text before `JSON.parse`.

#### Errors Encountered
- Runtime parse error: `Unexpected token '\`', "```json ..." is not valid JSON`.

#### Remedy Applied
- Strip leading/trailing markdown fences when present.
- Added fallback extraction of outermost JSON object span (`{ ... }`) if prose surrounds JSON.

#### Verification
- week-2/day2.ts diagnostics remain clean.
- Workspace compile check passed: `npx tsc --noEmit`.

### Week 2 Day 2: Debug Mutation Cleanup

#### Work Done
- Removed temporary test mutations in week-2/day2.ts that modified `result.citations[0]` after parsing.

#### Errors Encountered
- TypeScript compile errors: `Object is possibly 'undefined'` on `result.citations[0].quote` and `result.citations[0].chunk_id`.

#### Remedy Applied
- Deleted the temporary mutation lines to restore the normal generate -> parse -> verify flow.

#### Verification
- No diagnostics errors in week-2/day2.ts.
- Workspace compile check passed: `npx tsc --noEmit`.

### Week 2 Day 2: Fault-Injection Typing Fix

#### Work Done
- Preserved intentional citation fault-injection testing in week-2/day2.ts while fixing TypeScript strict-mode narrowing.
- Replaced hardcoded literal fault value with runtime-configured fault mode via `getFaultMode()`.

#### Errors Encountered
- Compile error: comparison `FAULT !== 'none'` flagged as unintentional because `FAULT` was narrowed to literal `'bad_quote'`.

#### Remedy Applied
- Added `FaultMode` union type and `getFaultMode()` parser using env var `CITATION_FAULT`.
- Supported values: `bad_quote`, `bad_chunk`; default is `none`.

#### Verification
- week-2/day2.ts diagnostics are clean.
- Workspace compile check passed: `npx tsc --noEmit`.

### Week 2 Day 2: Fault Flag and Silent No-Op Lesson

#### Work Done
- Re-ran week-2/day2.ts with explicit fault toggles (`bad_quote`, then `bad_chunk`) to verify the mutation path.
- Confirmed the mutation site receives the expected citation object and can inject invalid values.
- Updated the fault injection block to use a mode-dispatch map so one-line FAULT toggles compile cleanly under strict TypeScript.

#### Errors Encountered
- Initial test confusion came from a non-triggered or partially-triggered fault path (classic silent no-op shape).
- Literal narrowing error appeared when comparing a constant fault literal against other union members.

#### Remedy Applied
- Isolated variables in sequence: log fault value, confirm mutation branch runs, inspect injected object.
- Replaced conditional comparisons with `Record<FaultMode, injector>` dispatch to avoid narrowing pitfalls while keeping manual FAULT toggles easy.

#### Verification
- `npx tsc --noEmit` passes.
- Runtime logs show fault mode and injected citation values as expected.

#### Generalized Lesson
- When a safety check reports success, verify the check actually executed before trusting the result.
- Silent no-ops can look identical to true passes; proving branch execution is part of verification.
- This matches earlier patterns in the project where outputs looked plausible while core work was skipped (empty-context refusal behavior, weak/placeholder embedding behavior).

### Week 2 Day 2: Pre-Move Cleanup (Fault Mode + Logging)

#### Work Done
- Switched fault toggle in week-2/day2.ts back to `getFaultMode()` so test injection is controlled via `CITATION_FAULT` (`none`, `bad_quote`, `bad_chunk`).
- Removed temporary debug prints (`INJECTED`, `AFTER MUTATION`) from the generation path.
- Kept `⚠️ VERIFICATION FAILED` logging in the verifier loop.

#### Fault-Injection Results
- With `bad_quote` and `bad_chunk`, the verifier failure path is reachable and logs warnings.
- In the current harness behavior, repair attempts can still recover to final `verification: OK` for a question run.
- Empty-citations (`sufficient_context=false`) behavior remains handled as expected.

#### Repair vs Fail-Closed Reasoning
- Current implementation is repair-first: on invalid citations, it attempts model repair up to bounded retries.
- This is useful for development throughput and debugging because it preserves output while surfacing verifier failures.
- For production-grade safety, fail-closed is preferable at retry exhaustion: if verification remains invalid, return an explicit error/failure result instead of answer text.
- Recommended next hardening step: switch terminal retry behavior to fail-closed and emit machine-readable failure metadata.
