// probe — helpers for ask-cmd: input sanitization + repo resolution

import * as fs from "fs";
import * as path from "path";
import { dimMessage, errorMessage, infoMessage } from "../utils/formatter";
import { isGitHubUrl, resolveRepoPath } from "../utils/github";
import { loadLastIndexedRepo, getLastIndexedRepo } from "../utils/recent";
import { runIndexCommand } from "./index-cmd";

export const MAX_QUESTION_LENGTH = 2000;

export interface SanitizedQuestion {
  text: string;
  truncated: boolean;
}

export function sanitizeQuestion(raw: string): SanitizedQuestion {
  // strip null bytes and C0 control chars (keep \t and \n), cap length
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (cleaned.length > MAX_QUESTION_LENGTH) {
    return { text: cleaned.slice(0, MAX_QUESTION_LENGTH), truncated: true };
  }
  return { text: cleaned, truncated: false };
}

export function hasLocalIndex(p: string): boolean {
  return fs.existsSync(path.join(p, ".probe", "vectra-index", "index.json"));
}

// pick the repo we'll query against. four cases:
//   - explicit local path
//   - GitHub shorthand/URL with a cached clone+index
//   - GitHub shorthand/URL with no cache (auto-index it first)
//   - no --repo (fall back to the last indexed repo or cwd)
export async function resolveAskRepo(repoOption: string | undefined): Promise<string> {
  if (repoOption) {
    if (isGitHubUrl(repoOption)) {
      const cached = resolveRepoPath(repoOption);
      if (cached !== repoOption && hasLocalIndex(cached)) return cached;
      infoMessage(`Indexing ${repoOption} first...`);
      await runIndexCommand(repoOption, { force: true });
      return resolveRepoPath(repoOption);
    }
    return path.resolve(repoOption);
  }

  const last = loadLastIndexedRepo() ?? getLastIndexedRepo();
  if (last) {
    dimMessage(`Using last indexed repo: ${last}`);
    return last;
  }
  const cwd = process.cwd();
  if (hasLocalIndex(cwd)) return cwd;

  errorMessage("No indexed repo found. Run `probe index <path>` first, or use --repo to point at one.");
  process.exit(1);
}
