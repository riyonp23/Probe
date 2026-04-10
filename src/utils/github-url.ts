// probe — GitHub URL detection, strict validation, and parsing

export interface GitHubRepo {
  owner: string;
  repo: string;
  cloneUrl: string;
}

// strict character sets — GitHub's real rules. owner: letters/digits + hyphens
// (no leading hyphen); repo: letters/digits/hyphen/underscore/dot (no "..").
// These MUST be anchored and applied to both shorthand and parsed URL forms.
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}$/;

function hasControlChars(s: string): boolean {
  // reject null bytes, newlines, tabs, and other C0/DEL chars in any URL input
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1F\x7F]/.test(s);
}

export function isValidOwner(owner: string): boolean {
  return OWNER_RE.test(owner);
}

export function isValidRepo(repo: string): boolean {
  if (!REPO_RE.test(repo)) return false;
  if (repo === "." || repo === "..") return false;
  return true;
}

export function isGitHubUrl(input: string): boolean {
  const s = input.trim();
  if (!s || hasControlChars(s)) return false;
  // explicit URL forms (http/https or bare github.com) — parseGitHubUrl re-validates
  if (/^https?:\/\/github\.com\/[^/]+\/[^/\s?#]+/i.test(s)) return true;
  if (/^github\.com\/[^/]+\/[^/\s?#]+/i.test(s)) return true;
  // shorthand: exactly one slash, no spaces, no leading separators
  if (s.includes(" ")) return false;
  if (s.startsWith("/") || s.startsWith("\\") || s.startsWith("-")) return false;
  const slashCount = (s.match(/\//g) || []).length;
  if (slashCount !== 1) return false;
  const [owner, repo] = s.split("/");
  return isValidOwner(owner) && isValidRepo(repo);
}

export function parseGitHubUrl(input: string): GitHubRepo {
  let s = input.trim();
  if (!s || hasControlChars(s)) {
    throw new Error(`Invalid GitHub repository: ${input}`);
  }
  if (/^https?:\/\//i.test(s)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      throw new Error(`Invalid GitHub repository: ${input}`);
    }
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Only public GitHub repositories are supported.");
    }
    // url.username/password are separate fields — reject embedded credentials
    if (url.username || url.password) {
      throw new Error("GitHub URL may not contain embedded credentials.");
    }
    s = url.pathname.replace(/^\/+/, "");
  } else if (/^github\.com\//i.test(s)) {
    s = s.replace(/^github\.com\//i, "");
  }
  s = s.replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = s.split("/").filter((p) => p.length > 0);
  if (parts.length < 2) {
    throw new Error(`Invalid GitHub repository: ${input}`);
  }
  const owner = parts[0];
  const repo = parts[1];
  // re-validate strictly — a malformed URL could still reach here otherwise
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    throw new Error(`Invalid GitHub repository: ${input}`);
  }
  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}
