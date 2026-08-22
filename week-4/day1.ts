// week4-day1.ts
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDirectory, '../.env') });
dotenv.config({ path: path.join(scriptDirectory, '../project1-loandoc/.env.local') });

const { pool } = await import('../project1-loandoc/lib/db.js');
const { search } = await import('../project1-loandoc/lib/rag.js');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOL_FAULT = process.env.TOOL_FAULT === '1';

const SYSTEM = `You are a structured finance analyst assistant with access to a 
document library.

Rules:
- Use search_document to find facts. Never answer document-specific questions 
  from your own knowledge.
- If a tool returns an error, report the failure plainly. NEVER substitute your 
  own estimate or general knowledge for a failed tool result.
- Cite the chunk_id for any fact you state from a search result.
- If you don't know which document to search, call list_documents first.`;

// A trivial tool to start: no RAG, no DB — just prove the loop.
const tools: Anthropic.Tool[] = [
  {
    name: 'list_documents',
    description: 'List all indexed documents available to query. Returns id, filename, and chunk count. Call this first when you need to know what documents exist.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_document',
    description: 'Search a specific document for passages relevant to a query. Returns the most relevant passages with their ids and relevance scores. Use this to find facts stated in a document.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: { type: 'number', description: 'The document to search, from list_documents' },
        query: { type: 'string', description: 'What to search for — a question or topic' },
      },
      required: ['document_id', 'query'],
    },
  },
  {
    name: 'get_document_stats',
    description: 'Get structured metrics about a document: chunk count, upload date, filename.',
    input_schema: {
      type: 'object',
      properties: { document_id: { type: 'number' } },
      required: ['document_id'],
    },
  },
];

// YOUR code executes the tool — the model only asks for it.
async function runTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case 'list_documents': {
        const { rows } = await pool.query(
          'SELECT id, filename, chunk_count FROM documents WHERE status=$1 ORDER BY id', ['ready']);
        return JSON.stringify(rows);
      }
      case 'search_document': {
        const chunks = await search(input.query, input.document_id);
        return JSON.stringify(chunks.map((chunk) => ({
          chunk_id: chunk.id, relevance: chunk.similarity, content: chunk.content,
        })));
      }
      case 'get_document_stats': {
        const { rows } = await pool.query(
          'SELECT id, filename, chunk_count, created_at FROM documents WHERE id=$1', [input.document_id]);
        return JSON.stringify(rows[0] ?? { error: 'document not found' });
      }
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });   // errors go BACK to the model
  }
}

async function agent(question: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ];

  // THE LOOP — keep going until the model stops asking for tools
  for (let turn = 0; turn < 5; turn++) {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      messages,
    });

    console.log(`\n--- turn ${turn} | stop_reason: ${res.stop_reason}`);

    // append the model's turn (may contain text + tool_use blocks)
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      // model is done — print its final text answer
      const text = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      console.log('FINAL:', text);
      return text;
    }

    // model asked for one or more tools — run each, collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === 'tool_use') {
        console.log(`  tool_use: ${block.name}(${JSON.stringify(block.input)})`);
        const result = await runTool(block.name, block.input);
        console.log(`  tool_result: ${result}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }
    }
    // send results back as a user turn — the loop continues
    messages.push({ role: 'user', content: toolResults });
  }
}

const EXPERIMENTS = [
  // 1. discovery chain — list, pick the right id, then search
  'What documents do you have, and what is the servicing fee in the Horizon one?',
  // 2. cross-document comparison — the headline test
  'Which document has the highest Class A coupon?',
  // 3. vague query — does it refine?
  'What are the risks in the Meridian deal?',
];

async function main() {
  for (const q of EXPERIMENTS) {
    console.log(`\n${'='.repeat(70)}\nQ: ${q}`);
    await agent(q);
  }
}
main().catch(console.error);