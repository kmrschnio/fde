// day1.ts — run with: npx tsx day1.ts
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

function extractTextFromContent(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((block): block is { type: 'text'; text: string } =>
      block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text)
    .join('');
}

async function ask(prompt: string): Promise<string> {
  // TODO 1: basic call — client.messages.create() with
  // model: 'claude-haiku-4-5', max_tokens: 1024
  // Return the text from message.content
  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractTextFromContent(message.content);
}

async function askStreaming(prompt: string): Promise<string> {
  // TODO 2: use client.messages.stream({...})
  // Print text deltas as they arrive (stream.on('text', ...))
  // Then return await stream.finalMessage()
  const stream = client.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  stream.on('text', (text) => {
    process.stdout.write(text);
  });

  const finalMessage = await stream.finalMessage();
  process.stdout.write('\n');
  return extractTextFromContent(finalMessage.content);
}

async function askWithRetry(prompt: string, maxRetries = 3): Promise<string> {
  // TODO 3: wrap askStreaming in retry logic
  // - catch Anthropic.APIError; retry ONLY on status 429 & 529 (overloaded)
  // - exponential backoff: 1s, 2s, 4s
  // - log token usage from the final message (message.usage)
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      stream.on('text', (text) => {
        process.stdout.write(text);
      });

      const finalMessage = await stream.finalMessage();
      process.stdout.write('\n');
      console.log('Usage:', finalMessage.usage);
      return extractTextFromContent(finalMessage.content);
    } catch (error) {
      lastError = error;
      const isApiError = error instanceof Anthropic.APIError;
      const status = isApiError ? error.status : undefined;
      const isRetryable = status === 429 || status === 529;

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delayMs = 1000 * 2 ** (attempt - 1);
      console.warn(
        `Request failed with status ${status}. Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to complete request after retries.');
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  askWithRetry('Explain what a securitization waterfall is in 3 sentences.');
}

export { ask, askStreaming, askWithRetry };