// probe — AST-aware code chunking (tree-sitter primary, regex fallback)

import * as path from "path";
import { CodeChunk, WalkedFile, TREE_SITTER_EXTENSIONS } from "../utils/types";
import { startSpinner, stopSpinnerSuccess } from "../utils/formatter";
import { chunkByTreeSitter, treeSitterAvailableFor } from "./chunker-treesitter";
import { chunkByRegex } from "./chunker-regex";
import { chunkMarkdown, getHeaderContext } from "./chunker-utils";

function chunkOne(file: WalkedFile): CodeChunk[] {
  const ext = path.extname(file.filePath).toLowerCase();

  if (ext === ".md") {
    return chunkMarkdown(file.content, file.filePath, getHeaderContext(file.content));
  }

  if (TREE_SITTER_EXTENSIONS.includes(ext) && treeSitterAvailableFor(ext)) {
    try {
      const result = chunkByTreeSitter(file.content, file.filePath, file.language);
      if (result.length > 0) return result;
    } catch {
      // fall through to regex
    }
  }

  return chunkByRegex(file.content, file.filePath, file.language);
}

export async function chunkFiles(files: WalkedFile[]): Promise<CodeChunk[]> {
  const spinner = startSpinner(`Chunking ${files.length} file(s)...`);
  const all: CodeChunk[] = [];
  const byLang: Record<string, number> = {};

  try {
    for (const f of files) {
      const chunks = chunkOne(f);
      for (const c of chunks) {
        if (c.content.trim().length === 0) continue;
        all.push(c);
        byLang[c.language] = (byLang[c.language] ?? 0) + 1;
      }
    }
  } catch (err) {
    spinner.fail("Chunking failed");
    throw err;
  }

  const breakdown = Object.entries(byLang)
    .map(([lang, n]) => `${lang}: ${n}`)
    .join(", ");
  stopSpinnerSuccess(spinner, `Created ${all.length} chunks (${breakdown})`);
  return all;
}
