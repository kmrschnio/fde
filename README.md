# FDE

Financial development engineering exercises and the LoanDoc document-intelligence project.

## Current Working Map

```mermaid
flowchart TB
  subgraph W1[Week 1: LLM and Retrieval Foundations]
    W1D1[Day 1: Anthropic helper\nstreaming and retries]
    W1D2[Day 2: Loan extraction\nZod validation and repair]
    W1D3[Day 3: Multi-turn chat\npolicy and red-team checks]
    W1D4[Day 4: Voyage embeddings\ncosine similarity]
    W1D5[Day 5: Chunking evaluation\nfixed, sentence, structure-aware]
    W1D6[Day 6: PostgreSQL + pgvector\ningest and semantic search]
    W1D1 --> W1D2 --> W1D3 --> W1D4 --> W1D5 --> W1D6
  end

  subgraph W2[Week 2: Grounded RAG Quality]
    W2D1[Day 1: Retrieve, augment, generate]
    W2D2[Day 2: Structured cited answers\nverbatim verification]
    W2D3[Day 3: Keyword search comparison]
    W2D4[Day 4: Voyage reranking]
    W2D5[Day 5: Threshold policy\nconfidence and citation checks]
    W2D1 --> W2D2 --> W2D3 --> W2D4 --> W2D5
  end

  subgraph W3[Week 3]
    W3Status[No implementation files yet]
  end

  subgraph W4[Week 4: Tool-Using Agent]
    W4D1[Day 1: Manual Claude tool loop]
    W4Tools[list_documents\nsearch_document\nget_document_stats]
    W4D3[Day 3: LangGraph agent\nToolNode and MemorySaver]
    W4Memory[Thread-scoped\ncheckpoint memory]
    W4D1 --> W4Tools
    W4D3 --> W4Tools
    W4D3 --> W4Memory
  end

  W1D6 --> W2D1
  W2D5 --> Project
  Project --> W4Tools

  subgraph Project[Project 1: LoanDoc]
    UI[Next.js document workspace]
    Upload[POST /api/upload]
    Ask[POST /api/ask]
    DocumentAPI[GET /api/documents/:id]

    PDF[PDF parse and clean]
    Deduplicate[SHA-256 file hash\nduplicate upload reuse]
    Chunk[Structure-aware chunking]
    Embed[Voyage embeddings]
    DB[(PostgreSQL + pgvector\ndocuments and chunks)]

    Search[Document-scoped\nvector search]
    Rerank[Voyage reranking\nvector fallback]
    Generate[Claude cited JSON answer]
    Verify[Citation verification\nconfidence result]

    UI --> Upload
    UI --> Ask
    UI --> DocumentAPI
    Upload --> Deduplicate --> PDF --> Chunk --> Embed --> DB
    Ask --> Search --> Rerank --> Generate --> Verify --> UI
    DocumentAPI --> DB
    DB --> Search
  end
```

## Status

- Week 1: implemented Days 1-6.
- Week 2: implemented Days 1-5.
- Week 3: no tracked implementation files.
- Week 4: Day 1 manual tool agent and Day 3 LangGraph checkpointed agent implemented.
- Project 1: [LoanDoc](project1-loandoc/README.md) ingestion, grounded Q&A, citations, deployment configuration, and upload deduplication.