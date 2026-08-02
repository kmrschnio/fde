export interface Chunk {
  text: string;
  section: string | null;
}

export function chunkStructure(text: string, maxChars = 800): Chunk[] {
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const chunks: Chunk[] = [];
  let currentSection: string | null = null;
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      buffer = '';
      return;
    }

    chunks.push({ text: trimmed, section: currentSection });
    buffer = '';
  };

  for (const para of paragraphs) {
    const sectionMatch = para.match(/^([A-Z][A-Z0-9 .,&()\-]{3,}):?$/);
    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1].trim();
      continue;
    }

    if ((buffer + '\n\n' + para).trim().length > maxChars) {
      flush();
    }

    if (!buffer) {
      buffer = para;
    } else {
      buffer += '\n\n' + para;
    }
  }

  flush();
  return chunks;
}
