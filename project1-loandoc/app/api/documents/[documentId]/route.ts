import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { documentId: documentIdParam } = await params;
  const documentId = Number(documentIdParam);

  if (!Number.isInteger(documentId) || documentId < 1) {
    return NextResponse.json({ error: 'Document ID must be a positive integer.' }, { status: 400 });
  }

  const documentResult = await pool.query(
    `SELECT id, filename, status, chunk_count
     FROM documents
     WHERE id = $1`,
    [documentId],
  );
  const document = documentResult.rows[0];

  if (!document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const chunksResult = await pool.query(
    `SELECT id, section, content
     FROM chunks
     WHERE document_id = $1
     ORDER BY id ASC`,
    [documentId],
  );

  return NextResponse.json({ document, chunks: chunksResult.rows });
}
