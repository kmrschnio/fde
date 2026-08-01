import 'dotenv/config';
import { Client } from 'pg';
import { search } from '../week-1/day6.js';
import { ALL_QUERIES } from './day3.js';
import { pathToFileURL } from 'node:url';

type Row = { id: number; section: string | null; content: string };

export async function rerank(query: string, docs: string[], topK: number) {
  const res = await fetch('https://api.voyageai.com/v1/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'rerank-2.5-lite',
      query,
      documents: docs,
      top_k: topK,
    }),
  });
  if (!res.ok) throw new Error(`Voyage rerank ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data as Array<{ index: number; relevance_score: number }>;
}

export async function searchWithRerank(db: Client, question: string, topK = 3) {
  const candidates = await search(db, question, 15) as Row[];   // retrieve BROAD
  const t0 = Date.now();
  const ranked = await rerank(question, candidates.map(c => c.content), 15); // score ALL 15
  const ms = Date.now() - t0;
  // attach scores, keep full ranked list for inspection
  const scored = ranked.map(r => ({ ...candidates[r.index], relevance: r.relevance_score }));
  return { top: scored.slice(0, topK), all: scored, ms };
}

async function main() {
  const db = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'localdev', database: 'fde' });
  await db.connect();

  // START with the one query that failed yesterday
  const q = "What is Northgate Derivatives' minimum required rating?";

  for ( const q of ALL_QUERIES) {

    const { top, all, ms } = await searchWithRerank(db, q);

    console.log(`\n=== ${q}  (rerank ${ms}ms)`);
    console.log('-- full score distribution (all 15 candidates, reranked):');
    all.forEach((c, i) => console.log(`   ${String(i+1).padStart(2)}. [${c.id}] score=${c.relevance.toFixed(4)} ${c.content?.slice(0, 70)}`));
    console.log('-- top 3:');
    top.forEach((c, i) => console.log(`   ${i+1}. [${c.id}] ${c.content?.slice(0, 90) || ''}`));

    const CONFIDENCE_FLOOR = 0.5;
    const confident = all.filter(c => c.relevance >= CONFIDENCE_FLOOR);
    console.log(`${confident.length} chunk(s) above floor — ${confident.length === 0 ? 'REFUSE' : 'answer'}`);
  }

  await db.end();
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('week2 day4 failed:', message);
    process.exitCode = 1;
  });
}