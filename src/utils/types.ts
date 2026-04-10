// probe — shared TypeScript interfaces

export type ChunkType = "function" | "class" | "block" | "module";

export interface CodeChunk {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: ChunkType;
}

export interface EmbeddedChunk {
  chunk: CodeChunk;
  embedding: number[];
}

export interface QueryResult {
  chunk: CodeChunk;
  score: number;
}

export interface ProbeConfig {
  repoPath: string;
  providerId: string;
  apiKey: string;
  exclusions: string[];
  languages: string[];
}

export interface WalkedFile {
  filePath: string;
  content: string;
  language: string;
}

export interface IndexStats {
  chunkCount: number;
  fileCount: number;
  filePaths: Set<string>;
}

// chunker tuning
export const CHUNK_TARGET_MIN_TOKENS = 400;
export const CHUNK_TARGET_MAX_TOKENS = 600;
export const CHUNK_OVERLAP_TOKENS = 50;

// retrieval
export const TOP_K = 5;

// models
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;
// NOTE: the LLM generation model is no longer a single constant — each provider
// carries its own model string in src/pipeline/providers/types.ts

export const TREE_SITTER_EXTENSIONS = [".py", ".ts", ".js", ".tsx", ".jsx"];
export const REGEX_EXTENSIONS = [".java", ".c", ".cpp", ".cs", ".go", ".rb", ".rs", ".md"];
export const SUPPORTED_EXTENSIONS = [...TREE_SITTER_EXTENSIONS, ...REGEX_EXTENSIONS];

export const DEFAULT_EXCLUSIONS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "__pycache__",
  ".probe",
  ".env",
  "package-lock.json",
  "yarn.lock",
];
