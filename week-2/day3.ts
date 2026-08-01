import 'dotenv/config';
import { Client } from 'pg';
import { search } from '../week-1/day6.js';
import { pathToFileURL } from 'node:url';

type Row = { id: number; section: string | null; content: string; score?: number };

const STOPWORDS = new Set(['what','which','when','where','does','this','that','with','from','have','their','been','were','will','would','there']);



function toOrQuery(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .join(' | ');
}

async function keywordSearch(db: Client, question: string, k = 10): Promise<Row[]> {
  const tsq = toOrQuery(question);
  console.log('TSQUERY:', JSON.stringify(tsq));
  if (!tsq) return [];
  const res = await db.query(
    `SELECT id, section, content,
            ts_rank(content_tsv, to_tsquery('english', $1)) AS score
     FROM chunks
     WHERE content_tsv @@ to_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [tsq, k],
  );
  return res.rows;
}

function rrf(lists: Row[][], k = 60): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((doc, rank) => {
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

async function hybridSearch(db: Client, question: string, topK = 3): Promise<Row[]> {
  const [vec, kw] = await Promise.all([
    search(db, question, 10),      // pull DEEP, fuse, then trim
    keywordSearch(db, question, 10),
  ]);

  const fused = rrf([vec as Row[], kw]);
  const byId = new Map<number, Row>();
  [...(vec as Row[]), ...kw].forEach(r => byId.set(r.id, r));

  return [...fused.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, topK)
  .map(([id, rrfScore]) => ({ ...byId.get(id)!, rrfScore }));
}

const PROBES = [
  "What is Northgate Derivatives' minimum required rating?",
  "What is the annual cap on trustee and administrative expenses?",
  "What is the pool factor?",
  "Which state has the largest exposure?",
];

export const ALL_QUERIES = [
  ...PROBES,
  'What coupon do the Class A notes pay?',
  'What happens if the delinquency trigger is breached?',
  'What is the full order of payments in the waterfall?',
  'Was the rise in April delinquencies a sign of credit deterioration?',
  'How is the cumulative net loss ratio defined, and what is its current value?',
];

async function main() {
    console.log('=== PROBE: search() against Postgres vector store ===');
  const db = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'localdev', database: 'fde',
  });
  await db.connect();

  for (const q of ALL_QUERIES) {
    console.log(`\n########## ${q}`);
    for (const [name, fn] of [
        ['vector', (qq: string) => search(db, qq, 3)],
        ['keyword', (qq: string) => keywordSearch(db, qq, 3)],
        ['hybrid', (qq: string) => hybridSearch(db, qq, 3)],
    ] as const) {
        const rows = await fn(q);
        console.log(`-- ${name}`);
        rows.forEach((r: any, i: number) => console.log(`   ${i+1}. [${r.id}] ${r.content.slice(0, 85)}`));
    }
    }
  await db.end();
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('week2 day3 failed:', message);
    process.exitCode = 1;
  });
}