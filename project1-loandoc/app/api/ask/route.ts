// app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { answer } from '@/lib/rag';

export async function POST(req: NextRequest) {
  try {
    const { question, documentId } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: 'Enter a question to search the document.' }, { status: 400 });
    }
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
    }
    const result = await answer(question, documentId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/ask]', err);
    return NextResponse.json({ error: 'Something went wrong answering that. Try again.' }, { status: 500 });
  }
}