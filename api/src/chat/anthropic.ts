import { LlmError, errorSnippet, type HttpClientOptions, type LlmClient, type LlmMessage, type LlmRequest, type LlmResponse, type ToolCall } from "./llm.js";

const DEFAULT_BASE = "https://api.anthropic.com";
export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export function toAnthropicMessages(messages: LlmMessage[]): { role: "user" | "assistant"; content: string | Block[] }[] {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user" as const, content: m.content };
    if (m.role === "assistant") {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      return { role: "assistant" as const, content: blocks.length ? blocks : m.content };
    }
    return {
      role: "user" as const,
      content: m.results.map((r): Block => ({ type: "tool_result", tool_use_id: r.callId, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
    };
  });
}

/** Anthropic Messages API (https://api.anthropic.com/v1/messages) dengan tool use. */
export class AnthropicClient implements LlmClient {
  readonly name = "anthropic";
  constructor(private readonly o: HttpClientOptions) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const base = (this.o.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    let res: Response;
    try {
      res = await (this.o.fetchImpl ?? fetch)(`${base}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.o.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: this.o.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
        }),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 20_000),
      });
    } catch (e) {
      throw new LlmError(null, `anthropic tidak terjangkau: ${e instanceof Error ? e.message : "galat jaringan"}`);
    }
    if (!res.ok) throw new LlmError(res.status, `anthropic HTTP ${res.status}: ${await errorSnippet(res)}`);
    const json: any = await res.json().catch(() => null);
    if (!json || !Array.isArray(json.content)) throw new LlmError(res.status, "anthropic: respons tidak dikenali");
    const text = json.content.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("");
    const toolCalls: ToolCall[] = json.content
      .filter((b: any) => b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string")
      .map((b: any) => ({ id: b.id, name: b.name, input: b.input ?? {} }));
    return { text, toolCalls };
  }
}
