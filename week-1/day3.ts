// day3.ts
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SYSTEM_PROMPT = `You are an analyst assistant for a structured 
finance platform. 

Rules:
- Answer only questions about finance, lending, and securitization. 
  For anything else, briefly decline and redirect.
- If you are not confident in a figure or fact, say so explicitly — 
  never present a guess as fact.
- When the user's question is ambiguous, ask ONE clarifying question 
  instead of assuming.
- Keep answers under 150 words unless asked for detail.
- Never provide investment advice; provide information only.`;

const client = new Anthropic();

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

async function runChat(): Promise<void> {
  const rl = createInterface({ input, output });
  const messages: Anthropic.MessageParam[] = [];

  console.log('Structured Finance Assistant');
  console.log("Type your question, or 'exit' to quit.\n");

  try {
    while (true) {
      let userText = '';
      try {
        userText = (await rl.question('You: ')).trim();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('readline was closed')) {
          break;
        }
        throw error;
      }

      if (!userText) {
        continue;
      }

      if (userText.toLowerCase() === 'exit' || userText.toLowerCase() === 'quit') {
        console.log('Goodbye.');
        break;
      }

      messages.push({ role: 'user', content: userText });

      const stream = client.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
      });

      output.write('Assistant: ');
      stream.on('text', (delta) => {
        output.write(delta);
      });

      const finalMessage = await stream.finalMessage();
      output.write('\n\n');

      const assistantText = extractTextFromContent(finalMessage.content);
      messages.push({ role: 'assistant', content: assistantText });
    }
  } finally {
    rl.close();
  }
}

runChat().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Chat loop failed:', message);
  process.exitCode = 1;
});

