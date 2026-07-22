// day5.ts — reuse embed() and cosineSim() from day4
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cosineSim, embed } from './day4.js';

type Chunk = { id: number; text: string; strategy: string };

// Strategy 1: fixed-size — every ~500 chars, hard cut.
// Deliberately dumb: it WILL slice sentences in half. That's the point.
function chunkFixed(text: string, size = 500): Chunk[] {
    const chunks: Chunk[] = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push({
            id: i / size,
            text: text.slice(i, i + size),
            strategy: 'fixed',
        });
    }
    return chunks;
}

// Strategy 2: sentence-boundary — split into sentences, pack them
// greedily into chunks up to ~500 chars without breaking a sentence.
function chunkSentences(text: string, maxSize = 500): Chunk[] {
    const sentences = text.split(/(?<=\.)\s+/);
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let currentId = 0;

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= maxSize) {
            currentChunk += sentence + ' ';
        } else {
            chunks.push({
                id: currentId++,
                text: currentChunk.trim(),
                strategy: 'sentences',
            });
            currentChunk = sentence + ' ';
        }
    }

    if (currentChunk) {
        chunks.push({
            id: currentId++,
            text: currentChunk.trim(),
            strategy: 'sentences',
        });
    }

    return chunks;
}

// Strategy 3: structure-aware — split on paragraphs/section headings
// (blank lines, numbered headings), keep sections whole where possible,
// pack small paragraphs together up to ~800 chars.
export function chunkStructure(text: string): Chunk[] { 
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let currentId = 0;

    for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length <= 800) {
            currentChunk += paragraph + '\n\n';
        } else {
            chunks.push({
                id: currentId++,
                text: currentChunk.trim(),
                strategy: 'structure',
            });
            currentChunk = paragraph + '\n\n';
        }
    }

    if (currentChunk) {
        chunks.push({
            id: currentId++,
            text: currentChunk.trim(),
            strategy: 'structure',
        });
    }

    return chunks;
}

// Retrieval harness using precomputed vectors to avoid repeated API calls.
function retrieve(queryVector: number[], chunks: Chunk[], chunkVectors: number[][]): Chunk[] {
    const sims = chunkVectors.map((vec, idx) => ({
        idx,
        sim: cosineSim(vec, queryVector),
    }));
    sims.sort((a, b) => b.sim - a.sim);
    const top3 = sims
        .slice(0, 3)
        .map(s => chunks[s.idx])
        .filter((chunk): chunk is Chunk => chunk !== undefined);
    return top3;
}

function resolveReportPath(): string {
    const candidates = [
        path.join(process.cwd(), 'meridian-servicing-report.txt'),
        path.join(process.cwd(), '..', 'meridian-servicing-report.txt'),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        `Could not find meridian-servicing-report.txt. Tried:\n${candidates.join('\n')}`,
    );
}

async function main() {
    const docPath = resolveReportPath();
    const DOC = readFileSync(docPath, 'utf-8');

    console.log(`Loaded document: ${DOC.length} chars`);

    console.log('Chunking document with three strategies...');
    const fixedChunks = chunkFixed(DOC);
    const sentenceChunks = chunkSentences(DOC);
    const structureChunks = chunkStructure(DOC);

    console.log(`Fixed-size chunks: ${fixedChunks.length}`);
    console.log(`Sentence-boundary chunks: ${sentenceChunks.length}`);
    console.log(`Structure-aware chunks: ${structureChunks.length}`);

    const QUESTIONS = [
        'What coupon do the Class A notes pay?',
        'What happens if the delinquency trigger is breached?',
        'What is the full order of payments in the waterfall?',
        'Was the rise in April delinquencies a sign of credit deterioration?',
        'How is the cumulative net loss ratio defined, and what is its current value?',
    ];

    const questionVectors = await embed(QUESTIONS);

    const allChunks = [...fixedChunks, ...sentenceChunks, ...structureChunks];
    const allChunkVectors = await embed(allChunks.map((chunk) => chunk.text));

    const fixedVectors = allChunkVectors.slice(0, fixedChunks.length);
    const sentenceVectors = allChunkVectors.slice(
        fixedChunks.length,
        fixedChunks.length + sentenceChunks.length,
    );
    const structureVectors = allChunkVectors.slice(fixedChunks.length + sentenceChunks.length);

    const strategies: Array<[string, Chunk[], number[][]]> = [
        ['fixed-size', fixedChunks, fixedVectors],
        ['sentence-boundary', sentenceChunks, sentenceVectors],
        ['structure-aware', structureChunks, structureVectors],
    ];

    for (let i = 0; i < QUESTIONS.length; i += 1) {
        const q = QUESTIONS[i];
        const qVec = questionVectors[i];
        if (!q || !qVec) {
            continue;
        }

        for (const [name, chunks, vecs] of strategies) {
            const top3 = retrieve(qVec, chunks, vecs);
            console.log(`\nQ: ${q}\nStrategy: ${name}`);
            top3.forEach(c => console.log(`  [${c.id}] ${c.text.slice(0, 120)}`));
            // YOU judge: does any top-3 chunk fully contain the answer? ✓/✗
        }
    }
}

const isDirectRun =
    process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main().catch(err => {
        console.error('Error in main:', err);
    });
}