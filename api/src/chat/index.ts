import { AnthropicClient, ANTHROPIC_DEFAULT_MODEL } from "./anthropic.js";
import { OpenAiCompatClient } from "./openai.js";
import type { LlmClient } from "./llm.js";

export interface ChatConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl?: string | undefined;
  globalPerHour: number;
}

export function createLlmClient(c: ChatConfig): LlmClient {
  const o = { apiKey: c.apiKey, model: c.model, ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}) };
  return c.provider === "anthropic" ? new AnthropicClient(o) : new OpenAiCompatClient(o);
}

export { ANTHROPIC_DEFAULT_MODEL };
