// probe — "probe ask" command handler — retrieval + streaming generation

import { loadConfig } from "../utils/config";
import { embedQuery } from "../pipeline/embedder";
import { getIndex, indexExists, query } from "../pipeline/store";
import {
  ASK_SYSTEM_PROMPT,
  buildAskUserMessage,
} from "../pipeline/prompt-builder";
import {
  dimMessage,
  errorMessage,
  infoMessage,
  printRetrievedChunk,
  printSourceFooter,
  startSpinner,
  stopSpinnerSuccess,
  streamToken,
  warnMessage,
} from "../utils/formatter";
import { QueryResult, TOP_K } from "../utils/types";
import { redactKey } from "../utils/security";
import { getProvider } from "../pipeline/provider";
import { printHeader, printTip } from "../utils/theme";
import {
  MAX_QUESTION_LENGTH,
  resolveAskRepo,
  sanitizeQuestion,
} from "./ask-helpers";

const DEFAULT_MAX_TOKENS = 4096;

export interface AskOptions {
  repo?: string;
  topK: number;
  verbose: boolean;
  maxTokens: number;
}

export async function runAskCommand(
  question: string,
  options: AskOptions
): Promise<void> {
  printHeader("Ask");
  const repoPath = await resolveAskRepo(options.repo);
  const config = loadConfig(repoPath);
  const provider = getProvider(config.providerId);

  const sanitized = sanitizeQuestion(question);
  if (sanitized.text.length === 0) {
    errorMessage("Your question is empty after cleanup — try again with some actual text.");
    process.exit(1);
  }
  if (sanitized.truncated) {
    warnMessage(`Question was long — trimmed to ${MAX_QUESTION_LENGTH} characters.`);
  }
  const cleanQuestion = sanitized.text;

  if (!(await indexExists(config))) {
    errorMessage("No index here yet. Run `probe index <path>` to build one.");
    process.exit(1);
  }

  const retrieveSpinner = startSpinner("Pulling relevant code chunks");
  let results: QueryResult[];
  try {
    const vector = await embedQuery(cleanQuestion);
    const index = await getIndex(config);
    results = await query(index, vector, options.topK);
    stopSpinnerSuccess(retrieveSpinner, `Found ${results.length} chunks`);
  } catch (err) {
    retrieveSpinner.stop();
    const msg = err instanceof Error ? err.message : String(err);
    errorMessage(`Couldn't embed your question: ${redactKey(msg, config.apiKey)}`);
    process.exit(1);
  }

  if (results.length === 0) {
    infoMessage("Nothing matched your question. Try rephrasing or re-indexing the repo.");
    return;
  }

  if (options.verbose) {
    console.log("");
    results.forEach((r, i) => printRetrievedChunk(r, i));
  }

  const userMessage = buildAskUserMessage(cleanQuestion, results, repoPath);
  const thinkingSpinner = startSpinner(`Asking ${provider.info.name}...`);
  let firstTokenSeen = false;
  try {
    for await (const token of provider.stream(
      ASK_SYSTEM_PROMPT,
      userMessage,
      config.apiKey,
      options.maxTokens
    )) {
      if (!firstTokenSeen) {
        thinkingSpinner.stop();
        firstTokenSeen = true;
      }
      streamToken(token);
    }
  } catch (err) {
    if (!firstTokenSeen) thinkingSpinner.stop();
    else console.log("");
    const raw = err instanceof Error ? err.message : String(err);
    const safe = redactKey(raw, config.apiKey);
    errorMessage(`${provider.info.name} didn't answer. Double-check your API key. (${safe})`);
    dimMessage("Run `probe setup --status` to see which key is configured.");
    process.exit(1);
  }
  console.log("");

  const sources = results.map((r) => r.chunk.filePath);
  printSourceFooter(sources, repoPath);
  if (!options.verbose) {
    printTip("Add --verbose next time to see which code chunks got pulled.");
  }
}

export function defaultAskOptions(): AskOptions {
  return {
    topK: TOP_K,
    verbose: false,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}
