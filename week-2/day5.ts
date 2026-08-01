import 'dotenv/config';
import { Client } from 'pg';
import { search } from '../week-1/day6.js';
import { rerank } from './day4.js';
import { verifyCitations, generateCitedAnswer } from './day2.js';
import { pathToFileURL } from 'node:url';
// reuse rerank() from day4, verifyCitations()/generateCitedAnswer() from day2

const FLOOR = 0.5;
const MIN_K = 3;
const CANDIDATES = 15;

async function retrieveAndRank(db: Client, question: string) {
  const candidates = await search(db, question, CANDIDATES);
  const ranked = await rerank(question, candidates.map(c => c.content), CANDIDATES);
  const scored = ranked.map(r => ({ ...candidates[r.index], relevance: r.relevance_score }));

  // THE POLICY you derived on Day 4: above floor, but never fewer than MIN_K
  const aboveFloor = scored.filter(c => c.relevance >= FLOOR);
  const selected = aboveFloor.length >= MIN_K ? aboveFloor : scored.slice(0, MIN_K);

  // confidence signal = top reranker score (Day 4 finding)
  const confidence = scored[0]?.relevance ?? 0;
  return { selected, confidence };
}

async function answer(db: Client, question: string) {
  const { selected, confidence } = await retrieveAndRank(db, question);

  // low-confidence gate: if even the best chunk is weak, flag it
  const lowConfidence = confidence < FLOOR;

  const validSelected = selected
    .filter((c): c is typeof selected[0] & { id: number; content: string } => c.id != null && c.content != null)
    .map(c => ({ ...c, section: c.section ?? null }));
  const { result } = await generateCitedAnswer(question, validSelected);
  const verification = verifyCitations(result.citations, validSelected.map(c => ({ id: c.id, content: c.content })));
  // (reuse your Day 2 repair loop here if verification fails)

  return {
    answer: result.answer,
    sufficient_context: result.sufficient_context,
    citations: result.citations,
    verified: verification.valid,
    confidence,
    lowConfidence,
  };
}
const QUESTIONS = [
  'What coupon do the Class A notes pay?',
  'What happens if the delinquency trigger is breached?',
  'What is the full order of payments in the waterfall?',
  'Was the rise in April delinquencies a sign of credit deterioration?',
  'How is the cumulative net loss ratio defined, and what is its current value?',
  "What is this transaction's credit rating from Moody's?",  // adversarial — must refuse
];

async function main(): Promise<void> {
  const db = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'localdev', database: 'fde',
  });
  await db.connect();

  try {
    for (const question of QUESTIONS) {
      const r = await answer(db, question);

      console.log(`\n${'='.repeat(70)}`);
      console.log(`Q: ${question}`);
      console.log(`confidence: ${r.confidence.toFixed(4)}${r.lowConfidence ? '  ⚠️ LOW' : ''}`);
      console.log(`sufficient_context: ${r.sufficient_context}`);
      console.log(`verified: ${r.verified}`);
      console.log(`A: ${r.answer}`);

      if (r.citations.length === 0) {
        console.log('citations: []');
      } else {
        console.log('citations:');
        for (const c of r.citations) {
          console.log(`  - [${c.chunk_id}] ${c.supports}`);
        }
      }
    }
  } finally {
    await db.end();
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('week2 day5 failed:', message);
    process.exitCode = 1;
  });
}
