// day2.ts
import 'dotenv/config';
import { z } from 'zod';
import { ask } from './day1.js';

// A loan extracted from messy text
const LoanSchema = z.object({
  borrower: z.string(),
  principal_amount: z.number(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'INR']),
  interest_rate_pct: z.number(),
  maturity_date: z.string().nullable(), // ISO date or null if not stated
  is_secured: z.boolean(),
});
type Loan = z.infer<typeof LoanSchema>;
const LoansSchema = z.array(LoanSchema);

const SAMPLE = `Acme Industries borrowed $2.5M from First National at 
7.25% annual interest, maturing March 2027, secured against equipment. 
Separately, Beta Corp took an unsecured facility of €800,000 at 9.1%.`;

async function extractLoans(text: string): Promise<Loan[]> {
  // TODO 1: prompt the model to return ONLY a JSON array matching the
  // schema — no prose, no markdown fences. Describe each field and its
  // type in the prompt, including "null if not stated".
  //
  // TODO 2: parse with JSON.parse, then validate with
  // z.array(LoanSchema).safeParse(). Return .data on success.
  //
  // TODO 3: the self-healing loop — if parse/validation fails, call the
  // model AGAIN with: original output + the Zod error message +
  // "fix the JSON to match the schema". Max 2 repair attempts, then throw.

  const basePrompt = `Extract loans from the text below.

Return ONLY valid JSON (no markdown, no code fences, no extra text).
The JSON must be an array of objects with exactly these fields:
- borrower: string
- principal_amount: number
- currency: one of "USD", "EUR", "GBP", "INR"
- interest_rate_pct: number
- maturity_date: string | null (ISO date format when stated, otherwise null)
- is_secured: boolean

Text:
${text}`;

  let output = await ask(basePrompt);

  for (let repairAttempt = 0; repairAttempt <= 2; repairAttempt += 1) {
    try {
      const parsed = JSON.parse(output);
      const validation = LoansSchema.safeParse(parsed);
      if (validation.success) {
        return validation.data;
      }

      const errorMessage = validation.error.message;
      if (repairAttempt === 2) {
        throw new Error(errorMessage);
      }

      output = await ask(`Your previous response was invalid JSON for the schema.
Fix the JSON to match the schema exactly.

Original extraction task:
${basePrompt}

Previous output:
${output}

Validation error:
${errorMessage}

Return ONLY corrected JSON.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (repairAttempt === 2) {
        console.error('JSON parsing/validation failed:', errorMessage);
        break;
      }

      output = await ask(`Your previous response was not valid JSON.
Fix the JSON to match the schema exactly.

Original extraction task:
${basePrompt}

Previous output:
${output}

Error:
${errorMessage}

Return ONLY corrected JSON.`);
    }
  }

  throw new Error('Failed to extract loans.');
}

extractLoans(SAMPLE).then(console.log);