// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import path from 'node:path';
import { cleanPdfText } from '@/lib/pdf';
import { chunkStructure } from '@/lib/chunk';   // your Day-5 chunker
import { embed } from '@/lib/embed';
import { pool } from '@/lib/db';

const PDF_WORKER_PATH = path.join(
  process.cwd(),
  'node_modules',
  'pdf-parse',
  'dist',
  'pdf-parse',
  'esm',
  'pdf.worker.mjs',
);

PDFParse.setWorker(PDF_WORKER_PATH);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File;
    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Upload a PDF file.' }, { status: 400 });
    }

    // 1. create document row (status: processing)
    const { rows: [doc] } = await pool.query(
      'INSERT INTO documents (filename) VALUES ($1) RETURNING id', [file.name]);

    // 2. extract -> clean -> chunk
    const buf = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    const textResult = await parser.getText();
    const raw = textResult.text;
    await parser.destroy();
    const clean = cleanPdfText(raw);
    const chunks = chunkStructure(clean);

    // 3. embed (batch) -> store with document_id
    const vectors = await embed(chunks.map((chunk) => chunk.text));
    for (let i = 0; i < chunks.length; i++) {
      const vector = vectors[i];
      if (!vector) {
        throw new Error(`Missing embedding vector for chunk index ${i}.`);
      }

      await pool.query(
        `INSERT INTO chunks (content, section, embedding, document_id)
         VALUES ($1, $2, $3, $4)`,
        [chunks[i].text, chunks[i].section ?? null, '[' + vector.join(',') + ']', doc.id]);
    }

    // 4. mark ready
    await pool.query('UPDATE documents SET status=$1, chunk_count=$2 WHERE id=$3',
      ['ready', chunks.length, doc.id]);

    return NextResponse.json({ document_id: doc.id, chunks: chunks.length });
  } catch (err) {
    console.error('[/api/upload]', err);
    return NextResponse.json({ error: 'Could not process that PDF. Try another file.' }, { status: 500 });
  }
}