// probe — Mistral AI provider
// @mistralai/mistralai 2.x is ESM-only, so we load it via the dynamic import()
// wrapper (same trick as embedder.ts) to avoid ERR_REQUIRE_ESM in the CJS build.

import { Provider, getProviderInfo, retryStream } from "./types";

interface MistralDelta {
  content?: string | Array<{ text?: string }> | null;
}
interface MistralChoice {
  delta: MistralDelta;
}
interface MistralEvent {
  data: { choices: MistralChoice[] };
}
interface MistralChat {
  stream(req: {
    model: string;
    maxTokens?: number;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }): Promise<AsyncIterable<MistralEvent>>;
}
interface MistralClient {
  chat: MistralChat;
}
interface MistralModule {
  Mistral: new (opts: { apiKey: string }) => MistralClient;
}

const info = getProviderInfo("mistral");
if (!info) throw new Error("Mistral provider metadata missing");

function extractText(content: MistralDelta["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text ?? "").join("");
  return "";
}

async function* rawMistralStream(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  maxTokens: number
): AsyncIterable<string> {
  // wrap import() in new Function so the TS commonjs emitter doesn't rewrite
  // it to require() — @mistralai/mistralai is an ESM-only package
  const importer = new Function(
    'return import("@mistralai/mistralai")'
  ) as () => Promise<MistralModule>;
  const mod = await importer();
  const client = new mod.Mistral({ apiKey });
  const stream = await client.chat.stream({
    model: info!.model,
    maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  for await (const event of stream) {
    const delta = event.data.choices[0]?.delta;
    if (!delta) continue;
    const text = extractText(delta.content);
    if (text) yield text;
  }
}

export const mistralProvider: Provider = {
  info: info!,
  stream: (sp, um, ak, mt) => retryStream(() => rawMistralStream(sp, um, ak, mt)),
};
