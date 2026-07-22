// week2-day1.ts
import 'dotenv/config';
import { Client } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { search } from '../week-1/day6.js'; // add the isMainModule guard to day6 too

const anthropic = new Anthropic();

const RAG_SYSTEM = `You are a financial analyst assistant. Answer the user's 
question using ONLY the provided context chunks. 

Rules:
- If the context doesn't contain the answer, say "I don't have enough 
  information to answer that" — do NOT use outside knowledge.
- Cite the chunk id(s) you used in square brackets, e.g. [2].
- Be concise and precise with numbers.`;

async function answer(db: Client, question: string): Promise<string> {
  // 1. RETRIEVE — top 3 chunks from your Postgres store
  const chunks = await search(db, question, 3);

  // 2. AUGMENT — build a context block the model can cite
  const context = chunks
    .map(c => `[${c.id}] (${c.section ?? 'n/a'}) ${c.content}`)
    .join('\n\n');

  // 3. GENERATE — ask the model, giving it the context
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: RAG_SYSTEM,
    messages: [{
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    }],
  });

  // return both the answer AND which chunks fed it (for your own inspection)
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

const QUESTIONS = [
        'What coupon do the Class A notes pay?',
        'What happens if the delinquency trigger is breached?',
        'What is the full order of payments in the waterfall?',
        'Was the rise in April delinquencies a sign of credit deterioration?',
        'How is the cumulative net loss ratio defined, and what is its current value?',
        "What is this transaction's credit rating from Moody's?"
    ];

for (const q of QUESTIONS) {
  const db = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'localdev', database: 'fde',
  });
  await db.connect();
  const answerText = await answer(db, q);
  console.log(`\nQ: ${q}\nA: ${answerText}`);
  await db.end();
}