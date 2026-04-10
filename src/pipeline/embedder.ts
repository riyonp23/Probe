// probe — local embeddings via @huggingface/transformers + Xenova/all-MiniLM-L6-v2

import { CodeChunk, EmbeddedChunk, EMBEDDING_MODEL } from "../utils/types";
import { startSpinner, stopSpinnerSuccess, warnMessage } from "../utils/formatter";

const BATCH_SIZE = 50;

// minimal structural types — avoids pulling @huggingface/transformers types into a
// commonjs build (the package is ESM-first and we load it via dynamic import)
interface EmbeddingOutput {
  tolist(): number[][];
}

type EmbedFn = (
  inputs: string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<EmbeddingOutput>;

interface TransformersModule {
  pipeline: (task: string, model: string) => Promise<EmbedFn>;
}

let cachedEmbed: EmbedFn | null = null;

async function getEmbedder(): Promise<EmbedFn> {
  if (cachedEmbed) return cachedEmbed;
  const spinner = startSpinner(
    "Loading embedding model (first run downloads ~80MB)..."
  );
  try {
    // wrap import() in new Function so the TS commonjs emitter doesn't rewrite
    // it to require() — @huggingface/transformers is an ESM package
    const importer = new Function(
      'return import("@huggingface/transformers")'
    ) as () => Promise<TransformersModule>;
    const mod = await importer();
    cachedEmbed = await mod.pipeline("feature-extraction", EMBEDDING_MODEL);
    stopSpinnerSuccess(spinner, "Embedding model ready");
    return cachedEmbed;
  } catch (err) {
    spinner.stop();
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load embedding model: ${msg}`);
  }
}

async function runEmbedder(embed: EmbedFn, inputs: string[]): Promise<number[][]> {
  const output = await embed(inputs, { pooling: "mean", normalize: true });
  return output.tolist();
}

export async function embedChunks(chunks: CodeChunk[]): Promise<EmbeddedChunk[]> {
  const embed = await getEmbedder();
  const total = chunks.length;
  const results: EmbeddedChunk[] = [];
  let failedCount = 0;
  const spinner = startSpinner(`Embedding chunk 0 of ${total}`);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => c.content);
    try {
      const vectors = await runEmbedder(embed, inputs);
      for (let j = 0; j < batch.length; j++) {
        results.push({ chunk: batch[j], embedding: vectors[j] });
      }
    } catch {
      // skip the failing batch — record count, continue pipeline
      failedCount += batch.length;
    }
    spinner.text = `Embedding chunk ${Math.min(i + BATCH_SIZE, total)} of ${total}`;
  }

  stopSpinnerSuccess(spinner, `Embedded ${results.length} chunks`);
  if (failedCount > 0) {
    warnMessage(`Warning: ${failedCount} chunks failed to embed and were skipped.`);
  }
  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  const embed = await getEmbedder();
  const vectors = await runEmbedder(embed, [text]);
  const vec = vectors[0];
  if (!vec) throw new Error("Embedding model returned no vector for the query");
  return vec;
}
