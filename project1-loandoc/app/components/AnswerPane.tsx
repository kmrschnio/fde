import type { Answer } from '../types';

type AnswerPaneProps = {
  question: string;
  setQuestion: (value: string) => void;
  onAsk: () => Promise<void>;
  loading: boolean;
  result: Answer | null;
  hasDocument: boolean;
  onCite: (chunkId: number | null) => void;
};

function AnswerPane({
  question,
  setQuestion,
  onAsk,
  loading,
  result,
  hasDocument,
  onCite,
}: AnswerPaneProps) {
  return (
    <section className="answer-pane">
      <div className="answer-pane__header">
        <div>
          <p className="panel-label">Analysis</p>
          <h2>Ask this document</h2>
        </div>
      </div>

      <label className="input-label" htmlFor="document-question">Your question</label>
      <div className="ask-form">
        <input
          id="document-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !loading) {
              void onAsk();
            }
          }}
          placeholder="What's the delinquency trigger?"
          disabled={!hasDocument || loading}
          className="ask-input"
        />
        <button
          type="button"
          onClick={() => {
            void onAsk();
          }}
          disabled={!hasDocument || loading}
          className="ask-button"
        >
          {loading ? 'Searching...' : 'Ask'}
        </button>
      </div>

      {result ? (
        <div className="answer-result">
          {!result.sufficient_context ? (
            <div className="answer-empty">
              <p>This document does not contain enough context to answer that question.</p>
            </div>
          ) : (
            <>
              <div className="answer-signals">
                <span className="confidence-chip">Confidence {Math.round(result.confidence * 100)}%</span>
                {result.verified ? <span className="verified-chip">Verified</span> : null}
              </div>
              <p className="answer-copy">{result.answer}</p>
              {result.lowConfidence ? (
                <p className="verify-note">Verify this answer against the highlighted source.</p>
              ) : null}
            </>
          )}

          <div className="citations">
            <p className="panel-label">Sources</p>
            {result.citations.length === 0 ? (
              <p className="citation-empty">No supporting passages were found.</p>
            ) : (
              <ul>
                {result.citations.map((citation) => (
                  <li key={`${citation.chunk_id}-${citation.supports}`}>
                    <button
                      type="button"
                      onClick={() => onCite(citation.chunk_id)}
                      className="citation-link"
                    >
                      <span className="citation-link__number">{citation.chunk_id}</span>
                      <span>{citation.supports}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="answer-empty">
          <p>{hasDocument ? 'Ask anything about this document.' : 'Upload a PDF to begin.'}</p>
        </div>
      )}
    </section>
  );
}

export default AnswerPane;