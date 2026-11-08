import { describe, it, expect } from "vitest";
import { AnthropicClient, toAnthropicMessages } from "../src/chat/anthropic.js";
import { OpenAiCompatClient, toOpenAiMessages } from "../src/chat/openai.js";
import { LlmError, type LlmMessage, type LlmRequest } from "../src/chat/llm.js";
import { loadConfig } from "../src/config.js";

const TOOL = { name: "get_packages", description: "d", inputSchema: { type: "object", properties: { destination: { type: "string" } } } };
const history: LlmMessage[] = [
  { role: "user", content: "paket jepang?" },
  { role: "assistant", content: "Sebentar.", toolCalls: [{ id: "c1", name: "get_packages", input: { destination: "jepang" } }] },
  { role: "tool", results: [{ callId: "c1", name: "get_packages", content: '{"packages":[]}' }, { callId: "c2", name: "x", content: '{"error":"boom"}', isError: true }] },
];
const req: LlmRequest = { system: "SYS", messages: history, tools: [TOOL], maxTokens: 123 };

function fakeFetch(res: Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); if (res instanceof Error) throw res; return res.clone(); }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("AnthropicClient", () => {
  it("memetakan pesan, tool_use, dan tool_result ke format Messages API", () => {
    const m = toAnthropicMessages(history);
    expect(m[0]).toEqual({ role: "user", content: "paket jepang?" });
    expect(m[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Sebentar." }, { type: "tool_use", id: "c1", name: "get_packages", input: { destination: "jepang" } }] });
    expect(m[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: '{"packages":[]}' }, { type: "tool_result", tool_use_id: "c2", content: '{"error":"boom"}', is_error: true }] });
  });

  it("mengirim header, model, system, tools; mem-parse teks dan tool_use", async () => {
    const { f, calls } = fakeFetch(json({ content: [{ type: "text", text: "Hai " }, { type: "text", text: "dunia" }, { type: "tool_use", id: "t9", name: "get_packages", input: { destination: "bali" } }] }));
    const r = await new AnthropicClient({ apiKey: "sk-ant-secret", model: "m1", fetchImpl: f }).complete(req);
    expect(r).toEqual({ text: "Hai dunia", toolCalls: [{ id: "t9", name: "get_packages", input: { destination: "bali" } }] });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-ant-secret");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({ model: "m1", max_tokens: 123, system: "SYS", tools: [{ name: "get_packages", input_schema: TOOL.inputSchema }] });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("HTTP galat, jaringan putus, dan respons aneh menjadi LlmError tanpa membocorkan kunci", async () => {
    const mk = (res: Response | Error) => new AnthropicClient({ apiKey: "sk-ant-secret", model: "m", fetchImpl: fakeFetch(res).f }).complete(req);
    const e401 = await mk(json({ error: { message: "invalid x-api-key" } }, 401)).catch((e) => e);
    expect(e401).toBeInstanceOf(LlmError);
    expect(e401.status).toBe(401);
    expect(e401.message).not.toContain("sk-ant-secret");
    const net = await mk(new Error("ECONNRESET")).catch((e) => e);
    expect(net).toBeInstanceOf(LlmError);
    expect(net.status).toBeNull();
    await expect(mk(json({ nope: true }))).rejects.toBeInstanceOf(LlmError);
  });
});

describe("OpenAiCompatClient", () => {
  it("memetakan pesan: system di depan, tool_calls dengan argumen JSON string, satu pesan tool per hasil", () => {
    const m = toOpenAiMessages("SYS", history);
    expect(m[0]).toEqual({ role: "system", content: "SYS" });
    expect(m[2]).toEqual({ role: "assistant", content: "Sebentar.", tool_calls: [{ id: "c1", type: "function", function: { name: "get_packages", arguments: '{"destination":"jepang"}' } }] });
    expect(m.slice(3)).toEqual([{ role: "tool", tool_call_id: "c1", content: '{"packages":[]}' }, { role: "tool", tool_call_id: "c2", content: '{"error":"boom"}' }]);
  });

  it("baseUrl kustom, header Bearer, dan mem-parse tool_calls (argumen rusak menjadi {})", async () => {
    const { f, calls } = fakeFetch(json({ choices: [{ message: { content: null, tool_calls: [
      { id: "a", type: "function", function: { name: "get_packages", arguments: '{"destination":"bali"}' } },
      { id: "b", type: "function", function: { name: "get_packages", arguments: "{rusak" } },
    ] } }] }));
    const r = await new OpenAiCompatClient({ apiKey: "sk-secret", model: "gpt-x", baseUrl: "https://llm.example/v1/", fetchImpl: f }).complete(req);
    expect(r.text).toBe("");
    expect(r.toolCalls).toEqual([{ id: "a", name: "get_packages", input: { destination: "bali" } }, { id: "b", name: "get_packages", input: {} }]);
    expect(calls[0]!.url).toBe("https://llm.example/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer sk-secret");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ model: "gpt-x", max_tokens: 123, tools: [{ type: "function", function: { name: "get_packages", parameters: TOOL.inputSchema } }] });
  });

  it("teks biasa tanpa tool, dan galat HTTP menjadi LlmError", async () => {
    const ok = await new OpenAiCompatClient({ apiKey: "k", model: "m", fetchImpl: fakeFetch(json({ choices: [{ message: { content: "Halo" } }] })).f }).complete(req);
    expect(ok).toEqual({ text: "Halo", toolCalls: [] });
    const bad = await new OpenAiCompatClient({ apiKey: "k", model: "m", fetchImpl: fakeFetch(json({ error: "x" }, 429)).f }).complete(req).catch((e) => e);
    expect(bad).toBeInstanceOf(LlmError);
    expect(bad.status).toBe(429);
  });
});

describe("konfigurasi chat", () => {
  const base = { DATABASE_URL: "postgres://x" };
  it("tanpa LLM_API_KEY chat nonaktif", () => expect(loadConfig(base).chat).toBeNull());
  it("kunci saja -> anthropic dengan model bawaan dan batas 300 per jam", () => {
    expect(loadConfig({ ...base, LLM_API_KEY: "sk-ant-12345678" }).chat).toEqual({ provider: "anthropic", apiKey: "sk-ant-12345678", model: "claude-haiku-5-5", baseUrl: undefined, globalPerHour: 300 });
  });
  it("openai wajib LLM_MODEL; baseUrl dan batas bisa diatur", () => {
    expect(() => loadConfig({ ...base, LLM_API_KEY: "sk-12345678", LLM_PROVIDER: "openai" })).toThrow(/LLM_MODEL/);
    expect(loadConfig({ ...base, LLM_API_KEY: "sk-12345678", LLM_PROVIDER: "openai", LLM_MODEL: "gpt-x", LLM_BASE_URL: "https://llm.example/v1", CHAT_GLOBAL_PER_HOUR: "50" }).chat).toMatchObject({ provider: "openai", model: "gpt-x", baseUrl: "https://llm.example/v1", globalPerHour: 50 });
  });
  it("LLM_PROVIDER tanpa kunci ditolak; nilai kosong dianggap tidak diisi", () => {
    expect(() => loadConfig({ ...base, LLM_PROVIDER: "anthropic" })).toThrow(/LLM_API_KEY/);
    expect(loadConfig({ ...base, LLM_API_KEY: "", LLM_PROVIDER: "", LLM_MODEL: "" }).chat).toBeNull();
  });
});
