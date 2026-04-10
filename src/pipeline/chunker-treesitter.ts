// probe — tree-sitter AST-aware chunking for Python, TS, JS, TSX, JSX

import * as path from "path";
import { CodeChunk, ChunkType } from "../utils/types";
import { getHeaderContext, splitLargeBlock } from "./chunker-utils";

interface TreeSitterNode {
  type: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TreeSitterNode[];
}

interface TreeSitterParser {
  setLanguage(lang: unknown): void;
  parse(input: string): { rootNode: TreeSitterNode };
}

interface TreeSitterCtor {
  new (): TreeSitterParser;
}

interface LoadedLanguages {
  python?: unknown;
  javascript?: unknown;
  typescript?: unknown;
  tsx?: unknown;
}

let parserCtor: TreeSitterCtor | null = null;
let loaded: LoadedLanguages = {};
let loadAttempted = false;

function tryLoad(): void {
  if (loadAttempted) return;
  loadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    parserCtor = require("tree-sitter") as TreeSitterCtor;
  } catch {
    parserCtor = null;
    return;
  }
  try {
    loaded.python = require("tree-sitter-python");
  } catch {
    /* optional */
  }
  try {
    loaded.javascript = require("tree-sitter-javascript");
  } catch {
    /* optional */
  }
  try {
    const ts = require("tree-sitter-typescript");
    loaded.typescript = ts.typescript;
    loaded.tsx = ts.tsx;
  } catch {
    /* optional */
  }
}

export function treeSitterAvailableFor(ext: string): boolean {
  tryLoad();
  if (!parserCtor) return false;
  switch (ext) {
    case ".py":
      return loaded.python !== undefined;
    case ".js":
    case ".jsx":
      return loaded.javascript !== undefined;
    case ".ts":
      return loaded.typescript !== undefined;
    case ".tsx":
      return loaded.tsx !== undefined;
    default:
      return false;
  }
}

function pickLanguage(ext: string): unknown {
  switch (ext) {
    case ".py":
      return loaded.python;
    case ".js":
    case ".jsx":
      return loaded.javascript;
    case ".ts":
      return loaded.typescript;
    case ".tsx":
      return loaded.tsx;
    default:
      return undefined;
  }
}

const DECL_TYPES = new Set([
  "function_declaration",
  "function_definition",
  "class_declaration",
  "class_definition",
  "method_definition",
  "generator_function_declaration",
  "lexical_declaration", // top-level const/let — may contain arrow fns
]);

function classifyNode(type: string): ChunkType {
  if (type.includes("class")) return "class";
  if (type.includes("function") || type.includes("method")) return "function";
  return "block";
}

export function chunkByTreeSitter(
  content: string,
  filePath: string,
  language: string
): CodeChunk[] {
  const ext = path.extname(filePath).toLowerCase();
  if (!parserCtor) return [];
  const lang = pickLanguage(ext);
  if (!lang) return [];

  const parser = new parserCtor();
  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const header = getHeaderContext(content);
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];

  const decls = tree.rootNode.children.filter((c) => DECL_TYPES.has(c.type));
  if (decls.length === 0) {
    return splitLargeBlock(content, filePath, 1, language, "module", header);
  }

  let cursor = 0;
  for (const node of decls) {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    if (startRow > cursor) {
      const between = lines.slice(cursor, startRow).join("\n");
      if (between.trim().length > 0) {
        chunks.push(
          ...splitLargeBlock(between, filePath, cursor + 1, language, "block", header)
        );
      }
    }
    const body = lines.slice(startRow, endRow + 1).join("\n");
    chunks.push(
      ...splitLargeBlock(body, filePath, startRow + 1, language, classifyNode(node.type), header)
    );
    cursor = endRow + 1;
  }
  if (cursor < lines.length) {
    const trailing = lines.slice(cursor).join("\n");
    if (trailing.trim().length > 0) {
      chunks.push(
        ...splitLargeBlock(trailing, filePath, cursor + 1, language, "block", header)
      );
    }
  }
  return chunks;
}
