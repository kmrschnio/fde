// day6.ts — reuse embed() from day4
import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { embed } from './week-1/day4.js';
import { chunkStructure } from './week-1/day5.js'; // your Day-5 winner

const DIM = 1024; // must match your embedding model exactly

interface ChunkRow {
  id: number;
  section: string | null;
  content: string;
  similarity: string | number;
}

async function setup(db: Client) {
  await db.query('CREATE EXTENSION IF NOT EXISTS vector');
  await db.query('DROP TABLE IF EXISTS chunks');
  await db.query(`
    CREATE TABLE chunks (
      id        SERIAL PRIMARY KEY,
      content   TEXT NOT NULL,
      section   TEXT,               -- metadata: which section it came from
      embedding vector(${DIM})
    )
  `);
}

async function ingest(db: Client, texts: string[], vectors: number[][]) {
  for (let i = 0; i < texts.length; i++) {
    const vector = vectors[i];
    if (!vector) throw new Error(`Missing vector for chunk ${i}`);
    const literal = '[' + vector.join(',') + ']';  // '[0.1,0.2,...]'
    await db.query(
      'INSERT INTO chunks (content, embedding) VALUES ($1, $2)',
      [texts[i], literal],
    );
  }
}

async function search(db: Client, question: string, k = 3): Promise<ChunkRow[]> {
  const [qv] = await embed([question]);
  if (!qv) throw new Error('Embedding failed');
  const literal = '[' + qv.join(',') + ']';
  // The magic line — cosine DISTANCE operator is <=>
  // distance = 1 - cosineSimilarity, so SMALLER = closer. ORDER BY ascending.
  const res = await db.query(
    `SELECT id, section, content,
            1 - (embedding <=> $1) AS similarity
     FROM chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [literal, k],
  );
  return res.rows as ChunkRow[];
}

async function main() {
  const db = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'localdev', database: 'fde',
  });
  await db.connect();
  await setup(db);

  const DOC = readFileSync('meridian-servicing-report.txt', 'utf-8');
  const chunks = chunkStructure(DOC);
  const vectors = await embed(chunks.map(c => c.text)); // ONE batch call
  await ingest(db, chunks.map(c => c.text), vectors);
  console.log(`Ingested ${chunks.length} chunks`);

  // Re-run your 5 test questions — now against the DATABASE
  for (const q of [
    'What coupon do the Class A notes pay?',
    'What happens if the delinquency trigger is breached?',
    'What is the full order of payments in the waterfall?',
  ]) {
    console.log(`\nQ: ${q}`);
    const rows = await search(db, q);
    rows.forEach((r: ChunkRow) => console.log(`  [${r.id}] sim=${Number(r.similarity).toFixed(4)} ${r.content.slice(0, 90)}`));
  }
  await db.end();
}
main().catch(console.error);