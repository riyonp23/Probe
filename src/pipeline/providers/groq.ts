// probe — Groq provider (OpenAI-compatible streaming API)

import { Provider, getProviderInfo, retryStream } from "./types";

interface GroqStreamChunk {
  choices: Array<{ delta?: { content?: string | null } }>;
}
interface GroqCompletions {
  create(params: {
    model: string;
    stream: true;
    max_tokens: number;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }): Promise<AsyncIterable<GroqStreamChunk>>;
}
interface GroqChat {
  completions: GroqCompletions;
}
interface GroqClient {
  chat: GroqChat;
}
interface GroqModule {
  default: new (opts: { apiKey: string }) => GroqClient;
}

const info = getProviderInfo("groq");
if (!info) throw new Error("Groq provider metadata missing");

async function* rawGroqStream(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  maxTokens: number
): AsyncIterable<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("groq-sdk") as GroqModule;
  const Ctor = mod.default;
  const client = new Ctor({ apiKey });
  const stream = await client.chat.completions.create({
    model: info!.model,
    stream: true,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export const groqProvider: Provider = {
  info: info!,
  stream: (sp, um, ak, mt) => retryStream(() => rawGroqStream(sp, um, ak, mt)),
};
