// week4-day3.ts
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { StateGraph, MessagesAnnotation, END, START, MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDirectory, '../.env') });
dotenv.config({ path: path.join(scriptDirectory, '../project1-loandoc/.env.local') });

const { pool } = await import('../project1-loandoc/lib/db.js');
const { search } = await import('../project1-loandoc/lib/rag.js');

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
  throw new Error('Missing ANTHROPIC_API_KEY. Add it to the repository-root .env file.');
}

const SYSTEM = `You are a structured finance analyst assistant with access to a 
document library.

Rules:
- Use search_document to find facts. Never answer document-specific questions 
  from your own knowledge.
- If a tool returns an error, report the failure plainly. NEVER substitute your 
  own estimate or general knowledge for a failed tool result.
- Cite the chunk_id for any fact you state from a search result.
- If you don't know which document to search, call list_documents first.`;


// 1. TOOLS — same three as yesterday, wrapped in LangChain's tool()
const listDocuments = tool(
  async () => {
    const { rows } = await pool.query(
      'SELECT id, filename, chunk_count FROM documents WHERE status=$1 ORDER BY id', ['ready']);
    return JSON.stringify(rows);
  },
  {
    name: 'list_documents',
    description: 'List all indexed documents available to query.',
    schema: z.object({}),
  },
);

const searchDocument = tool(
  async ({ document_id, query }) => {
    const chunks = await search(query, document_id);
    return JSON.stringify(chunks.map((chunk) => ({
      chunk_id: chunk.id, relevance: chunk.similarity, content: chunk.content,
    })));
  },
  {
    name: 'search_document',
    description: 'Search a specific document for passages relevant to a query.',
    schema: z.object({
      document_id: z.number().describe('The document to search, from list_documents'),
      query: z.string().describe('What to search for'),
    }),
  },
);

const tools = [listDocuments, searchDocument];
const model = new ChatAnthropic({
  model: 'claude-haiku-4-5',
  apiKey: anthropicApiKey,
}).bindTools(tools);

// 2. NODES
async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await model.invoke([
    { role: 'system', content: SYSTEM },   // your anti-substitution prompt
    ...state.messages,
  ]);
  return { messages: [response] };        // partial update — appended to state
}

const toolNode = new ToolNode(tools);      // prebuilt: runs whatever tools were called

// 3. THE CONDITIONAL EDGE — your `if (stop_reason !== 'tool_use')` check
function shouldContinue(state: typeof MessagesAnnotation.State) {
  const last = state.messages.at(-1) as any;
  return last?.tool_calls?.length ? 'tools' : END;
}

// 4. WIRE THE GRAPH
const builder = new StateGraph(MessagesAnnotation)
  .addNode('model', callModel)
  .addNode('tools', toolNode)
  .addEdge(START, 'model')
  .addConditionalEdges('model', shouldContinue, ['tools', END])
  .addEdge('tools', 'model');             // after tools, always back to model

// 5. RUN
const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });
async function main() {
  const cfg = { configurable: { thread_id: 'conv-1' } };

  const r1 = await graph.invoke(
    { messages: [{ role: 'user', content: 'What documents do you have?' }] }, cfg);
  console.log('A1:', r1.messages.at(-1)?.content);

  // NOTE: only the NEW message — prior turns come from the checkpoint
  const r2 = await graph.invoke(
    { messages: [{ role: 'user', content: 'What is the servicing fee in the third one?' }] }, cfg);
  console.log('A2:', r2.messages.at(-1)?.content);

  // isolation test — different thread, same follow-up, no prior context
  const cfg2 = { configurable: { thread_id: 'conv-2' } };
  const r3 = await graph.invoke(
    { messages: [{ role: 'user', content: 'What is the servicing fee in the third one?' }] }, cfg2);
  console.log('A3 (fresh thread):', r3.messages.at(-1)?.content);
}

main().catch(console.error);