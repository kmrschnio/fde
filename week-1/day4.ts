// day4.ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const SENTENCES = [
	'The borrower missed three consecutive mortgage payments.',
	'Delinquency climbed to 6.2% in the subprime auto pool.',
	'Two loans defaulted after covenant breaches in June.',
	'The servicer moved 14 accounts into special servicing.',
	'Recovery proceeds were lower than expected after repossession.',
	'The facility reprices quarterly based on SOFR plus 280 basis points.',
	'The swap hedges floating-rate exposure on the mezzanine notes.',
	'A 75 bps rate hike increased debt service coverage pressure.',
	'The coupon steps up if leverage exceeds the trigger threshold.',
	'The spread tightened as demand for senior ABS improved.',
	'The loan is secured by a first-lien claim on logistics warehouses.',
	'Eligible collateral excludes receivables older than 120 days.',
	'The collateral advance rate dropped after appraisal cuts.',
	'The trustee released collateral only after payoff confirmation.',
	'Cross-collateralization links both facilities under one pledge package.',
	'The monthly remittance report reconciled principal, interest, and fees.',
	'Investors reviewed the surveillance report before the payment date.',
	'The servicer submitted delinquency tapes to the trustee portal.',
	'The spread report looked wider, but it summarized legal document versions.',
	'The collateral report was delayed because accounting closed late, not due to asset quality.',
] as const;

function loadEnvFromCommonPaths(): void {
	const candidates = [
		path.join(process.cwd(), '.env'),
		path.join(process.cwd(), '..', '.env'),
	];

	for (const envPath of candidates) {
		if (existsSync(envPath)) {
			loadDotenv({ path: envPath, override: false });
			return;
		}
	}

	// Fall back to default dotenv behavior when .env is not in common locations.
	loadDotenv();
}

function getVoyageApiKey(): string {
	const raw = process.env.VOYAGE_API_KEY;
	const normalized = raw?.trim().replace(/^['\"]|['\"]$/g, '');
	if (!normalized) {
		throw new Error(
			'Missing VOYAGE_API_KEY. Ensure it exists in .env (workspace root or current directory).',
		);
	}
	return normalized;
}

loadEnvFromCommonPaths();

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
			const json = await res.json();
			return json.data
				.sort((a: any, b: any) => a.index - b.index)
				.map((d: any) => d.embedding);
		}

		const errorBody = await res.text();
		if (res.status === 401) {
			throw new Error(
				`Voyage API 401: invalid VOYAGE_API_KEY. Verify the key value and active organization in the Voyage dashboard. Provider response: ${errorBody}`,
			);
		}

		if (res.status === 429 && attempt < 4) {
			const retryAfterHeader = res.headers.get('retry-after');
			const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
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

export function cosineSim(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) {
		return 0;
	}

	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		const av = a[i];
		const bv = b[i];
		if (av === undefined || bv === undefined) {
			return 0;
		}
		dot += av * bv;
		normA += av * av;
		normB += bv * bv;
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) {
		return 0;
	}
	return dot / denom;
}

function printTopNeighbors(sentences: readonly string[], vectors: number[][]): void {
	for (let i = 0; i < vectors.length; i += 1) {
		const sourceVector = vectors[i];
		if (sourceVector === undefined) {
			continue;
		}

		const sims: Array<{ idx: number; sim: number }> = [];
		for (let j = 0; j < vectors.length; j += 1) {
			if (i === j) {
				continue;
			}
			const targetVector = vectors[j];
			if (targetVector === undefined) {
				continue;
			}
			sims.push({ idx: j, sim: cosineSim(sourceVector, targetVector) });
		}

		sims.sort((x, y) => y.sim - x.sim);
		const top3 = sims.slice(0, 3);

		const sourceSentence = sentences[i] ?? '(missing sentence)';
		for (const n of top3) {
			const neighborSentence = sentences[n.idx] ?? '(missing sentence)';
		}
	}
}

async function main(): Promise<void> {
	console.log(`Embedding ${SENTENCES.length} sentences in one batched call...`);
	const vectors = await embed([...SENTENCES]);
	console.log(`Done embedding. Vectors shape: [${vectors.length}, ${vectors[0]?.length ?? 0}]`);
	printTopNeighbors(SENTENCES, vectors);
}

const isDirectRun =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error('day4 failed:', message);
		process.exitCode = 1;
	});
}
