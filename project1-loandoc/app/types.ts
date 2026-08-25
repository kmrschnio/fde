export type Citation = {
  chunk_id: number;
  quote: string;
  supports: string;
};

export type Answer = {
  answer: string;
  citations: Citation[];
  verified: boolean;
  confidence: number;
  lowConfidence: boolean;
  sufficient_context: boolean;
  retrievedChunkCount: number;
  noContextReason?: 'no_indexed_chunks' | 'model_insufficient_context' | undefined;
};

export type DocumentChunk = {
  id: number;
  section: string | null;
  content: string;
};

export type DocumentRecord = {
  id: number;
  filename: string;
  status: string;
  chunk_count: number;
};
