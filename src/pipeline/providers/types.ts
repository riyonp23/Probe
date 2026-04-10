// probe — shared provider abstraction types + lightweight metadata

import { dimMessage } from "../../utils/formatter";

export interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  keyPrefix: string;
  keyHelpUrl: string;
  free: boolean;
  validateKeyFormat(key: string): boolean;
}

export interface Provider {
  info: ProviderInfo;
  stream(
    systemPrompt: string,
    userMessage: string,
    apiKey: string,
    maxTokens: number
  ): AsyncIterable<string>;
}

export interface ProviderConfig {
  providerId: string;
  apiKey: string;
}

function minLen(key: string, n: number): boolean {
  return typeof key === "string" && key.trim().length >= n;
}

// metadata-only list — importing this does NOT pull any provider SDK.
// setup-cmd renders this menu without loading provider code.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    name: "Gemini",
    model: "gemini-2.5-flash",
    keyPrefix: "",
    keyHelpUrl: "https://aistudio.google.com/apikey",
    free: true,
    validateKeyFormat: (k) => minLen(k, 20),
  },
  {
    id: "anthropic",
    name: "Claude",
    model: "claude-sonnet-4-20250514",
    keyPrefix: "sk-ant-",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    free: false,
    validateKeyFormat: (k) => minLen(k, 20) && k.startsWith("sk-ant-"),
  },
  {
    id: "openai",
    name: "GPT-4o",
    model: "gpt-4o",
    keyPrefix: "sk-",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    free: false,
    validateKeyFormat: (k) =>
      minLen(k, 20) && k.startsWith("sk-") && !k.startsWith("sk-ant-"),
  },
  {
    id: "groq",
    name: "Groq",
    model: "llama-3.3-70b-versatile",
    keyPrefix: "gsk_",
    keyHelpUrl: "https://console.groq.com/keys",
    free: true,
    validateKeyFormat: (k) => minLen(k, 20) && k.startsWith("gsk_"),
  },
  {
    id: "mistral",
    name: "Mistral",
    model: "mistral-large-latest",
    keyPrefix: "",
    keyHelpUrl: "https://console.mistral.ai/api-keys",
    free: false,
    validateKeyFormat: (k) => minLen(k, 20),
  },
];

export function getProviderInfo(providerId: string): ProviderInfo | null {
  return PROVIDERS.find((p) => p.id === providerId) ?? null;
}

// shared retry wrapper — any provider can call retryStream(() => rawGen(...))
// and get free retries on 503 / 429 / transient network errors. We only retry
// before the first token has been yielded so partial output never duplicates.
const RETRY_DELAYS_MS = [2000, 4000, 8000];

export function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const e = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
  };
  const status = e.status ?? e.statusCode;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const code = e.code;
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    code === "ENETUNREACH" ||
    code === "ENOTFOUND"
  ) {
    return true;
  }
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("service unavailable") ||
    msg.includes("timeout")
  );
}

export async function* retryStream(
  factory: () => AsyncIterable<string>
): AsyncIterable<string> {
  let attempt = 0;
  while (true) {
    let yieldedAny = false;
    try {
      for await (const token of factory()) {
        yieldedAny = true;
        yield token;
      }
      return;
    } catch (err) {
      if (yieldedAny || attempt >= RETRY_DELAYS_MS.length || !isRetryableError(err)) {
        throw err;
      }
      const wait = RETRY_DELAYS_MS[attempt];
      dimMessage(`Provider busy, retrying in ${wait / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      attempt++;
    }
  }
}
