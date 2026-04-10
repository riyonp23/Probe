// probe — Google Gemini provider (default, free tier)

import { Provider, getProviderInfo, retryStream } from "./types";

// structural types — avoids pulling @google/generative-ai types at module-import time
interface GeminiChunk {
  text(): string;
}
interface GeminiStreamResult {
  stream: AsyncIterable<GeminiChunk>;
}
interface GeminiModel {
  generateContentStream(prompt: string): Promise<GeminiStreamResult>;
}
interface GeminiClient {
  getGenerativeModel(params: {
    model: string;
    systemInstruction: string;
    generationConfig?: { maxOutputTokens?: number };
  }): GeminiModel;
}
interface GeminiModule {
  GoogleGenerativeAI: new (apiKey: string) => GeminiClient;
}

const info = getProviderInfo("gemini");
if (!info) throw new Error("Gemini provider metadata missing");

async function* rawGeminiStream(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  maxTokens: number
): AsyncIterable<string> {
  // lazy-require: only loaded when Gemini is the selected provider
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("@google/generative-ai") as GeminiModule;
  const client = new mod.GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: info!.model,
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const result = await model.generateContentStream(userMessage);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

export const geminiProvider: Provider = {
  info: info!,
  stream: (sp, um, ak, mt) => retryStream(() => rawGeminiStream(sp, um, ak, mt)),
};
