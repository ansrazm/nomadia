import { LlmError, errorSnippet, type HttpClientOptions, type LlmClient, type LlmMessage, type LlmRequest, type LlmResponse, type ToolCall } from "./llm.js";

export const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";

type OaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAiMessages(system: string, messages: LlmMessage[]): OaMessage[] {
  const out: OaMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) } : {}),
      });
    } else for (const r of m.results) out.push({ role: "tool", tool_call_id: r.callId, content: r.content });
  }
  return out;
}

/** Endpoint /chat/completions bergaya OpenAI. Banyak penyedia lain (Groq, OpenRouter, Gemini, Ollama...) menirunya lewat LLM_BASE_URL. */
export class OpenAiCompatClient implements LlmClient {
  readonly name = "openai";
  constructor(private readonly o: HttpClientOptions) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const base = (this.o.baseUrl ?? OPENAI_DEFAULT_BASE).replace(/\/+$/, "");
    let res: Response;
    try {
      res = await (this.o.fetchImpl ?? fetch)(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.o.apiKey}` },
        body: JSON.stringify({
          model: this.o.model,
          max_tokens: req.maxTokens,
          messages: toOpenAiMessages(req.system, req.messages),
          tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
        }),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 20_000),
      });
    } catch (e) {
      throw new LlmError(null, `openai tidak terjangkau: ${e instanceof Error ? e.message : "galat jaringan"}`);
    }
    if (!res.ok) throw new LlmError(res.status, `openai HTTP ${res.status}: ${await errorSnippet(res)}`);
    const json: any = await res.json().catch(() => null);
    const msg = json?.choices?.[0]?.message;
    if (!msg) throw new LlmError(res.status, "openai: respons tidak dikenali");
    const toolCalls: ToolCall[] = (Array.isArray(msg.tool_calls) ? msg.tool_calls : [])
      .filter((c: any) => c?.type === "function" && typeof c.id === "string" && typeof c.function?.name === "string")
      .map((c: any) => {
        let input: unknown = {};
        try { input = JSON.parse(c.function.arguments || "{}"); } catch { /* argumen rusak: biarkan {} dan validasi tool yang menolaknya */ }
        return { id: c.id, name: c.function.name, input };
      });
    return { text: typeof msg.content === "string" ? msg.content : "", toolCalls };
  }
}
