// probe — "probe specs" — a short tour of what's under the hood

import { BOLD, BRAND_COLOR, DIM, printKeyValue, printLogo } from "../utils/theme";

function section(title: string): void {
  console.log("");
  console.log(`${BRAND_COLOR("◈")} ${BOLD(title)}`);
  console.log("");
}

function bullet(text: string): void {
  console.log(`  ${DIM("•")} ${DIM(text)}`);
}

export async function runSpecsCommand(): Promise<void> {
  printLogo();

  section("Architecture");
  console.log("  CLI ─→ Walker ─→ Chunker ─→ Embedder ─→ Vector Store");
  console.log("                                              │");
  console.log("  Question ─→ Embed ─→ Similarity Search ─→ LLM ─→ Answer");

  section("Tech Stack");
  printKeyValue("Language      ", "TypeScript (Node.js 20+)");
  printKeyValue("CLI Framework ", "Commander.js");
  printKeyValue("Code Parsing  ", "Tree-sitter (AST) + regex fallback");
  printKeyValue("Embeddings    ", "all-MiniLM-L6-v2 via HuggingFace (local, no API)");
  printKeyValue("Vector Store  ", "Vectra (local JSON, no server)");
  printKeyValue("LLM Providers ", "Gemini · Claude · GPT-4o · Groq · Mistral");
  printKeyValue("Security      ", "AES-256-GCM key encryption, machine-bound KDF");

  section("How It Works");
  console.log(`  ${BOLD("Indexing")}`);
  bullet("Walks the repo, filters by language and exclusion patterns");
  bullet("Parses code into AST-aware chunks (functions, classes, blocks)");
  bullet("Embeds each chunk locally with all-MiniLM-L6-v2 (384-dim vectors)");
  bullet("Stores vectors + metadata in a local Vectra index (.probe/)");
  console.log("");
  console.log(`  ${BOLD("Querying")}`);
  bullet("Embeds your question with the same model");
  bullet("Grabs the top-K chunks by cosine similarity");
  bullet("Sends those chunks as context to your chosen LLM");
  bullet("Streams the answer with file and line citations");

  section("Supported Languages");
  printKeyValue("AST parsing   ", "Python · TypeScript · JavaScript · TSX · JSX");
  printKeyValue("Regex fallback", "Java · C · C++ · C# · Go · Ruby · Rust · Markdown");

  section("Security");
  bullet("API keys encrypted at rest (AES-256-GCM)");
  bullet("Decryption key derived from machine fingerprint (hostname + user + homedir)");
  bullet("Credentials stored at ~/.probe/credentials.json (600 permissions)");
  bullet("Prompt injection boundaries on all LLM context");
  bullet("Input sanitization on user queries");
  bullet("GitHub cloning is restricted to github.com");
  console.log("");
}
