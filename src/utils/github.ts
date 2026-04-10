// probe — GitHub cloning into a user-temp cache + repo-path resolution.
// URL validation/parsing lives in ./github-url to keep this file focused.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync, spawn } from "child_process";
import { startSpinner, stopSpinnerSuccess } from "./formatter";
import {
  GitHubRepo,
  isGitHubUrl,
  isValidRepo,
  parseGitHubUrl,
} from "./github-url";

// re-export so existing importers of ../utils/github keep working
export { GitHubRepo, isGitHubUrl, parseGitHubUrl } from "./github-url";

export function validateGitInstalled(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function cloneRoot(): string {
  return path.resolve(os.tmpdir(), "probe-repos");
}

export function resolveCloneDir(repo: string): string {
  // belt-and-suspenders: even though parseGitHubUrl already validates repo,
  // verify the resolved path is still inside cloneRoot() before returning.
  if (!isValidRepo(repo)) {
    throw new Error(`Invalid repo name: ${repo}`);
  }
  const root = cloneRoot();
  const resolved = path.resolve(root, repo);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Clone destination escaped clone root: ${resolved}`);
  }
  return resolved;
}

function runGitClone(cloneUrl: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // spawn with an argv array (no shell) — cloneUrl and dest can never be
    // interpreted as shell syntax even if they contain metacharacters
    const proc = spawn("git", ["clone", "--depth", "1", cloneUrl, dest], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code: number | null) => {
      if (code === 0) return resolve();
      const tail = stderr.trim().split("\n").slice(-1)[0] || `git clone exited with code ${code}`;
      reject(new Error(tail));
    });
    proc.on("error", (err: Error) => reject(err));
  });
}

export async function cloneRepo(cloneUrl: string, repoName: string): Promise<string> {
  const root = cloneRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const dest = resolveCloneDir(repoName);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });

  const match = cloneUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  const label = match ? `${match[1]}/${match[2]}` : repoName;
  const spinner = startSpinner(`Cloning ${label}...`);
  try {
    await runGitClone(cloneUrl, dest);
    stopSpinnerSuccess(spinner, `Cloned ${label}`);
    return dest;
  } catch (err) {
    spinner.fail(`Failed to clone ${label}`);
    throw err;
  }
}

// resolve a --repo input: if it's a GitHub shorthand/URL and a cached clone with a
// built index exists, return the cached path. otherwise return the input unchanged.
export function resolveRepoPath(input: string): string {
  if (!isGitHubUrl(input)) return input;
  try {
    const parsed: GitHubRepo = parseGitHubUrl(input);
    const candidate = resolveCloneDir(parsed.repo);
    if (fs.existsSync(path.join(candidate, ".probe"))) return candidate;
  } catch {
    // fall through
  }
  return input;
}

export function cleanupClone(cloneDir: string): void {
  if (fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}
