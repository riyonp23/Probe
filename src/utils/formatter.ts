// probe — terminal output formatting (chalk + ora), routed through theme.ts

import ora, { Ora } from "ora";
import * as path from "path";
import { QueryResult } from "./types";
import {
  BRAND_COLOR,
  BOLD,
  DIM,
  ERROR,
  HIGHLIGHT,
  SPINNER_COLOR,
  SUCCESS,
  WARNING,
  printDivider,
} from "./theme";

// shorten an absolute path to one relative to repoRoot, using forward slashes.
// bails to the original path if it's outside the repo or no root was given.
function shortenPath(filePath: string, repoRoot?: string): string {
  if (!repoRoot) return filePath;
  const rel = path.relative(repoRoot, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return filePath;
  return rel.split(path.sep).join("/");
}

export function successMessage(msg: string): void {
  console.log(SUCCESS(`✓ ${msg}`));
}

export function errorMessage(msg: string): void {
  console.error(ERROR(`✗ ${msg}`));
}

export function infoMessage(msg: string): void {
  console.log(BRAND_COLOR(`ℹ ${msg}`));
}

export function warnMessage(msg: string): void {
  console.log(WARNING(`⚠ ${msg}`));
}

export function dimMessage(msg: string): void {
  console.log(DIM(msg));
}

export function formatFileRef(filePath: string, startLine?: number, endLine?: number): string {
  const range =
    startLine !== undefined && endLine !== undefined ? `:${startLine}-${endLine}` : "";
  return DIM.underline(`${filePath}${range}`);
}

export function startSpinner(text: string): Ora {
  return ora({ text, spinner: "dots", color: SPINNER_COLOR }).start();
}

export function stopSpinnerSuccess(spinner: Ora, text?: string): void {
  spinner.succeed(text);
}

export function stopSpinnerFail(spinner: Ora, text?: string): void {
  spinner.fail(text);
}

export function handleFatalError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  errorMessage(msg);
  process.exit(1);
}

export function printRetrievedChunk(result: QueryResult, index: number): void {
  const { chunk, score } = result;
  const idx = HIGHLIGHT(`[${index + 1}]`);
  const ref = BRAND_COLOR.underline(`${chunk.filePath}:L${chunk.startLine}-${chunk.endLine}`);
  const scoreText = DIM(`(score: ${score.toFixed(2)})`);
  console.log(`${idx} ${ref} ${scoreText}`);
  const preview = chunk.content.split("\n").slice(0, 3).join("\n");
  console.log(DIM(preview));
  console.log("");
}

export function printSourceFooter(filePaths: string[], repoRoot?: string): void {
  const unique = Array.from(new Set(filePaths.map((fp) => shortenPath(fp, repoRoot))));
  console.log("");
  printDivider();
  console.log(BOLD(BRAND_COLOR("Sources:")));
  for (const fp of unique) {
    console.log(DIM.underline(fp));
  }
}

export function streamToken(token: string): void {
  process.stdout.write(token);
}
