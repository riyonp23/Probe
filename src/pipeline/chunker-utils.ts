// probe — chunker helpers (token estimation, header context, splitting)

import { CodeChunk, ChunkType, CHUNK_TARGET_MAX_TOKENS } from "../utils/types";

export function estimateTokens(text: string): number {
  // rough heuristic: ~4 chars per token for code
  return Math.ceil(text.length / 4);
}

export function getHeaderContext(content: string): string {
  const lines = content.split("\n");
  const header: string[] = [];
  for (let i = 0; i < lines.length && header.length < 3; i++) {
    if (lines[i].trim().length > 0) header.push(lines[i]);
  }
  return header.join("\n");
}

export function withHeader(chunkContent: string, header: string): string {
  if (!header) return chunkContent;
  if (chunkContent.startsWith(header)) return chunkContent;
  return `${header}\n\n${chunkContent}`;
}

// split a text range into smaller chunks by blank-line boundaries when the
// source is larger than CHUNK_TARGET_MAX_TOKENS.
export function splitLargeBlock(
  content: string,
  filePath: string,
  baseStartLine: number,
  language: string,
  chunkType: ChunkType,
  header: string
): CodeChunk[] {
  const out: CodeChunk[] = [];
  if (estimateTokens(content) <= CHUNK_TARGET_MAX_TOKENS) {
    out.push({
      content: withHeader(content, header),
      filePath,
      startLine: baseStartLine,
      endLine: baseStartLine + content.split("\n").length - 1,
      language,
      chunkType,
    });
    return out;
  }

  const lines = content.split("\n");
  let bufferLines: string[] = [];
  let bufferStart = baseStartLine;

  const flush = (endLine: number): void => {
    if (bufferLines.length === 0) return;
    const text = bufferLines.join("\n");
    out.push({
      content: withHeader(text, header),
      filePath,
      startLine: bufferStart,
      endLine,
      language,
      chunkType,
    });
    bufferLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    bufferLines.push(lines[i]);
    const joined = bufferLines.join("\n");
    const isBlank = lines[i].trim() === "";
    if (estimateTokens(joined) >= CHUNK_TARGET_MAX_TOKENS && isBlank) {
      flush(baseStartLine + i);
      bufferStart = baseStartLine + i + 1;
    }
  }
  if (bufferLines.length > 0) flush(baseStartLine + lines.length - 1);
  return out;
}

export function chunkMarkdown(
  content: string,
  filePath: string,
  header: string
): CodeChunk[] {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  let buffer: string[] = [];
  let start = 1;

  const flush = (endLine: number): void => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    if (text.trim().length === 0) {
      buffer = [];
      return;
    }
    chunks.push({
      content: withHeader(text, header),
      filePath,
      startLine: start,
      endLine,
      language: "markdown",
      chunkType: "block",
    });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ") && buffer.length > 0) {
      flush(i);
      start = i + 1;
    }
    buffer.push(lines[i]);
  }
  flush(lines.length);
  return chunks;
}
