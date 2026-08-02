import { useEffect, useRef, useState } from 'react';
import type { DocumentChunk, DocumentRecord } from '../types';

type DocumentResponse = {
  document: DocumentRecord;
  chunks: DocumentChunk[];
};

export type DocumentPaneProps = {
  document: DocumentRecord | null;
  highlight: number | null;
};

function DocumentPane({ document, highlight }: DocumentPaneProps) {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunkRefs = useRef<Record<number, HTMLParagraphElement | null>>({});

  useEffect(() => {
    if (!document) {
      setChunks([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/documents/${document.id}`)
      .then(async (response) => {
        const payload = (await response.json()) as DocumentResponse | { error: string };
        if (!response.ok || !('chunks' in payload)) {
          throw new Error('error' in payload ? payload.error : 'Could not load document context.');
        }
        return payload.chunks;
      })
      .then((nextChunks) => {
        if (!cancelled) {
          setChunks(nextChunks);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load document context.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document]);

  useEffect(() => {
    if (highlight) {
      chunkRefs.current[highlight]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight, chunks]);

  return (
    <section className="document-pane">
      <div className="document-pane__header">
        <div>
          <p className="panel-label">Source document</p>
          <h2>{document?.filename ?? 'No document loaded'}</h2>
        </div>
        {document ? <span className="chunk-count">{document.chunk_count} chunks</span> : null}
      </div>

      <div className="document-pane__body">
        {!document ? <p className="document-empty">Upload a PDF to read its complete indexed context here.</p> : null}
        {loading ? <p className="document-empty">Loading document text...</p> : null}
        {error ? <p className="document-empty">{error}</p> : null}
        {!loading && !error && chunks.map((chunk) => (
          <p
            key={chunk.id}
            ref={(node) => {
              chunkRefs.current[chunk.id] = node;
            }}
            className={highlight === chunk.id ? 'document-chunk document-chunk--highlighted' : 'document-chunk'}
          >
            {chunk.content}
          </p>
        ))}
      </div>
    </section>
  );
}
export default DocumentPane;