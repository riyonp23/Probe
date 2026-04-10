// probe — vectra LocalIndex management (create, add, query, stats)

import * as fs from "fs";
import * as path from "path";
import { LocalIndex } from "vectra";
import {
  ChunkType,
  EmbeddedChunk,
  IndexStats,
  ProbeConfig,
  QueryResult,
  TOP_K,
} from "../utils/types";
import { probeDir } from "../utils/config";

// metadata shape for a chunk stored in vectra. vectra restricts metadata values
// to primitives (string | number | boolean), so content is stored as a string.
interface ChunkMetadata {
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  chunkType: string;
  content: string;
  [key: string]: string | number | boolean;
}

function indexPath(repoPath: string): string {
  return path.join(probeDir(repoPath), "vectra-index");
}

function buildIndex(repoPath: string): LocalIndex<ChunkMetadata> {
  const dir = probeDir(repoPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return new LocalIndex<ChunkMetadata>(indexPath(repoPath));
}

export async function createOrResetIndex(
  config: ProbeConfig,
  force: boolean = true
): Promise<LocalIndex<ChunkMetadata>> {
  const index = buildIndex(config.repoPath);
  const exists = await index.isIndexCreated();
  if (exists && force) {
    // deleteIndex() removes the folder on disk, then we recreate it
    await index.deleteIndex();
  }
  if (!exists || force) {
    await index.createIndex({ version: 1 });
  }
  return index;
}

export async function getIndex(
  config: ProbeConfig
): Promise<LocalIndex<ChunkMetadata>> {
  return buildIndex(config.repoPath);
}

export async function addChunks(
  index: LocalIndex<ChunkMetadata>,
  embedded: EmbeddedChunk[]
): Promise<void> {
  if (embedded.length === 0) return;
  const items = embedded.map((e, i) => ({
    id: `${e.chunk.filePath}:${e.chunk.startLine}-${e.chunk.endLine}#${i}`,
    vector: e.embedding,
    metadata: {
      filePath: e.chunk.filePath,
      startLine: e.chunk.startLine,
      endLine: e.chunk.endLine,
      language: e.chunk.language,
      chunkType: e.chunk.chunkType,
      content: e.chunk.content,
    } satisfies ChunkMetadata,
  }));
  await index.batchInsertItems(items);
}

export async function query(
  index: LocalIndex<ChunkMetadata>,
  embedding: number[],
  topK: number = TOP_K
): Promise<QueryResult[]> {
  const results = await index.queryItems(embedding, "", topK);
  return results.map((r) => ({
    chunk: {
      content: r.item.metadata.content,
      filePath: r.item.metadata.filePath,
      startLine: r.item.metadata.startLine,
      endLine: r.item.metadata.endLine,
      language: r.item.metadata.language,
      chunkType: r.item.metadata.chunkType as ChunkType,
    },
    score: r.score,
  }));
}

export async function getIndexStats(
  index: LocalIndex<ChunkMetadata>
): Promise<IndexStats> {
  const items = await index.listItems();
  const files = new Set<string>();
  for (const item of items) {
    if (typeof item.metadata.filePath === "string") {
      files.add(item.metadata.filePath);
    }
  }
  return { chunkCount: items.length, fileCount: files.size, filePaths: files };
}

export async function indexExists(config: ProbeConfig): Promise<boolean> {
  const dir = indexPath(config.repoPath);
  if (!fs.existsSync(dir)) return false;
  const index = buildIndex(config.repoPath);
  const created = await index.isIndexCreated();
  if (!created) return false;
  const stats = await index.getIndexStats();
  return stats.items > 0;
}
