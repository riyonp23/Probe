// probe — provider factory + auto-detection from key prefix
// Lazy-loads the selected provider module so we never import all 5 SDKs at once.

import { Provider, PROVIDERS, getProviderInfo } from "./providers/types";

export function getProvider(providerId: string): Provider {
  const info = getProviderInfo(providerId);
  if (!info) {
    const valid = PROVIDERS.map((p) => p.id).join(", ");
    throw new Error(
      `Unknown provider: "${providerId}". Valid providers are: ${valid}.`
    );
  }
  // dynamic require() so only the selected provider's module (and transitively
  // only its SDK) is pulled in at runtime.
  switch (info.id) {
    case "gemini": {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { geminiProvider } = require("./providers/gemini") as typeof import("./providers/gemini");
      return geminiProvider;
    }
    case "anthropic": {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { anthropicProvider } = require("./providers/anthropic") as typeof import("./providers/anthropic");
      return anthropicProvider;
    }
    case "openai": {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { openaiProvider } = require("./providers/openai") as typeof import("./providers/openai");
      return openaiProvider;
    }
    case "groq": {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { groqProvider } = require("./providers/groq") as typeof import("./providers/groq");
      return groqProvider;
    }
    case "mistral": {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { mistralProvider } = require("./providers/mistral") as typeof import("./providers/mistral");
      return mistralProvider;
    }
    default:
      throw new Error(`Unknown provider id: ${info.id}`);
  }
}

// Priority order matters: sk-ant- must match BEFORE sk- (OpenAI's generic prefix).
export function detectProvider(apiKey: string): string | null {
  if (!apiKey || typeof apiKey !== "string") return null;
  if (apiKey.startsWith("sk-ant-")) return "anthropic";
  if (apiKey.startsWith("gsk_")) return "groq";
  if (apiKey.startsWith("sk-")) return "openai";
  return null;
}
