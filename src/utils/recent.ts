// probe — tracks the most recently indexed repo so `probe ask` can skip --repo

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function probeHomeDir(): string {
  return path.join(os.homedir(), ".probe");
}

function lastRepoFile(): string {
  return path.join(probeHomeDir(), "last-repo.txt");
}

function hasIndex(repoPath: string): boolean {
  return fs.existsSync(path.join(repoPath, ".probe", "vectra-index", "index.json"));
}

export function saveLastIndexedRepo(repoPath: string): void {
  try {
    const dir = probeHomeDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(lastRepoFile(), path.resolve(repoPath), "utf8");
  } catch {
    // best-effort — not critical if we can't remember
  }
}

export function loadLastIndexedRepo(): string | null {
  try {
    const file = lastRepoFile();
    if (!fs.existsSync(file)) return null;
    const saved = fs.readFileSync(file, "utf8").trim();
    if (!saved) return null;
    if (!fs.existsSync(saved)) return null;
    if (!hasIndex(saved)) return null;
    return saved;
  } catch {
    return null;
  }
}

// fallback scan — checks cwd and every folder under %TMP%/probe-repos for
// the freshest index.json, returns the repo with the newest mtime or null
export function getLastIndexedRepo(): string | null {
  const candidates: Array<{ repoPath: string; mtime: number }> = [];

  const cwd = process.cwd();
  const cwdIndex = path.join(cwd, ".probe", "vectra-index", "index.json");
  if (fs.existsSync(cwdIndex)) {
    candidates.push({ repoPath: cwd, mtime: fs.statSync(cwdIndex).mtimeMs });
  }

  const cloneRoot = path.join(os.tmpdir(), "probe-repos");
  if (fs.existsSync(cloneRoot)) {
    for (const entry of fs.readdirSync(cloneRoot)) {
      const repoPath = path.join(cloneRoot, entry);
      const idx = path.join(repoPath, ".probe", "vectra-index", "index.json");
      if (fs.existsSync(idx)) {
        candidates.push({ repoPath, mtime: fs.statSync(idx).mtimeMs });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].repoPath;
}
