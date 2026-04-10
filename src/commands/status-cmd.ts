// probe — "probe status" command handler — shows index stats for a repo

import * as fs from "fs";
import * as path from "path";
import { loadConfig, probeDir } from "../utils/config";
import { getIndex, getIndexStats, indexExists } from "../pipeline/store";
import { dimMessage, errorMessage, infoMessage, successMessage } from "../utils/formatter";
import { maskKey } from "../utils/security";
import { getProviderInfo } from "../pipeline/providers/types";
import { printHeader, printKeyValue, printMetric } from "../utils/theme";
import { isGitHubUrl, parseGitHubUrl, resolveCloneDir } from "../utils/github";

const PATH_PREVIEW_LIMIT = 20;

export interface StatusOptions {
  path: string;
}

// if user passed a GitHub shorthand/URL, point at the cached clone instead.
// returns null if there's nothing to look at (repo was never cloned).
function resolveStatusPath(input: string): string | null {
  if (!isGitHubUrl(input)) return path.resolve(input);
  try {
    const parsed = parseGitHubUrl(input);
    const candidate = resolveCloneDir(parsed.repo);
    if (fs.existsSync(candidate)) return candidate;
    errorMessage(`No index found for ${parsed.owner}/${parsed.repo}. Run \`probe index ${input}\` first.`);
    return null;
  } catch {
    return path.resolve(input);
  }
}

function validateRepoPath(repoPath: string): string | null {
  if (!fs.existsSync(repoPath)) {
    errorMessage(`Can't find that path: ${repoPath}`);
    return null;
  }
  if (!fs.statSync(repoPath).isDirectory()) {
    errorMessage(`That's a file, not a directory: ${repoPath}`);
    return null;
  }
  return repoPath;
}

function findIndexJson(repoPath: string): string | null {
  // vectra persists to <repo>/.probe/vectra-index/index.json
  const expected = path.join(probeDir(repoPath), "vectra-index", "index.json");
  return fs.existsSync(expected) ? expected : null;
}

export async function runStatusCommand(options: StatusOptions): Promise<void> {
  printHeader("Status");
  const resolved = resolveStatusPath(options.path);
  if (!resolved) process.exit(1);
  const absolute = validateRepoPath(resolved);
  if (!absolute) process.exit(1);

  // status should work even without API keys set
  const config = loadConfig(absolute, { requireKeys: false });

  if (config.apiKey) {
    const providerName = getProviderInfo(config.providerId)?.name ?? config.providerId;
    printKeyValue("Provider", providerName);
    printKeyValue("API key", maskKey(config.apiKey));
  }
  printKeyValue("Repo", config.repoPath);

  if (!(await indexExists(config))) {
    console.log("");
    infoMessage(
      `No index here yet. Run \`probe index ${config.repoPath}\` to build one.`
    );
    return;
  }

  const index = await getIndex(config);
  const stats = await getIndexStats(index);

  console.log("");
  successMessage("Index ready");
  printMetric("Chunks", stats.chunkCount);
  printMetric("Files", stats.fileCount);

  const indexJson = findIndexJson(config.repoPath);
  if (indexJson) {
    printMetric("Last indexed", fs.statSync(indexJson).mtime.toLocaleString());
  }

  const paths = Array.from(stats.filePaths).sort();
  if (paths.length === 0) return;

  console.log("");
  console.log("Files in the index:");
  const preview = paths.slice(0, PATH_PREVIEW_LIMIT);
  for (const p of preview) {
    dimMessage(`  ${p}`);
  }
  if (paths.length > PATH_PREVIEW_LIMIT) {
    dimMessage(`  ...and ${paths.length - PATH_PREVIEW_LIMIT} more`);
  }
}
