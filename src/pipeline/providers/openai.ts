// probe — OpenAI GPT-4o provider

import { Provider, getProviderInfo, retryStream } from "./types";

// structural types — keep the OpenAI SDK out of the module graph until needed
interface OpenAIStreamChunk {
  choices: Array<{ delta?: { content?: string | null } }>;
}
interface OpenAICompletions {
  create(params: {
    model: string;
    stream: true;
    max_tokens: number;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }): Promise<AsyncIterable<OpenAIStreamChunk>>;
}
interface OpenAIChat {
  completions: OpenAICompletions;
}
interface OpenAIClient {
  chat: OpenAIChat;
}
interface OpenAIModule {
  default: new (opts: { apiKey: string }) => OpenAIClient;
}

const info = getProviderInfo("openai");
if (!info) throw new Error("OpenAI provider metadata missing");

async function* rawOpenaiStream(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  maxTokens: number
): AsyncIterable<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("openai") as OpenAIModule;
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

export const openaiProvider: Provider = {
  info: info!,
  stream: (sp, um, ak, mt) => retryStream(() => rawOpenaiStream(sp, um, ak, mt)),
};
