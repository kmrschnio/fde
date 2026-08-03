
import Anthropic from '@anthropic-ai/sdk';
import { pool } from './db';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FLOOR = 0.5;
const MIN_K = 3;
const CANDIDATES = 15;

type FaultMode = 'none' | 'bad_quote' | 'bad_chunk';

export interface ChunkRow {
  id: number;
  section: string | null;
  content: string;
  similarity?: number;
}

export interface RetrievedChunk {
  id: number;
  section: string | null;
  content: string;
}

export interface Citation {
  chunk_id: number;
  quote: string;
  supports: string;
}

export interface CitedAnswer {
  answer: string;
  citations: Citation[];
  sufficient_context: boolean;
}

export interface AnswerResult {
  answer: string;
  sufficient_context: boolean;
  citations: Citation[];
  verified: boolean;
  confidence: number;
  lowConfidence: boolean;
  retrievedChunkCount: number;
  noContextReason?: 'no_indexed_chunks' | 'model_insufficient_context';
}

interface RerankItem {
  index: number;
  relevance_score: number;
}

interface VoyageRerankResponse {
  data: RerankItem[];
}

interface VoyageEmbeddingItem {
  index: number;
  embedding: number[];
}

interface VoyageEmbeddingResponse {
  data: VoyageEmbeddingItem[];
}

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

function getVoyageApiKey(): string {
  const raw = process.env.VOYAGE_API_KEY;
  const normalized = raw?.trim().replace(/^['\"]|['\"]$/g, '');
  if (!normalized) {
    throw new Error('Missing VOYAGE_API_KEY. Ensure it exists in .env.local.');
  }
  return normalized;
}

function getFaultMode(): FaultMode {
  const raw = process.env.CITATION_FAULT;
  if (raw === 'bad_quote' || raw === 'bad_chunk') {
    return raw;
  }
  return 'none';
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractText(content: Anthropic.Message['content']): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('```')) {
    const withoutStartFence = trimmed.replace(/^```[a-zA-Z]*\s*/, '');
    const withoutEndFence = withoutStartFence.replace(/\s*```\s*$/, '');
    return withoutEndFence.trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1).trim();
  }

  return trimmed;
}

function isCitation(value: unknown): value is Citation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Citation>;
  return (
    typeof candidate.chunk_id === 'number'
    && Number.isFinite(candidate.chunk_id)
    && typeof candidate.quote === 'string'
    && typeof candidate.supports === 'string'
  );
}

function isCitedAnswer(value: unknown): value is CitedAnswer {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CitedAnswer>;
  return (
    typeof candidate.answer === 'string'
    && Array.isArray(candidate.citations)
    && candidate.citations.every(isCitation)
    && typeof candidate.sufficient_context === 'boolean'
  );
}

function parseCitedAnswer(raw: string): CitedAnswer {
  const payload = extractJsonPayload(raw);
  const parsed = JSON.parse(payload) as unknown;

  if (!isCitedAnswer(parsed)) {
    throw new Error('Model output did not match required cited-answer JSON shape.');
  }

  if (!parsed.sufficient_context && parsed.citations.length > 0) {
    throw new Error('When sufficient_context is false, citations must be empty.');
  }

  return parsed;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = getVoyageApiKey();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'voyage-3.5-lite', input: texts }),
    });

    if (res.ok) {
      const json = (await res.json()) as VoyageEmbeddingResponse;
      return json.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    }

    const errorBody = await res.text();
    if (res.status === 401) {
      throw new Error(
        `Voyage API 401: invalid VOYAGE_API_KEY. Provider response: ${errorBody}`,
      );
    }

    if (res.status === 429 && attempt < 4) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(0, retryAfterSeconds * 1000)
        : 0;
      const backoffMs = Math.max(retryAfterMs, (attempt + 1) * 20_000);

      console.warn(
        `Voyage rate limit hit (attempt ${attempt + 1}/5). Retrying in ${Math.round(backoffMs / 1000)}s...`,
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, backoffMs);
      });
      continue;
    }

    throw new Error(`Voyage API ${res.status}: ${errorBody}`);
  }

  throw new Error('Voyage API 429: retries exhausted after repeated rate limiting.');
}

export async function rerank(query: string, docs: string[], topK: number): Promise<RerankItem[]> {
  if (docs.length === 0) {
    return [];
  }

  const res = await fetch('https://api.voyageai.com/v1/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getVoyageApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'rerank-2.5-lite',
      query,
      documents: docs,
      top_k: topK,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage rerank ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as VoyageRerankResponse;
  return json.data;
}

export async function search(question: string, documentId: number, k = 3): Promise<ChunkRow[]> {
  const [queryVector] = await embed([question]);
  if (!queryVector) {
    throw new Error('Embedding failed for query text.');
  }

  const vectorLiteral = `[${queryVector.join(',')}]`;
  const res = await pool.query(
    `WITH document_chunks AS MATERIALIZED (
       SELECT id, section, content, embedding
       FROM chunks
       WHERE document_id = $2
     )
     SELECT id, section, content,
            1 - (embedding <=> $1) AS similarity
     FROM document_chunks
     ORDER BY embedding <=> $1
     LIMIT $3`,
    [vectorLiteral, documentId, k],
  );

  return res.rows as ChunkRow[];
}

async function retrieveAndRank(question: string, documentId: number): Promise<{
  selected: Array<RetrievedChunk & { relevance: number }>;
  confidence: number;
}> {
  const candidates = await search(question, documentId, CANDIDATES);
  if (candidates.length === 0) {
    return { selected: [], confidence: 0 };
  }

  const topK = Math.min(CANDIDATES, candidates.length);
  const ranked = await rerank(question, candidates.map((candidate) => candidate.content), topK);
  const scored = ranked.map((item) => ({
    ...candidates[item.index],
    relevance: item.relevance_score,
  }));

  const aboveFloor = scored.filter((candidate) => candidate.relevance >= FLOOR);
  const selected = aboveFloor.length >= MIN_K ? aboveFloor : scored.slice(0, MIN_K);
  const confidence = scored[0]?.relevance ?? 0;

  const validSelected = selected.filter(
    (candidate): candidate is RetrievedChunk & { relevance: number } => {
      return candidate != null && typeof candidate.id === 'number' && typeof candidate.content === 'string';
    },
  );

  return { selected: validSelected, confidence };
}

export function verifyCitations(
  citations: Array<{ chunk_id: number; quote: string }>,
  chunks: Array<{ id: number; content: string }>,
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

    const normalizedChunk = normalize(chunk.content);
    const normalizedQuote = normalize(citation.quote);
    if (!normalizedChunk.includes(normalizedQuote)) {
      failures.push(
        `Quote not found verbatim in chunk_id=${citation.chunk_id}: ${JSON.stringify(citation.quote)}`,
      );
    }
  }

  return { valid: failures.length === 0, failures };
}

export async function generateCitedAnswer(
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

  const fault = getFaultMode();
  const citation = result.citations[0];
  const injectors: Record<FaultMode, (item: Citation) => void> = {
    none: () => undefined,
    bad_quote: (item) => {
      item.quote = '__INTENTIONAL_BAD_QUOTE_DOES_NOT_EXIST_IN_CHUNK__';
    },
    bad_chunk: (item) => {
      item.chunk_id = 999;
    },
  };

  if (citation) {
    injectors[fault](citation);
  }

  return { result, raw };
}

export async function answer(question: string, documentId: number): Promise<AnswerResult> {
  const { selected, confidence } = await retrieveAndRank(question, documentId);

  console.info('[rag] retrieval', {
    documentId,
    selectedChunkIds: selected.map((chunk) => chunk.id),
    confidence,
  });

  if (selected.length === 0) {
    return {
      answer: `No indexed chunks were found for document_id=${documentId}. Upload/process the document or use a valid document ID.`,
      sufficient_context: false,
      citations: [],
      verified: true,
      confidence: 0,
      lowConfidence: true,
      retrievedChunkCount: 0,
      noContextReason: 'no_indexed_chunks',
    };
  }

  const lowConfidence = confidence < FLOOR;
  const chunks = selected.map((candidate) => ({
    id: candidate.id,
    section: candidate.section ?? null,
    content: candidate.content,
  }));

  const generated = await generateCitedAnswer(question, chunks);
  const verification = verifyCitations(
    generated.result.citations,
    chunks.map((chunk) => ({ id: chunk.id, content: chunk.content })),
  );

  if (!generated.result.sufficient_context) {
    console.warn('[rag] model reported insufficient context', {
      documentId,
      selectedChunkIds: selected.map((chunk) => chunk.id),
      confidence,
    });
  }

  return {
    answer: generated.result.answer,
    sufficient_context: generated.result.sufficient_context,
    citations: generated.result.citations,
    verified: verification.valid,
    confidence,
    lowConfidence,
    retrievedChunkCount: selected.length,
    noContextReason: generated.result.sufficient_context
      ? undefined
      : 'model_insufficient_context',
  };
}