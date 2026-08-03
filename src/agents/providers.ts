import Anthropic from "@anthropic-ai/sdk";

// Multi-provider adapter layer — BYOK, browser-direct, no server of ours in the
// path. Keys live ONLY in this browser's localStorage and travel ONLY to the
// provider the operator picked. This module owns three things and nothing else:
//
//   1. the provider catalog (ids, docs, models, whether a base URL is needed)
//   2. per-provider credential storage
//   3. a UNIFIED streaming call — streamChat — plus an honest reachability probe
//
// The unified shapes are deliberately Anthropic-shaped (text / tool_use /
// tool_result blocks). brain.ts's runToolLoop already speaks exactly that, so
// the other providers are adapted INTO the existing contract rather than the
// contract being widened for them.

// ---- catalog ----------------------------------------------------------------

export type Provider = "anthropic" | "google" | "openai-compatible";

export interface ProviderInfo {
  id: Provider;
  label: string;
  /** Where the operator gets a key. */
  docs: string;
  /** True when the operator must supply the endpoint themselves. */
  needsBaseUrl: boolean;
  /** Suggested models. Free text is always allowed — see modelsFree. */
  models: string[];
  /** True when the model field is free text with no useful default list. */
  modelsFree: boolean;
  /** Only for needsBaseUrl providers: suggestions, not a whitelist. */
  baseUrlPresets: string[];
}

// NOTE ON MODEL IDS: these drift. Providers rename, deprecate, and re-point
// aliases on their own schedule, so treat this list as a convenience default,
// not a source of truth — every field in the UI stays editable, and a wrong id
// surfaces as a plain 404 from the provider rather than something we guess at.
export const PROVIDERS: Record<Provider, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    docs: "https://docs.anthropic.com/en/api/getting-started",
    needsBaseUrl: false,
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    modelsFree: false,
    baseUrlPresets: [],
  },
  google: {
    id: "google",
    label: "Google AI Studio",
    docs: "https://ai.google.dev/gemini-api/docs",
    needsBaseUrl: false,
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    modelsFree: false,
    baseUrlPresets: [],
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    docs: "https://platform.openai.com/docs/api-reference/chat",
    needsBaseUrl: true,
    models: [],
    modelsFree: true,
    baseUrlPresets: ["https://openrouter.ai/api/v1", "https://api.groq.com/openai/v1", "https://api.x.ai/v1"],
  },
};

export const PROVIDER_IDS: Provider[] = ["anthropic", "google", "openai-compatible"];

export const isProvider = (v: unknown): v is Provider =>
  typeof v === "string" && (PROVIDER_IDS as string[]).includes(v);

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
const ANTHROPIC_VERSION = "2023-06-01";

/** Trailing slashes are the single most common paste error. */
export const normalizeBaseUrl = (u: string): string => u.trim().replace(/\/+$/, "");

// ---- credential storage -----------------------------------------------------
// Same discipline as brain.ts: every localStorage touch is wrapped (private
// mode throws), and the key value is NEVER logged, never put in an error
// message, and never placed in a URL.

export const KEY_PREFIX = "agent-hub:key:";
export const keyStorageKey = (p: Provider): string => `${KEY_PREFIX}${p}`;
const BASE_URL_KEY = "agent-hub:base-url:openai-compatible";
const PROVIDER_KEY = "agent-hub:provider";
const MODEL_PREFIX = "agent-hub:model:";
// brain.ts's original single-provider key. Read as a fallback and mirrored on
// write so an operator who already pasted a Claude key doesn't have to re-enter
// it, and so the pre-existing brain.ts path keeps working unchanged.
const LEGACY_ANTHROPIC_KEY = "agent-hub:anthropic-key";

export const getProviderKey = (p: Provider): string | null => {
  try {
    const k = localStorage.getItem(keyStorageKey(p));
    if (k) return k;
    return p === "anthropic" ? localStorage.getItem(LEGACY_ANTHROPIC_KEY) : null;
  } catch {
    return null;
  }
};

export const setProviderKey = (p: Provider, key: string): void => {
  try {
    const clean = key.trim();
    localStorage.setItem(keyStorageKey(p), clean);
    if (p === "anthropic") localStorage.setItem(LEGACY_ANTHROPIC_KEY, clean);
  } catch {
    /* private mode */
  }
};

export const clearProviderKey = (p: Provider): void => {
  try {
    localStorage.removeItem(keyStorageKey(p));
    if (p === "anthropic") localStorage.removeItem(LEGACY_ANTHROPIC_KEY);
  } catch {
    /* ignore */
  }
};

export const getBaseUrl = (p: Provider): string | null => {
  if (!PROVIDERS[p].needsBaseUrl) return null;
  try {
    const v = localStorage.getItem(BASE_URL_KEY);
    return v ? normalizeBaseUrl(v) : null;
  } catch {
    return null;
  }
};

export const setBaseUrl = (p: Provider, url: string): void => {
  if (!PROVIDERS[p].needsBaseUrl) return;
  try {
    localStorage.setItem(BASE_URL_KEY, normalizeBaseUrl(url));
  } catch {
    /* ignore */
  }
};

export const getSelectedProvider = (): Provider => {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    return isProvider(v) ? v : "anthropic";
  } catch {
    return "anthropic";
  }
};

export const setSelectedProvider = (p: Provider): void => {
  try {
    localStorage.setItem(PROVIDER_KEY, p);
  } catch {
    /* ignore */
  }
};

export const getProviderModel = (p: Provider): string => {
  try {
    return localStorage.getItem(`${MODEL_PREFIX}${p}`) || PROVIDERS[p].models[0] || "";
  } catch {
    return PROVIDERS[p].models[0] || "";
  }
};

export const setProviderModel = (p: Provider, model: string): void => {
  try {
    localStorage.setItem(`${MODEL_PREFIX}${p}`, model.trim());
  } catch {
    /* ignore */
  }
};

/** Everything needed to make a call, or the reason we can't. */
export const readyToCall = (p: Provider): { ok: true } | { ok: false; reason: string } => {
  if (!getProviderKey(p)) return { ok: false, reason: `no API key stored for ${PROVIDERS[p].label}` };
  if (PROVIDERS[p].needsBaseUrl && !getBaseUrl(p)) return { ok: false, reason: "no base URL set" };
  return { ok: true };
};

// ---- unified message / tool shapes ------------------------------------------
// Structurally a subset of the Anthropic SDK's types, so AGENT_TOOLS and the
// message array from brain.ts pass straight through with no mapping.

export interface ChatToolSchema {
  type: "object";
  properties?: unknown | null;
  required?: string[] | null;
  [k: string]: unknown;
}

export interface ChatTool {
  name: string;
  description?: string;
  input_schema: ChatToolSchema;
}

export interface TextBlock {
  type: "text";
  text: string;
}
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}
export type ChatContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ChatContentBlock[];
}

export interface ChatToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamChatResult {
  text: string;
  toolCalls: ChatToolCall[];
  /** The assistant turn to append before sending tool results back. */
  content: ChatContentBlock[];
}

export interface StreamChatOptions {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  system: string;
  messages: ChatMessage[];
  /** May be empty — every provider path omits the field entirely when it is. */
  tools?: ChatTool[];
  onDelta?: (text: string) => void;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const blocksOf = (m: ChatMessage): ChatContentBlock[] =>
  typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;

// ---- tool schema conversion (both directions) -------------------------------

export interface OpenAiTool {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

export interface GoogleFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

const objectSchema = (s: ChatToolSchema): Record<string, unknown> => ({
  type: "object",
  properties: (s.properties as Record<string, unknown>) ?? {},
  ...(s.required && s.required.length ? { required: s.required } : {}),
});

export const toOpenAiTools = (tools: ChatTool[]): OpenAiTool[] =>
  tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      parameters: objectSchema(t.input_schema),
    },
  }));

export const fromOpenAiTools = (tools: OpenAiTool[]): ChatTool[] =>
  tools.map((t) => {
    const p = (t.function.parameters ?? {}) as Record<string, unknown>;
    return {
      name: t.function.name,
      ...(t.function.description ? { description: t.function.description } : {}),
      input_schema: {
        type: "object",
        properties: (p.properties as Record<string, unknown>) ?? {},
        required: (p.required as string[]) ?? [],
      } as ChatToolSchema,
    };
  });

// Google's schema dialect is a subset of JSON Schema: it rejects keys like
// $schema / additionalProperties, and a parameters object with no properties is
// rejected outright — so a no-arg tool must omit `parameters` entirely (that is
// exactly read_recent_commits, our most-used tool).
const GOOGLE_SCHEMA_KEYS = new Set(["type", "description", "enum", "items", "properties", "required", "format", "nullable"]);

// Schema-aware on purpose: the keys INSIDE a `properties` map are the caller's
// parameter names (path, agentId, …), not schema keywords, so keyword filtering
// must not be applied to them. A naive recursive filter deletes every parameter
// in the tool — the round-trip test below is what caught exactly that.
const pruneSchema = (v: unknown): unknown => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!GOOGLE_SCHEMA_KEYS.has(k)) continue;
    if (k === "properties" && val && typeof val === "object") {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(val as Record<string, unknown>)) props[name] = pruneSchema(sub);
      out[k] = props;
    } else if (k === "items") {
      out[k] = pruneSchema(val);
    } else {
      out[k] = val;
    }
  }
  return out;
};

export const toGoogleFunctionDeclarations = (tools: ChatTool[]): GoogleFunctionDeclaration[] =>
  tools.map((t) => {
    const props = (t.input_schema.properties as Record<string, unknown>) ?? {};
    const hasProps = Object.keys(props).length > 0;
    return {
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      ...(hasProps
        ? {
            parameters: pruneSchema({
              type: "object",
              properties: props,
              ...(t.input_schema.required && t.input_schema.required.length
                ? { required: t.input_schema.required }
                : {}),
            }) as Record<string, unknown>,
          }
        : {}),
    };
  });

export const fromGoogleFunctionDeclarations = (decls: GoogleFunctionDeclaration[]): ChatTool[] =>
  decls.map((d) => {
    const p = (d.parameters ?? {}) as Record<string, unknown>;
    return {
      name: d.name,
      ...(d.description ? { description: d.description } : {}),
      input_schema: {
        type: "object",
        properties: (p.properties as Record<string, unknown>) ?? {},
        required: (p.required as string[]) ?? [],
      } as ChatToolSchema,
    };
  });

// ---- message conversion -----------------------------------------------------

export interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

export const toOpenAiMessages = (system: string, messages: ChatMessage[]): OpenAiMessage[] => {
  const out: OpenAiMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    const blocks = blocksOf(m);
    const text = blocks
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const uses = blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
    const results = blocks.filter((b): b is ToolResultBlock => b.type === "tool_result");
    // Tool results are their OWN role in the OpenAI dialect, and they have to
    // precede any fresh user text so the assistant's tool_calls are answered
    // before the conversation moves on.
    for (const r of results) out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
    if (m.role === "assistant") {
      if (text || uses.length) {
        out.push({
          role: "assistant",
          content: text || null,
          ...(uses.length
            ? {
                tool_calls: uses.map((u) => ({
                  id: u.id,
                  type: "function" as const,
                  function: { name: u.name, arguments: JSON.stringify(u.input ?? {}) },
                })),
              }
            : {}),
        });
      }
    } else if (text) {
      out.push({ role: "user", content: text });
    }
  }
  return out;
};

export interface GooglePart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
export interface GoogleContent {
  role: "user" | "model";
  parts: GooglePart[];
}

export const toGoogleContents = (messages: ChatMessage[]): GoogleContent[] => {
  // Google addresses a tool response by the FUNCTION NAME, not by a call id, so
  // the id→name mapping has to be carried forward from the tool_use blocks
  // earlier in the transcript.
  const nameById = new Map<string, string>();
  for (const m of messages) {
    for (const b of blocksOf(m)) if (b.type === "tool_use") nameById.set(b.id, b.name);
  }
  const out: GoogleContent[] = [];
  for (const m of messages) {
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    const parts: GooglePart[] = [];
    for (const b of blocksOf(m)) {
      if (b.type === "text") {
        if (b.text) parts.push({ text: b.text });
      } else if (b.type === "tool_use") {
        parts.push({ functionCall: { name: b.name, args: b.input ?? {} } });
      } else {
        // functionResponse parts ride in a "user" content by the v1beta REST
        // convention (the model produced the call; the caller answers it).
        parts.push({
          functionResponse: {
            name: nameById.get(b.tool_use_id) ?? b.tool_use_id,
            response: { result: b.content },
          },
        });
      }
    }
    if (parts.length) out.push({ role, parts });
  }
  return out;
};

// ---- request shaping (REST providers) ---------------------------------------

export interface RestRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * Builds the exact wire request for the non-SDK providers. Anthropic is NOT
 * handled here — that path goes through the installed SDK, so there is no
 * second shaping implementation to drift out of sync with it.
 */
export function buildRestRequest(opts: StreamChatOptions): RestRequest {
  const tools = opts.tools ?? [];
  const maxTokens = opts.maxTokens ?? 1024;

  if (opts.provider === "google") {
    // The key goes in the x-goog-api-key HEADER, not the documented ?key= query
    // parameter: URLs leak into referrers, proxy logs, and browser history, and
    // a credential should never be in one. alt=sse is what turns
    // streamGenerateContent from a JSON array into a real SSE stream.
    return {
      url: `${GOOGLE_BASE_URL}/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: {
        contents: toGoogleContents(opts.messages),
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        ...(tools.length ? { tools: [{ functionDeclarations: toGoogleFunctionDeclarations(tools) }] } : {}),
        generationConfig: { maxOutputTokens: maxTokens },
      },
    };
  }

  if (opts.provider === "openai-compatible") {
    const base = normalizeBaseUrl(opts.baseUrl ?? "");
    if (!base) throw new Error("openai-compatible requires a base URL");
    return {
      url: `${base}/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: {
        model: opts.model,
        messages: toOpenAiMessages(opts.system, opts.messages),
        stream: true,
        max_tokens: maxTokens,
        // An empty tools array is a 400 on several of these gateways, so the
        // field is omitted rather than sent empty.
        ...(tools.length ? { tools: toOpenAiTools(tools) } : {}),
      },
    };
  }

  throw new Error("buildRestRequest does not handle anthropic — that path uses the SDK");
}

// ---- SSE parsing ------------------------------------------------------------

/**
 * Yields the `data:` payload of each SSE event. Chunk boundaries are arbitrary
 * — a single JSON delta routinely arrives split across two network reads — so
 * everything is buffered until a blank-line event terminator is seen.
 */
export async function* sseData(body: ReadableStream<Uint8Array> | null): AsyncGenerator<string, void, void> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const eventsIn = function* (chunk: string) {
    buf += chunk.replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = dataOf(raw);
      if (data !== null) yield data;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* eventsIn(typeof value === "string" ? value : decoder.decode(value, { stream: true }));
    }
    // Some servers close without a trailing blank line.
    const tail = dataOf(buf);
    if (tail !== null) yield tail;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

const dataOf = (raw: string): string | null => {
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue; // comment / keepalive
    if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
  }
  return lines.length ? lines.join("\n") : null;
};

const SSE_DONE = "[DONE]";

// ---- streamChat -------------------------------------------------------------

const errorText = async (res: Response): Promise<string> => {
  let snippet = "";
  try {
    snippet = (await res.text()).slice(0, 300);
  } catch {
    /* body already consumed */
  }
  return `HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * One model turn against any provider, in one shape. Text deltas stream to
 * onDelta as they arrive; tool calls come back for the caller's loop to execute
 * or gate, exactly like brain.ts's streamAgentTurn.
 */
export async function streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
  if (!opts.apiKey) throw new Error("no key");
  switch (opts.provider) {
    case "anthropic":
      return streamAnthropic(opts);
    case "google":
      return streamGoogle(opts);
    case "openai-compatible":
      return streamOpenAiCompatible(opts);
    default: {
      const never: never = opts.provider;
      throw new Error(`unknown provider: ${String(never)}`);
    }
  }
}

async function streamAnthropic(opts: StreamChatOptions): Promise<StreamChatResult> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    // Routed through whatever fetch the caller has — the default is the global
    // one, which is also what a test can stub.
    fetch: opts.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)),
  });
  const tools = opts.tools ?? [];
  const stream = client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages as Anthropic.MessageParam[],
      ...(tools.length ? { tools: tools as Anthropic.Tool[] } : {}),
    },
    opts.signal ? { signal: opts.signal } : undefined
  );
  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      opts.onDelta?.(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  const content: ChatContentBlock[] = [];
  const toolCalls: ChatToolCall[] = [];
  for (const b of final.content) {
    if (b.type === "text") content.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") {
      const call = { id: b.id, name: b.name, input: asRecord(b.input) };
      toolCalls.push(call);
      content.push({ type: "tool_use", ...call });
    }
  }
  return { text, toolCalls, content };
}

async function streamGoogle(opts: StreamChatOptions): Promise<StreamChatResult> {
  const req = buildRestRequest(opts);
  const f = opts.fetchImpl ?? globalThis.fetch;
  const res = await f(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) throw new Error(`google: ${await errorText(res)}`);

  let text = "";
  const toolCalls: ChatToolCall[] = [];
  for await (const data of sseData(res.body)) {
    if (data === SSE_DONE) break;
    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue; // a keepalive or a partial the server flushed early
    }
    const candidates = (chunk.candidates as Array<Record<string, unknown>>) ?? [];
    for (const cand of candidates) {
      const parts = (asRecord(cand.content).parts as GooglePart[]) ?? [];
      for (const p of parts) {
        if (typeof p.text === "string" && p.text) {
          text += p.text;
          opts.onDelta?.(p.text);
        }
        if (p.functionCall) {
          // Google emits no call id; synthesize a stable one so tool_result can
          // be matched back on the next turn.
          toolCalls.push({
            id: `call_${toolCalls.length}_${p.functionCall.name}`,
            name: p.functionCall.name,
            input: asRecord(p.functionCall.args),
          });
        }
      }
    }
  }
  return { text, toolCalls, content: assembleContent(text, toolCalls) };
}

interface OpenAiToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

async function streamOpenAiCompatible(opts: StreamChatOptions): Promise<StreamChatResult> {
  const req = buildRestRequest(opts);
  const f = opts.fetchImpl ?? globalThis.fetch;
  const res = await f(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) throw new Error(`openai-compatible: ${await errorText(res)}`);

  let text = "";
  // tool_calls stream as fragments keyed by index — name and arguments both
  // arrive in pieces, so both are accumulated rather than assigned.
  const acc = new Map<number, { id: string; name: string; args: string }>();
  for await (const data of sseData(res.body)) {
    if (data === SSE_DONE) break;
    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    const choices = (chunk.choices as Array<Record<string, unknown>>) ?? [];
    for (const choice of choices) {
      const delta = asRecord(choice.delta);
      if (typeof delta.content === "string" && delta.content) {
        text += delta.content;
        opts.onDelta?.(delta.content);
      }
      const calls = (delta.tool_calls as OpenAiToolCallDelta[]) ?? [];
      for (const tc of calls) {
        const i = tc.index ?? 0;
        const entry = acc.get(i) ?? { id: "", name: "", args: "" };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
        acc.set(i, entry);
      }
    }
  }
  const toolCalls: ChatToolCall[] = [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, e]) => {
      let input: Record<string, unknown> = {};
      try {
        input = e.args ? asRecord(JSON.parse(e.args)) : {};
      } catch {
        input = {}; // a truncated argument stream is not a reason to throw
      }
      return { id: e.id || `call_${i}_${e.name}`, name: e.name, input };
    })
    .filter((c) => c.name);
  return { text, toolCalls, content: assembleContent(text, toolCalls) };
}

const assembleContent = (text: string, toolCalls: ChatToolCall[]): ChatContentBlock[] => [
  ...(text ? [{ type: "text" as const, text }] : []),
  ...toolCalls.map((c) => ({ type: "tool_use" as const, ...c })),
];

// ---- probe ------------------------------------------------------------------

export type ProbeStatus =
  /** Reached the provider and the key was accepted. */
  | "ok"
  /** Reached the provider and it rejected the key (401/403). */
  | "bad-key"
  /** The request never left the browser's same-origin policy intact. */
  | "cors-blocked"
  /** Nothing reached the host at all: offline, DNS, refused. */
  | "network-error"
  /** Reached and authorized-or-not, but the endpoint answered with an error. */
  | "server-error";

export interface ProbeResult {
  status: ProbeStatus;
  /** Operator-facing, one line. Never contains the key. */
  detail: string;
  httpStatus?: number;
}

export interface ProbeOptions {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /**
   * What to call the far end in the result. Without it a Groq failure reads
   * "OpenAI-compatible rejected the key" — the transport's name, not the
   * company's, which is the vendor the operator is actually looking at.
   */
  label?: string;
}

/** The cheapest authenticated GET each provider offers: list models. */
export function probeUrl(provider: Provider, baseUrl?: string): string {
  switch (provider) {
    case "anthropic":
      return `${ANTHROPIC_BASE_URL}/v1/models?limit=1`;
    case "google":
      return `${GOOGLE_BASE_URL}/v1beta/models?pageSize=1`;
    case "openai-compatible": {
      const base = normalizeBaseUrl(baseUrl ?? "");
      if (!base) throw new Error("openai-compatible requires a base URL");
      return `${base}/models`;
    }
  }
}

export function probeHeaders(provider: Provider, apiKey: string): Record<string, string> {
  switch (provider) {
    case "anthropic":
      return {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // Without this opt-in header the browser call is refused by CORS —
        // Anthropic requires the caller to acknowledge browser-direct use.
        "anthropic-dangerous-direct-browser-access": "true",
      };
    case "google":
      return { "x-goog-api-key": apiKey };
    case "openai-compatible":
      return { Authorization: `Bearer ${apiKey}` };
  }
}

const isTypeError = (e: unknown): boolean =>
  e instanceof TypeError || (e instanceof Error && /failed to fetch|networkerror|load failed/i.test(e.message));

/**
 * Cheap reachability check that reports FOUR different failures as four
 * different things.
 *
 * HOW CORS IS TOLD APART FROM A DEAD NETWORK — this is the whole point of the
 * function. A browser reports a CORS rejection and a genuine transport failure
 * identically: the fetch promise rejects with `TypeError: Failed to fetch`,
 * with no status, no headers, and nothing readable in the response. So a single
 * request CANNOT distinguish them, and reporting a guess is how "your key is
 * bad" gets shown to someone whose key is perfect (api.openai.com sends no
 * CORS headers at all, so every browser-direct call to it fails this way).
 *
 * The distinguisher is a SECOND request in `mode: "no-cors"`, with no custom
 * headers so it stays a "simple request" and skips preflight. A no-cors request
 * is still actually sent; the browser just hands back an opaque response the
 * page cannot read. So:
 *
 *   first fetch rejects + no-cors fetch RESOLVES  → the host is up and answered,
 *                                                   only the CORS headers were
 *                                                   missing → "cors-blocked"
 *   first fetch rejects + no-cors fetch REJECTS   → nothing reached the host at
 *                                                   all → "network-error"
 *
 * The key is never sent on the no-cors probe (it carries no headers) and never
 * appears in any message this function returns.
 */
export async function probeProvider(opts: ProbeOptions): Promise<ProbeResult> {
  const { provider } = opts;
  const label = opts.label ?? PROVIDERS[provider].label;
  if (!opts.apiKey) return { status: "bad-key", detail: "no API key entered" };
  if (PROVIDERS[provider].needsBaseUrl && !normalizeBaseUrl(opts.baseUrl ?? "")) {
    return { status: "network-error", detail: "no base URL set" };
  }
  let url: string;
  try {
    url = probeUrl(provider, opts.baseUrl);
  } catch (e) {
    return { status: "network-error", detail: e instanceof Error ? e.message : "bad endpoint" };
  }
  const f = opts.fetchImpl ?? globalThis.fetch;

  // Offline is knowable without spending a request.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "network-error", detail: "the browser reports it is offline" };
  }

  let res: Response;
  try {
    res = await f(url, {
      method: "GET",
      headers: probeHeaders(provider, opts.apiKey),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if (opts.signal?.aborted) return { status: "network-error", detail: "probe cancelled" };
    if (!isTypeError(err)) {
      return { status: "network-error", detail: err instanceof Error ? err.message : "request failed" };
    }
    try {
      await f(url, { method: "GET", mode: "no-cors" });
      return {
        status: "cors-blocked",
        detail: `${label} is reachable but blocked by the browser (no CORS headers on the response) — this is NOT a key problem, and a browser-only app cannot call it without a proxy.`,
      };
    } catch {
      return {
        status: "network-error",
        detail: `could not reach ${new URL(url).host} at all — offline, DNS, or the host refused the connection.`,
      };
    }
  }

  if (res.ok) {
    // Listing models is not proof that chatting works. api.openai.com sends
    // CORS headers on GET /v1/models and none on POST /v1/chat/completions, so
    // a listing-only probe goes green on the one vendor a browser cannot use —
    // a false green on the exact case this probe exists to catch. Verify the
    // endpoint the app actually calls. The body is deliberately invalid, so a
    // reachable server answers 400 and no tokens are spent; only a TypeError
    // (the browser refusing to hand us the response) changes the verdict.
    if (provider === "openai-compatible") {
      const chatUrl = `${normalizeBaseUrl(opts.baseUrl ?? "")}/chat/completions`;
      try {
        await f(chatUrl, {
          method: "POST",
          headers: { ...probeHeaders(provider, opts.apiKey), "content-type": "application/json" },
          body: JSON.stringify({ model: "", messages: [] }),
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
      } catch (err) {
        if (opts.signal?.aborted) return { status: "network-error", detail: "probe cancelled" };
        if (isTypeError(err)) {
          return {
            status: "cors-blocked",
            detail: `${label} accepted the key on its model list, but the browser is blocked from the chat endpoint it would actually use (no CORS headers there) — this is NOT a key problem, and no key will fix it.`,
          };
        }
      }
    }
    return { status: "ok", detail: `${label} reachable and the key was accepted.`, httpStatus: res.status };
  }
  if (res.status === 401 || res.status === 403) {
    return { status: "bad-key", detail: `${label} rejected the key (HTTP ${res.status}).`, httpStatus: res.status };
  }
  return {
    status: "server-error",
    detail: `${label} is reachable, but the check returned HTTP ${res.status} — the key was neither confirmed nor rejected.`,
    httpStatus: res.status,
  };
}
