/**
 * Antarmuka tunggal ke model bahasa. Agen (agent.ts) hanya mengenal tipe di file ini, jadi penyedia model bisa
 * ditukar (Anthropic, OpenAI atau yang kompatibel) tanpa menyentuh logika toko, dan tes memakai LLM palsu.
 */
export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema objek untuk argumen tool. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  callId: string;
  name: string;
  /** Teks (JSON) yang dikembalikan ke model. Selalu diperlakukan sebagai data, bukan perintah. */
  content: string;
  isError?: boolean;
}

export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens: number;
}

export interface LlmResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface LlmClient {
  /** Nama penyedia, untuk log. */
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** Galat dari penyedia model. Pesannya hanya untuk log server; klien web tidak pernah menerimanya. */
export class LlmError extends Error {
  constructor(public readonly status: number | null, message: string) {
    super(message);
  }
}

export interface HttpClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Ambil sebagian isi respons galat tanpa melempar bila bodinya tidak terbaca. */
export async function errorSnippet(res: Response): Promise<string> {
  try {
    return (await res.text()).replace(/\s+/g, " ").slice(0, 200);
  } catch {
    return "";
  }
}
