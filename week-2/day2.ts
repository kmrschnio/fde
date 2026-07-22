// week2-day2.ts
import 'dotenv/config';
import { Client } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { search } from '../week-1/day6.js';

const anthropic = new Anthropic();
type FaultMode = 'none' | 'bad_quote' | 'bad_chunk';

function getFaultMode(): FaultMode {
  const raw = process.env.CITATION_FAULT;
  if (raw === 'bad_quote' || raw === 'bad_chunk') {
    return raw;
  }
  return 'none';
}

interface RetrievedChunk {
  id: number;
  section: string | null;
  content: string;
}

const CitedAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    chunk_id: z.number(),
    quote: z.string(),        // MUST be verbatim from that chunk
    supports: z.string(),     // which claim in the answer this backs
  })),
  sufficient_context: z.boolean(),  // did the context actually contain the answer?
});
type CitedAnswer = z.infer<typeof CitedAnswerSchema>;

const CITED_SYSTEM = `You are a financial analyst assistant. Answer using ONLY 
the provided context chunks.

Return ONLY valid JSON matching this shape:
{
  "answer": "your answer text",
  "citations": [
    {"chunk_id": 2, "quote": "exact text copied verbatim from chunk 2", 
     "supports": "the claim this quote backs up"}
  ],
  "sufficient_context": true
}

Rules:
- Every factual claim in "answer" must have a citation.
- "quote" MUST be copied character-for-character from the cited chunk. 
  Do not paraphrase, truncate mid-word, or reformat.
- If the context does not contain the answer, set sufficient_context to false, 
  explain in "answer", and return an empty citations array.
- No markdown fences, no prose outside the JSON.`;

// THE VERIFIER — this is the day's real deliverable
function verifyCitations(
  citations: Array<{chunk_id: number; quote: string}>,
  chunks: Array<{id: number; content: string}>,
): { valid: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const citation of citations) {
    const chunk = chunks.find((candidate) => candidate.id === citation.chunk_id);
    if (!chunk) {
      failures.push(
        `Citation references missing chunk_id=${citation.chunk_id} (hallucinated citation).`,
      );
      continue;
    }

    if (!chunk.content.includes(citation.quote)) {
      failures.push(
        `Quote not found verbatim in chunk_id=${citation.chunk_id}: ${JSON.stringify(citation.quote)}`,
      );
    }
  }

  return { valid: failures.length === 0, failures };
}

function extractText(content: Anthropic.Messages.Message['content']): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();

  // Handle fenced blocks like ```json ... ``` or ``` ... ```.
  if (trimmed.startsWith('```')) {
    const withoutStartFence = trimmed.replace(/^```[a-zA-Z]*\s*/, '');
    const withoutEndFence = withoutStartFence.replace(/\s*```\s*$/, '');
    return withoutEndFence.trim();
  }

  // If model adds prose around JSON, keep only the outermost JSON object span.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1).trim();
  }

  return trimmed;
}

function parseCitedAnswer(raw: string): CitedAnswer {
  const jsonPayload = extractJsonPayload(raw);
  const data = JSON.parse(jsonPayload);
  const parsed = CitedAnswerSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
}

async function generateCitedAnswer(
  question: string,
  chunks: RetrievedChunk[],
): Promise<{ result: CitedAnswer; raw: string }> {
  const context = chunks
    .map((chunk) => `[${chunk.id}] (${chunk.section ?? 'n/a'}) ${chunk.content}`)
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: CITED_SYSTEM,
    messages: [{
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    }],
  });

  const raw = extractText(response.content);
  const result = parseCitedAnswer(raw);

  // TEMPORARY — fault injection to prove the verifier catches things
    const FAULT = getFaultMode();
    const c = result.citations[0];
    const injectors: Record<FaultMode, (citation: CitedAnswer['citations'][number]) => void> = {
      none: () => undefined,
      bad_quote: (citation) => {
        citation.quote = '__INTENTIONAL_BAD_QUOTE_DOES_NOT_EXIST_IN_CHUNK__';
      },
      bad_chunk: (citation) => {
        citation.chunk_id = 999;
      },
    };
    if (c) {
      injectors[FAULT](c);
    }
  return { result, raw };
}

async function answerWithVerifiedCitations(
  db: Client,
  question: string,
): Promise<{
  answer: CitedAnswer;
  chunks: RetrievedChunk[];
  verification: { valid: boolean; failures: string[] };
}> {
  const chunks = await search(db, question, 3) as RetrievedChunk[];

  let latestRaw = '';
  for (let repairAttempt = 0; repairAttempt <= 2; repairAttempt += 1) {
    try {
      const generated = await generateCitedAnswer(question, chunks);
      latestRaw = generated.raw;

      if (!generated.result.sufficient_context && generated.result.citations.length > 0) {
        throw new Error('When sufficient_context is false, citations must be empty.');
      }

      const verification = verifyCitations(generated.result.citations, chunks);
      if (!verification.valid) {
        console.log('⚠️  VERIFICATION FAILED (attempt ' + repairAttempt + '):');
        verification.failures.forEach(f => console.log('   - ' + f));
        console.log('   → attempting repair...');
        if (repairAttempt === 2) {
          return { answer: generated.result, chunks, verification };
        }

        const repairPrompt = `Your previous JSON had invalid citations.

Question:
${question}

Context chunks:
${chunks.map((chunk) => `[${chunk.id}] (${chunk.section ?? 'n/a'}) ${chunk.content}`).join('\n\n')}

Previous JSON:
${latestRaw}

Citation verification failures:
${verification.failures.map((f, idx) => `${idx + 1}. ${f}`).join('\n')}

Fix and return ONLY valid JSON matching the required schema. Quotes must be verbatim.`;

        const repaired = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          system: CITED_SYSTEM,
          messages: [{ role: 'user', content: repairPrompt }],
        });

        latestRaw = extractText(repaired.content);
        const repairedResult = parseCitedAnswer(latestRaw);
        const repairedVerification = verifyCitations(repairedResult.citations, chunks);

        if (repairedVerification.valid) {
          return { answer: repairedResult, chunks, verification: repairedVerification };
        }

        if (repairAttempt === 2) {
          return { answer: repairedResult, chunks, verification: repairedVerification };
        }

        continue;
      }

      return { answer: generated.result, chunks, verification };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (repairAttempt === 2) {
        throw new Error(`Failed to produce verified cited answer: ${message}`);
      }

      const repairPrompt = `Your previous output was invalid for the required schema.

Question:
${question}

Context chunks:
${chunks.map((chunk) => `[${chunk.id}] (${chunk.section ?? 'n/a'}) ${chunk.content}`).join('\n\n')}

Previous output:
${latestRaw || '(empty)'}

Error:
${message}

Return ONLY corrected JSON matching the required shape.`;

      const repaired = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: CITED_SYSTEM,
        messages: [{ role: 'user', content: repairPrompt }],
      });

      latestRaw = extractText(repaired.content);
      const repairedResult = parseCitedAnswer(latestRaw);
      const repairedVerification = verifyCitations(repairedResult.citations, chunks);

      if (repairedVerification.valid) {
        return { answer: repairedResult, chunks, verification: repairedVerification };
      }
    }
  }

  throw new Error('Unreachable: citation generation loop exited unexpectedly.');
}

const QUESTIONS = [
  'What coupon do the Class A notes pay?',
  'What happens if the delinquency trigger is breached?',
  'What is the full order of payments in the waterfall?',
  'Was the rise in April delinquencies a sign of credit deterioration?',
  'How is the cumulative net loss ratio defined, and what is its current value?',
  "What is this transaction's credit rating from Moody's?",
];

async function main(): Promise<void> {
  const db = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'localdev',
    database: 'fde',
  });

  await db.connect();

  try {
    for (const question of QUESTIONS) {
      const result = await answerWithVerifiedCitations(db, question);
      console.log(`\nQ: ${question}`);
      console.log(`A: ${result.answer.answer}`);
      console.log(`sufficient_context: ${result.answer.sufficient_context}`);

      if (result.answer.citations.length === 0) {
        console.log('citations: []');
      } else {
        console.log('citations:');
        for (const citation of result.answer.citations) {
          console.log(`  - chunk_id=${citation.chunk_id}`);
          console.log(`    supports=${citation.supports}`);
          console.log(`    quote=${citation.quote}`);
        }
      }

      if (!result.verification.valid) {
        console.log('verification: FAILED');
        for (const failure of result.verification.failures) {
          console.log(`  - ${failure}`);
        }
      } else {
        console.log('verification: OK');
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
    console.error('week2 day2 failed:', message);
    process.exitCode = 1;
  });
}