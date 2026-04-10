// probe — Anthropic Claude provider

import { Provider, getProviderInfo, retryStream } from "./types";

// structural types — keep the Anthropic SDK out of the module graph until needed
interface AnthropicTextDelta {
  type: "text_delta";
  text: string;
}
interface AnthropicStreamEvent {
  type: string;
  delta?: { type: string; text?: string };
}
interface AnthropicMessages {
  create(params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    stream: true;
  }): Promise<AsyncIterable<AnthropicStreamEvent>>;
}
interface AnthropicClient {
  messages: AnthropicMessages;
}
interface AnthropicModule {
  default: new (opts: { apiKey: string }) => AnthropicClient;
}

const info = getProviderInfo("anthropic");
if (!info) throw new Error("Anthropic provider metadata missing");

function isTextDelta(
  delta: { type: string; text?: string } | undefined
): delta is AnthropicTextDelta {
  return !!delta && delta.type === "text_delta" && typeof delta.text === "string";
}

async function* rawAnthropicStream(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  maxTokens: number
): AsyncIterable<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("@anthropic-ai/sdk") as AnthropicModule;
  const Ctor = mod.default;
  const client = new Ctor({ apiKey });
  const stream = await client.messages.create({
    model: info!.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    stream: true,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && isTextDelta(event.delta)) {
      yield event.delta.text;
    }
  }
}

export const anthropicProvider: Provider = {
  info: info!,
  stream: (sp, um, ak, mt) => retryStream(() => rawAnthropicStream(sp, um, ak, mt)),
};
