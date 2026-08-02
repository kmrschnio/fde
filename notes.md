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

### Week 2 Day 3: Hybrid Retrieval Harness

#### Work Done
- Refactored week-2/day3.ts from single-mode probing to a comparative retrieval harness.
- Added keyword retrieval (`keywordSearch`) using PostgreSQL full-text ranking with `websearch_to_tsquery('english', ...)`.
- Added Reciprocal Rank Fusion (`rrf`) and `hybridSearch` combining vector + keyword candidates.
- Expanded probes into `ALL_QUERIES` and printouts now compare `vector`, `keyword`, and `hybrid` top-3 results per query.
- Standardized compact side-by-side preview snippets using `slice(0, 85)` for readability across all three modes.

#### Errors Encountered
- None.

#### Remedy Applied
- Implemented rank-fusion scoring with RRF (`1 / (k + rank + 1)`) to reduce single-retriever miss cases.
- Implemented deep candidate pull + fusion + trim flow (`10 -> fuse -> top 3`) in `hybridSearch`.
- Switched output formatting to emphasize retrieval comparison over long single-snippet previews.

#### Verification
- week-2/day3.ts diagnostics are clean.
- Workspace compile check passed: `npx tsc --noEmit`.

#### Retrospective
- Implemented hybrid retrieval (pgvector + Postgres FTS, fused with RRF). Result: no improvement over vector-only on any of 9 queries; slightly worse on 2. Three failure modes hit along the way: (1) plainto_tsquery AND-semantics returned zero hits on 4/9 natural-language questions; (2) websearch_to_tsquery didn't help — it adds operator syntax, not OR defaults; (3) hand-built OR queries restored recall but had no term-importance weighting, so common terms ("rating") matched as strongly as rare discriminating ones ("northgate"), injecting noise that RRF propagated into hybrid results. Root causes: 17-chunk corpus where vector search retrieves ~18% of the corpus per query (hard to miss), and Postgres FTS lacking proper IDF. Conclusion: hybrid search is query engineering plus a real BM25 engine, not a bolt-on. Would revisit at 10k+ chunks with OpenSearch.

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

## 2026-08-01

### Week 2 Day 5: Rerank Floor + Min-K Evidence and Latency Budget

#### Work Done
- One thing to notice and fix, though — the waterfall answer succeeded almost by luck. Its selected chunks were [10], [11], [2], and the actual waterfall enumeration lives in [11], which scored **0.49 — below your 0.5 floor**. It only made it into context because your min-k=3 fallback rescued it. Had you used a pure floor with no min-k, this question would have answered from [10] alone (the *trigger* chunk, not the *waterfall* chunk) and been wrong. **Your Day 4 policy decision — "floor, but never fewer than k" — is what saved this question.** That's not a hypothetical benefit anymore; you can point to the exact query where the naive version would have failed. Put that in `notes.md` verbatim; it's a concrete defense of a design choice, which is rare and valuable.
- Added direct-run guards to week-2/day3.ts and week-2/day4.ts so importing rerank in day5 no longer executes Day 3/Day 4 harness output.

#### Errors Encountered
- Pipeline output pollution from import side effects: Day 3/Day 4 harness `main()` functions were executing during Day 5 runs.

#### Remedy Applied
- Wrapped `main()` calls in day3/day4 with `isDirectRun` (`import.meta.url` vs `pathToFileURL(process.argv[1]).href`) guards.

#### Latency Budget
- end-to-end ~1-2s per query, dominated by generation; rerank adds ~350ms.
- Future optimization: stream generation so the user sees the answer forming rather than waiting for the full pipeline.

### Project1 LoanDoc: lib/rag.ts Completion

#### Work Done
- Rebuilt `project1-loandoc/lib/rag.ts` into a complete, type-safe RAG module.
- Added missing imports and core wiring:
  - `Anthropic` client initialization
  - `Client` typing for Postgres query functions
- Implemented missing interfaces and exports:
  - `ChunkRow`, `RetrievedChunk`, `Citation`, `CitedAnswer`, `AnswerResult`
  - `answerQuestion(...)` export for end-to-end retrieval + rerank + cited generation
- Implemented missing helper functions:
  - `extractText`, `extractJsonPayload`, `parseCitedAnswer`
  - runtime shape guards (`isCitation`, `isCitedAnswer`)
  - `getFaultMode`, `getVoyageApiKey`
- Implemented retrieval/ranking policy constants and flow in-module:
  - `FLOOR`, `MIN_K`, `CANDIDATES`
  - floor-with-min-k selection policy in `retrieveAndRank(...)`
- Kept and typed Voyage integrations:
  - `embed(...)` with retry/backoff for 429
  - `search(...)` using pgvector cosine distance
  - `rerank(...)` using Voyage rerank endpoint

#### Errors Encountered
- File had unresolved symbols across the board (missing types, constants, imports, and helper functions), producing compile errors on nearly every section.

#### Remedy Applied
- Replaced partial file body with a self-contained implementation and strict TypeScript interfaces.
- Added explicit runtime validation for model JSON output to avoid silent schema drift.

#### Verification
- File diagnostics: no errors in `project1-loandoc/lib/rag.ts`.
- Project type-check passed: `cd project1-loandoc && npx tsc --noEmit`.

### Project1 LoanDoc: DB Access Refactor in rag.ts

#### Work Done
- Updated `project1-loandoc/lib/rag.ts` to use shared DB access from `project1-loandoc/lib/db.ts` instead of passing a pg client/pool through function arguments.
- Refactored function signatures:
  - `retrieveAndRank(pool, question)` -> `retrieveAndRank(question)`
  - `answer(pool, question)` -> `answer(question)`
  - `search(pool, question, k)` -> `search(question, k)`
- Added `import { pool } from './db'` and removed the `Client` type dependency from `rag.ts`.

#### Errors Encountered
- None during the refactor.

#### Remedy Applied
- Centralized SQL query execution to the shared module-level `pool` from `db.ts`.

#### Verification
- File diagnostics: no errors in `project1-loandoc/lib/rag.ts`.
- Project type-check passed: `cd project1-loandoc && npx tsc --noEmit`.

### Project1 LoanDoc: Upload Route Error Fix + Missing Module Implementation

#### Work Done
- Fixed `project1-loandoc/app/api/upload/route.ts` and implemented all missing dependencies.
- Replaced invalid default import from `pdf-parse` with named `PDFParse` class usage.
- Added full PDF text extraction flow using `PDFParse({ data: buf })`, `getText()`, and `destroy()` cleanup.
- Added missing modules used by upload route:
  - `project1-loandoc/lib/pdf.ts` with `cleanPdfText(...)`
  - `project1-loandoc/lib/chunk.ts` with `Chunk` interface and `chunkStructure(...)`
  - `project1-loandoc/lib/embed.ts` with `embed(...)` and Voyage retry/backoff handling
- Added vector existence guard before DB insert to prevent undefined embedding writes.

#### Errors Encountered
- Route had missing module imports (`@/lib/pdf`, `@/lib/chunk`, `@/lib/embed`).
- `pdf-parse` import shape mismatch (`no default export`).

#### Remedy Applied
- Created missing library modules and wired route to typed helpers.
- Switched to `PDFParse` API compatible with installed `pdf-parse` version.

#### Verification
- Project type-check passed: `cd project1-loandoc && npx tsc --noEmit`.

### Project1 LoanDoc: pdf.js Worker Resolution Fix

#### Work Done
- Fixed runtime error in `project1-loandoc/app/api/upload/route.ts`:
  - `Setting up fake worker failed: Cannot find module ... pdf.worker.mjs`
- Added explicit worker path wiring for `pdf-parse`:
  - imported `node:path`
  - set `PDF_WORKER_PATH` to `node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs`
  - called `PDFParse.setWorker(PDF_WORKER_PATH)` at module load.

#### Root Cause
- In Next.js dev server bundling, `pdfjs-dist` fake worker fallback tried to import worker from `.next/dev/server/chunks/...`, which does not exist for this package path.

#### Verification
- Type-check passed: `cd project1-loandoc && npx tsc --noEmit`.
- Runtime upload test passed:
  - `curl -X POST http://localhost:3000/api/upload -F "file=@test-pdfs/atlas_termsheet.pdf"`
  - response: `{"document_id":2,"chunks":2}`.

### Project1 LoanDoc: /api/ask Empty-Documents Rerank Failure Fix

#### Work Done
- Fixed runtime error where Voyage rerank failed with 400 when `documents` was empty.
- Updated `project1-loandoc/lib/rag.ts` to guard no-result retrieval before rerank.

#### Root Cause
- `search(question, documentId, k)` can return zero chunks for a valid question when the provided `documentId` has no indexed rows (for example, using an older ID).
- The pipeline still called `rerank(...)` with `documents: []`, and Voyage rejects empty lists.

#### Remedy Applied
- In `retrieveAndRank(...)`:
  - early return `{ selected: [], confidence: 0 }` when no candidates.
  - cap rerank `top_k` to `Math.min(CANDIDATES, candidates.length)`.
- In `answer(...)`:
  - return a safe no-context response when `selected.length === 0`.
- In `rerank(...)`:
  - return `[]` immediately for `docs.length === 0` as an extra guard.

#### Verification
- Type-check passed: `cd project1-loandoc && npx tsc --noEmit`.
- Reproduced previous failing request and confirmed graceful result:
  - `curl -X POST http://localhost:3000/api/ask -H 'Content-Type: application/json' -d '{"question":"What coupon do the Class A notes pay?","documentId":1}'`
  - returns `sufficient_context=false` with no crash.

### Project1 LoanDoc: Atlas Table Flattening + Cleaning Inspection + Hard PDF Stress Tests

#### Nuanced Finding (Requested)
- In the Atlas PDF, that was a two-column key-value table cell: `Class A Notes | USD 420,000,000 — 5.95% fixed — Rated AAA`. Extraction flattened it into a single line and it still answered correctly. This confirms a nuanced point: not all table mangling is equally bad; key-value tables often survive flattening better than multi-column data tables.

#### Confidence Signal Observation
- Atlas `/api/ask` for coupon on `documentId=2` returned:
  - answer: `5.95% fixed`
  - confidence: `0.68359375` (~0.684)
  - citation: flattened row text
- Compared with earlier clean Meridian `.txt` run (~0.898 for same style query), this lower score suggests retrieval quality degraded while still remaining sufficient for a correct answer. Confidence appears to track context quality, not just correctness.

#### cleanPdfText Before/After (Atlas)
- Inspection command run with `pdf-parse` + `cleanPdfText` on `test-pdfs/atlas_termsheet.pdf`.
- Lengths:
  - raw: `952`
  - cleaned: `950`
- Key observed effect:
  - Minimal transformation on this easy single-page file; extracted key-value rows were already mostly readable.
  - The key line survived in both forms:
    - `Class A Notes USD 420,000,000 — 5.95% fixed — Rated AAA`
  - Cleaning mostly normalized whitespace/newline noise rather than repairing structural table layout.

#### Hard PDF Stress Tests
- `meridian_report.pdf` uploaded as `document_id=3`.
  - question: `What is the delinquency trigger?`
  - response: `three-month rolling average >60 DPD exceeds 4.00%`
  - confidence: `0.76171875`
  - sufficient_context: `true`
  - verified: `false`
- `horizon_prospectus.pdf` uploaded as `document_id=4`.
  - question: `What is the servicing fee?`
  - response: `1.25% per annum`
  - confidence: `0.7421875`
  - sufficient_context: `true`
  - verified: `false`

#### Interpretation
- Atlas behaved as the easy case: flattened key-value rows remained parseable.
- Meridian/Horizon answered correctly for targeted questions, but `verified=false` indicates citation exact-match fragility under noisier extraction (likely line-break/hyphenation/format artifacts), even when semantic answering succeeds.

### Project1 LoanDoc: rag.ts Function Reordering

#### Work Done
- Rearranged all functions in `project1-loandoc/lib/rag.ts` for a clearer top-down flow without changing behavior.
- New structure groups functions as:
  - config/constants and types
  - core helpers and parsers
  - provider calls (`embed`, `rerank`, `search`)
  - retrieval pipeline (`retrieveAndRank`)
  - citation + generation (`verifyCitations`, `generateCitedAnswer`)
  - public answer API (`answer`)

#### Errors Encountered
- None.

#### Verification
- File diagnostics: no errors in `project1-loandoc/lib/rag.ts`.
- Project type-check passed: `cd project1-loandoc && npx tsc --noEmit`.

### Project1 LoanDoc: app/page.tsx Missing Components + Interface Completion

#### Work Done
- Fixed missing symbol errors in `project1-loandoc/app/page.tsx` by implementing:
  - `DocumentPane`
  - `AnswerPane`
- Added explicit prop interfaces:
  - `DocumentPaneProps`
  - `AnswerPaneProps`
- Improved typed ask flow:
  - added local `error` state
  - handled non-OK API responses with message extraction
  - preserved loading lifecycle with `try/catch/finally`
- Wired citation interactions:
  - answer-side citation buttons call `onCite(chunk_id)`
  - document pane highlights selected citation chunk and shows quote text.

#### Errors Encountered
- Compile errors from undefined components:
  - `Cannot find name 'DocumentPane'`
  - `Cannot find name 'AnswerPane'`

#### Remedy Applied
- Implemented both components in-file and passed all required props from `Home`.

#### Verification
- File diagnostics: no errors in `project1-loandoc/app/page.tsx`.
- Project type-check passed: `cd project1-loandoc && npx tsc --noEmit`.

### Project1 LoanDoc: Full Document Context + Upload-Driven Workbench

#### Work Done
- Replaced citation-only left-pane rendering with persistent full-document context.
- Added `GET /api/documents/[documentId]`, returning document metadata and all chunks in ID order.
- Updated `DocumentPane` to fetch and render every indexed chunk as flowing text.
- Added citation navigation behavior:
  - chunk refs are stored by ID
  - clicking a source scrolls its chunk into view with smooth, centered scrolling
  - only the matching chunk receives highlighted background and left border styling.
- Removed hardcoded document selection from the client experience.
- Added upload-first flow:
  - click or drag-drop a PDF
  - processing state while upload/indexing runs
  - ready state displays selected filename and chunk count.
- Redesigned interaction chrome:
  - sentence-case headings with lighter weight
  - answer text uses a serif voice while interface chrome remains sans
  - confidence and verified state render as compact chips
  - insufficient-context response is an empty state, not raw metadata
  - low-confidence result includes amber source-verification note
  - updated page metadata to LoanDoc.

#### Errors Encountered
- Initial AnswerPane styling patch introduced malformed JSX and blocked the dev server.

#### Remedy Applied
- Replaced the malformed component body with clean JSX and reran the same type-check/runtime checks before proceeding.

#### Verification
- `npx tsc --noEmit` passes in `project1-loandoc`.
- Live document endpoint returned full chunk list for Meridian:
  - `GET /api/documents/3` -> `meridian_report.pdf`, `2` indexed chunks.
- Browser test completed:
  - uploaded `atlas_termsheet.pdf`
  - full extracted document text rendered in left pane
  - asked `What coupon do the Class A notes pay?`
  - received `5.95%` answer with confidence chip and verified chip
  - clicked cited source and confirmed exactly one source chunk was highlighted in place.
