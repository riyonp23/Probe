# Security Policy

Probe is a local developer tool that indexes codebases and streams answers from a user-chosen LLM provider. This document describes how Probe handles sensitive data and how to report a vulnerability.

## Reporting a vulnerability

Please email **riyonpraveen23@gmail.com** with a description of the issue and steps to reproduce. Do not file public GitHub issues for security reports. You can expect an initial reply within a few days.

## API key storage

API keys are stored locally — Probe never ships them to a central server.

- **Cipher:** AES-256-GCM with a fresh 12-byte random IV per write and an authentication tag verified on read.
- **Key derivation:** scrypt over a machine-bound password (`hostname + username + homedir`) and a **per-install random 16-byte salt** generated at write time and stored alongside the ciphertext. Copying `credentials.json` to another host or user will fail to decrypt.
- **At rest:** `~/.probe/credentials.json`. Permissions are set to `0o600` on POSIX. On Windows the per-user home ACL protects the file (no POSIX bits).
- **In memory:** the plaintext key is held only for the duration of one LLM request. It is never logged. Any upstream error that might echo the key is run through `redactKey()` before being printed.
- **Masking:** `probe setup --status` shows keys as `sk-xxx...XXXX`.

## Input sanitization

- **Questions (`probe ask`):** null bytes and C0 control characters (except `\t` and `\n`) are stripped; inputs are truncated to 2000 characters.
- **GitHub URLs:** parsed via the WHATWG `URL` API, the hostname must equal `github.com`, embedded credentials (`user:pass@`) are rejected, and owner/repo names are re-validated against strict regexes (`[A-Za-z0-9-]`, `[A-Za-z0-9_.-]`, no `.`/`..`, max length) after parsing. Control characters in URL input are rejected outright.
- **Clone destinations:** `resolveCloneDir` resolves the target and verifies it is contained within `os.tmpdir()/probe-repos/` before any filesystem write, as a belt-and-suspenders check on top of owner/repo validation.

## Prompt injection mitigations

- **Untrusted-data markers:** every retrieved code chunk is wrapped in boundary markers. The system prompt instructs the model to treat anything between the markers as untrusted data and to ignore instructions found inside it.
- **Randomized boundaries:** the marker is generated per query using `crypto.randomBytes(8)` — e.g. `===CHUNK_<16-hex-nonce>_START===`. A malicious file cannot embed the boundary at build time because it cannot predict the nonce.
- **Defensive scrubbing:** if a chunk ever contains the exact boundary string for the current query, it is rewritten before being embedded in the prompt.

## GitHub cloning

- Cloning is restricted to `github.com` — any other host is rejected during URL parsing.
- `git clone` is invoked via `child_process.spawn("git", [...args])` with an argv array and no shell. Clone URLs and destinations can never be interpreted as shell syntax.
- Only `git clone --depth 1` is used — no arbitrary git subcommands are accepted from user input.

## Filesystem safety

- **No symlink following:** the repo walker explicitly rejects `Dirent.isSymbolicLink()` entries, so symlinks cannot be used to escape the indexed root.
- **Index scope:** the vector index is persisted to `<repo>/.probe/` only. Probe does not read or write outside the indexed repo or `~/.probe/`.
- **Dotfile/dotdir skipping:** hidden entries are skipped by default to avoid walking into `.git`, `.env`, and similar.

## Network

- All provider SDKs use the vendor's HTTPS endpoints (`api.anthropic.com`, `api.openai.com`, `api.groq.com`, `api.mistral.ai`, `generativelanguage.googleapis.com`). Probe does not override base URLs.
- No telemetry, no analytics, no crash reporting — Probe does not send data anywhere except to the user's chosen LLM provider.

## Dependencies

- `npm audit` is run before every release; Probe is currently at **0 reported vulnerabilities**.
- Provider SDKs are **lazy-loaded** — only the SDK for the selected provider is required into the process, reducing the effective attack surface per invocation.
- The ESM `import()` wrapper in `embedder.ts` / `providers/mistral.ts` uses a **hardcoded module specifier string** — user input never reaches `new Function(...)`.

## Known limitations

- **Machine fingerprint guessability:** the encryption password is derived from `hostname + username + homedir`. An attacker who can already read `~/.probe/credentials.json` on the target host can also observe those values. The per-install salt and file permissions reduce but do not eliminate this risk. For multi-user systems, rely on OS-level file permissions.
- **LLM prompt injection is not a solved problem.** Probe adds boundary markers, randomization, and system-prompt instructions, but a sufficiently clever payload in a retrieved code chunk could still influence the model. Do not index untrusted codebases and treat answers about adversarial code with skepticism.
