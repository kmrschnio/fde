'use client';
import { ChangeEvent, DragEvent, useState } from 'react';
import DocumentPane from './components/DocumentPane';
import AnswerPane from './components/AnswerPane';
import type { Answer, DocumentRecord } from './types';

export type { Answer, Citation, DocumentChunk, DocumentRecord } from './types';

export default function Home() {
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [highlightChunk, setHighlightChunk] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Choose a PDF file.');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);
    setHighlightChunk(null);

    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const payload = (await response.json()) as { document_id?: number; chunks?: number; error?: string };

      if (!response.ok || !payload.document_id) {
        setError(payload.error ?? 'The document could not be processed.');
        return;
      }

      setDocument({
        id: payload.document_id,
        filename: file.name,
        status: 'ready',
        chunk_count: payload.chunks ?? 0,
      });
    } catch {
      setError('Network error while uploading the PDF.');
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void upload(file);
    }
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void upload(file);
    }
  }

  async function ask() {
    if (!question.trim() || !document) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, documentId: document.id }),
      });
      const payload = (await res.json()) as Answer | { error: string };

      if (!res.ok) {
        const message = 'error' in payload ? payload.error : 'Failed to fetch answer.';
        setError(message);
        return;
      }

      setResult(payload as Answer);
      setHighlightChunk(null);
    } catch {
      setError('Network error while asking the question.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-5 text-[var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-[var(--muted)]">LOANDOC</p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Document workspace</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            {document ? <span>{document.filename}, {document.chunk_count} chunks</span> : <span>No document selected</span>}
            <span className={document ? 'status-dot status-dot--ready' : 'status-dot'} aria-hidden="true" />
          </div>
        </header>

        <label
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className={`upload-zone ${dragging ? 'upload-zone--active' : ''} ${uploading ? 'upload-zone--busy' : ''}`}
        >
          <input type="file" accept="application/pdf" onChange={handleFileInput} className="sr-only" disabled={uploading} />
          <span className="upload-zone__mark" aria-hidden="true">+</span>
          <span>{uploading ? 'Processing PDF...' : document ? 'Replace document' : 'Drop a PDF here or choose a file'}</span>
          <span className="upload-zone__detail">Extraction, chunking, and indexing happen automatically.</span>
        </label>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

        <section className="grid min-h-[650px] gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(390px,0.8fr)]">
          <DocumentPane document={document} highlight={highlightChunk} />
          <AnswerPane
            question={question}
            setQuestion={setQuestion}
            onAsk={ask}
            loading={loading}
            result={result}
            hasDocument={Boolean(document)}
            onCite={setHighlightChunk}
          />
        </section>
      </div>
    </main>
  );
}



