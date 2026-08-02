interface VoyageEmbeddingItem {
  index: number;
  embedding: number[];
}

interface VoyageEmbeddingResponse {
  data: VoyageEmbeddingItem[];
}

function getVoyageApiKey(): string {
  const raw = process.env.VOYAGE_API_KEY;
  const normalized = raw?.trim().replace(/^['\"]|['\"]$/g, '');
  if (!normalized) {
    throw new Error('Missing VOYAGE_API_KEY. Ensure it exists in .env.local.');
  }
  return normalized;
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
      throw new Error(`Voyage API 401: invalid VOYAGE_API_KEY. Provider response: ${errorBody}`);
    }

    if (res.status === 429 && attempt < 4) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? Math.max(0, retryAfterSeconds * 1000) : 0;
      const backoffMs = Math.max(retryAfterMs, (attempt + 1) * 20_000);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, backoffMs);
      });
      continue;
    }

    throw new Error(`Voyage API ${res.status}: ${errorBody}`);
  }

  throw new Error('Voyage API 429: retries exhausted after repeated rate limiting.');
}
