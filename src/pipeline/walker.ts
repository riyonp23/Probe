// probe — recursive file walker with extension filtering and exclusions

import * as fs from "fs";
import * as path from "path";
import { ProbeConfig, WalkedFile } from "../utils/types";
import { dimMessage, startSpinner, stopSpinnerSuccess } from "../utils/formatter";

export interface WalkerOptions {
  extraExclusions?: string[];
  languageOverride?: string[];
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".go": "go",
    ".rb": "ruby",
    ".rs": "rust",
    ".md": "markdown",
  };
  return map[ext] ?? "text";
}

function matchesGlob(name: string, pattern: string): boolean {
  // simple glob — supports * for any sequence. exact match is the common case.
  if (!pattern.includes("*")) return name === pattern;
  const escaped = pattern
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(name);
}

function isExcluded(name: string, exclusions: string[]): boolean {
  for (const pat of exclusions) {
    if (matchesGlob(name, pat)) return true;
  }
  if (name.endsWith(".min.js")) return true;
  if (name.startsWith(".") && name !== "." && name !== "..") {
    // skip dotfiles/dotdirs uniformly
    return true;
  }
  return false;
}

function walkDir(dir: string, languages: string[], exclusions: string[], out: WalkedFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isExcluded(entry.name, exclusions)) continue;
    const full = path.join(dir, entry.name);

    // Security: never follow symlinks. Dirent uses lstat semantics, so a
    // symlink has isSymbolicLink() === true and isDirectory()/isFile() === false.
    // We make the rejection explicit so a future refactor can't accidentally
    // let a symlink escape the repo root.
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      walkDir(full, languages, exclusions, out);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!languages.includes(ext)) continue;

    let content: string;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    out.push({ filePath: full, content, language: extToLanguage(ext) });
  }
}

export async function walkRepo(
  config: ProbeConfig,
  options: WalkerOptions = {}
): Promise<WalkedFile[]> {
  const extraExclusions = options.extraExclusions ?? [];
  const languages = options.languageOverride ?? config.languages;
  const exclusions = [...config.exclusions, ...extraExclusions];

  const filtersActive =
    extraExclusions.length > 0 || options.languageOverride !== undefined;
  if (filtersActive) {
    dimMessage(`  exclusions: ${exclusions.join(", ")}`);
    dimMessage(`  languages:  ${languages.join(", ")}`);
  }

  const spinner = startSpinner(`Walking repository at ${config.repoPath}...`);
  const files: WalkedFile[] = [];
  try {
    walkDir(config.repoPath, languages, exclusions, files);
  } catch (err) {
    spinner.fail(`Failed to walk repository`);
    throw err;
  }
  stopSpinnerSuccess(spinner, `Found ${files.length} source file(s)`);
  return files;
}
