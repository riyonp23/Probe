// probe — regex-based fallback chunker for languages without tree-sitter

import { CodeChunk, ChunkType } from "../utils/types";
import { getHeaderContext, splitLargeBlock } from "./chunker-utils";

interface LangPattern {
  // regex detects a "declaration starter" line (function/class/method)
  declRegex: RegExp;
  classRegex?: RegExp;
}

const PATTERNS: Record<string, LangPattern> = {
  java: {
    declRegex: /^\s*(public|private|protected|static|final|abstract|\s)*\s*[\w<>\[\],\s]+\s+\w+\s*\([^)]*\)\s*\{/,
    classRegex: /^\s*(public|private|protected|abstract|final|\s)*\s*(class|interface|enum)\s+\w+/,
  },
  c: {
    declRegex: /^[\w\s\*]+\s+\w+\s*\([^;]*\)\s*\{?\s*$/,
  },
  cpp: {
    declRegex: /^[\w\s\*:<>,]+\s+\w+\s*\([^;]*\)\s*\{?\s*$/,
    classRegex: /^\s*(class|struct)\s+\w+/,
  },
  csharp: {
    declRegex: /^\s*(public|private|protected|internal|static|async|virtual|override|\s)+\s*[\w<>\[\],\s]+\s+\w+\s*\([^)]*\)/,
    classRegex: /^\s*(public|private|internal|\s)*\s*(class|interface|struct|enum)\s+\w+/,
  },
  go: {
    declRegex: /^func\s+(\(\s*\w+\s+\*?\w+\s*\)\s+)?\w+\s*\(/,
    classRegex: /^type\s+\w+\s+(struct|interface)\b/,
  },
  ruby: {
    declRegex: /^\s*def\s+\w+/,
    classRegex: /^\s*(class|module)\s+\w+/,
  },
  rust: {
    declRegex: /^\s*(pub\s+)?(async\s+)?fn\s+\w+/,
    classRegex: /^\s*(pub\s+)?(struct|enum|trait|impl)\s+\w+/,
  },
};

function classify(line: string, lang: string): ChunkType | null {
  const p = PATTERNS[lang];
  if (!p) return null;
  if (p.classRegex && p.classRegex.test(line)) return "class";
  if (p.declRegex.test(line)) return "function";
  return null;
}

export function chunkByRegex(
  content: string,
  filePath: string,
  language: string
): CodeChunk[] {
  const header = getHeaderContext(content);
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];

  // find declaration boundaries; text between them becomes "block" chunks
  const boundaries: { line: number; type: ChunkType }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = classify(lines[i], language);
    if (t) boundaries.push({ line: i, type: t });
  }

  if (boundaries.length === 0) {
    chunks.push(...splitLargeBlock(content, filePath, 1, language, "module", header));
    return chunks;
  }

  // leading block (imports etc.)
  if (boundaries[0].line > 0) {
    const leading = lines.slice(0, boundaries[0].line).join("\n");
    if (leading.trim().length > 0) {
      chunks.push(...splitLargeBlock(leading, filePath, 1, language, "block", header));
    }
  }

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].line;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].line : lines.length;
    const body = lines.slice(start, end).join("\n");
    chunks.push(
      ...splitLargeBlock(body, filePath, start + 1, language, boundaries[b].type, header)
    );
  }

  return chunks;
}
