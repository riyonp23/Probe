// probe — "probe index" command handler — wires the full indexing pipeline

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { loadConfig, probeDir } from "../utils/config";
import { walkRepo } from "../pipeline/walker";
import { chunkFiles } from "../pipeline/chunker";
import { embedChunks } from "../pipeline/embedder";
import { addChunks, createOrResetIndex } from "../pipeline/store";
import {
  dimMessage,
  errorMessage,
  infoMessage,
  successMessage,
  warnMessage,
} from "../utils/formatter";
import { printDivider, printHeader, printMetric, printTip } from "../utils/theme";
import { cloneRepo, isGitHubUrl, parseGitHubUrl, validateGitInstalled } from "../utils/github";
import { saveLastIndexedRepo } from "../utils/recent";

export interface IndexOptions {
  force: boolean;
  exclude?: string[];
  languages?: string[];
}

interface ClonedRepo {
  owner: string;
  repo: string;
  path: string;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.question(`${question} (y/N) `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase().startsWith("y"));
    });
  });
}

function validatePath(repoPath: string): string {
  const absolute = path.resolve(repoPath);
  if (!fs.existsSync(absolute)) {
    errorMessage(`Can't find that path: ${absolute}`);
    process.exit(1);
  }
  if (!fs.statSync(absolute).isDirectory()) {
    errorMessage(`That's a file, not a directory: ${absolute}`);
    process.exit(1);
  }
  return absolute;
}

async function maybeCloneGitHub(repoPath: string): Promise<ClonedRepo | null> {
  // local paths win over shorthand collisions like `src/utils`
  if (!isGitHubUrl(repoPath) || fs.existsSync(repoPath)) return null;
  if (!validateGitInstalled()) {
    errorMessage("Git isn't installed — grab it from https://git-scm.com and try again.");
    process.exit(1);
  }
  try {
    const parsed = parseGitHubUrl(repoPath);
    const cloned = await cloneRepo(parsed.cloneUrl, parsed.repo);
    return { owner: parsed.owner, repo: parsed.repo, path: cloned };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMessage(msg);
    process.exit(1);
  }
}

export async function runIndexCommand(
  repoPath: string,
  options: IndexOptions
): Promise<void> {
  printHeader("Indexing");
  const startedAt = Date.now();
  const cloneInfo = await maybeCloneGitHub(repoPath);
  const absolute = validatePath(cloneInfo ? cloneInfo.path : repoPath);
  const config = loadConfig(absolute);

  const existingProbe = probeDir(config.repoPath);
  if (fs.existsSync(existingProbe) && !options.force) {
    warnMessage(`There's already an index at ${existingProbe}`);
    const ok = await confirm("Rebuild it?");
    if (!ok) {
      infoMessage("Skipping. Pass --force to rebuild without asking.");
      return;
    }
  }

  infoMessage(`Indexing ${config.repoPath}`);

  try {
    const files = await walkRepo(config, {
      extraExclusions: options.exclude,
      languageOverride: options.languages,
    });
    if (files.length === 0) {
      const extensions = (options.languages ?? config.languages).join(", ");
      warnMessage(
        `Didn't find any source files in ${config.repoPath}. Looking for: ${extensions}`
      );
      return;
    }

    const chunks = await chunkFiles(files);
    if (chunks.length === 0) {
      warnMessage("Couldn't pull any chunks out of those files — nothing to embed.");
      return;
    }

    const embedded = await embedChunks(chunks);
    const index = await createOrResetIndex(config, true);
    await addChunks(index, embedded);

    const languages = new Set(chunks.map((c) => c.language));
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const approxTokens = Math.round(
      chunks.reduce((sum, c) => sum + c.content.length, 0) / 4
    );
    saveLastIndexedRepo(config.repoPath);

    console.log("");
    printDivider();
    successMessage("Index ready");
    printMetric("Files", files.length);
    printMetric("Chunks", `${chunks.length} (~${approxTokens.toLocaleString()} tokens)`);
    printMetric("Languages", languages.size);
    printMetric("Time", `${elapsed}s`);
    printDivider();
    if (cloneInfo) {
      printTip(`Cloned to ${cloneInfo.path}`);
    }
    printTip('Now ask something: probe ask "your question"');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMessage(`Indexing failed: ${msg}`);
    dimMessage("Check your network and your .env file.");
    process.exit(1);
  }
}
