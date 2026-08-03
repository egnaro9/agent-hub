import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PROVIDERS,
  PROVIDER_IDS,
  buildRestRequest,
  clearProviderKey,
  fromGoogleFunctionDeclarations,
  fromOpenAiTools,
  getBaseUrl,
  getProviderKey,
  keyStorageKey,
  probeProvider,
  readyToCall,
  setBaseUrl,
  setProviderKey,
  sseData,
  streamChat,
  toGoogleContents,
  toGoogleFunctionDeclarations,
  toOpenAiMessages,
  toOpenAiTools,
  type ChatMessage,
  type ChatTool,
  type StreamChatOptions,
} from "./providers";
import { AGENT_TOOLS } from "./brain";

// Every test here mocks fetch. ZERO real network calls are made — the point of
// the layer is that its wire shaping is inspectable without spending a token.

const KEY = "sk-secret-do-not-leak";

// ---- helpers ----------------------------------------------------------------

const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
};

const sseResponse = (chunks: string[]): Response =>
  new Response(streamOf(chunks), { status: 200, headers: { "content-type": "text/event-stream" } });

const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init)) as unknown as ReturnType<
    typeof vi.fn
  >;

const asFetch = (m: unknown) => m as unknown as typeof fetch;

/** Headers land as a plain object on our REST paths and a Headers on the SDK's. */
const headerOf = (init: RequestInit | undefined, name: string): string | null =>
  new Headers(init?.headers as HeadersInit).get(name);

const baseOpts = (over: Partial<StreamChatOptions> = {}): StreamChatOptions => ({
  provider: "google",
  model: "gemini-2.5-flash",
  apiKey: KEY,
  system: "house doctrine",
  messages: [{ role: "user", content: "status?" }],
  ...over,
});

const collect = async <T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> => {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
};

// ---- catalog ----------------------------------------------------------------

describe("provider catalog", () => {
  it("describes all three providers with the fields the UI needs", () => {
    expect(PROVIDER_IDS).toEqual(["anthropic", "google", "openai-compatible"]);
    for (const id of PROVIDER_IDS) {
      const p = PROVIDERS[id];
      expect(p.id).toBe(id);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.docs).toMatch(/^https:\/\//);
    }
  });

  it("only openai-compatible needs a base URL, and offers presets not a whitelist", () => {
    expect(PROVIDERS.anthropic.needsBaseUrl).toBe(false);
    expect(PROVIDERS.google.needsBaseUrl).toBe(false);
    expect(PROVIDERS["openai-compatible"].needsBaseUrl).toBe(true);
    expect(PROVIDERS["openai-compatible"].baseUrlPresets).toEqual([
      "https://openrouter.ai/api/v1",
      "https://api.groq.com/openai/v1",
      "https://api.x.ai/v1",
    ]);
    // free text: no default list to constrain the operator
    expect(PROVIDERS["openai-compatible"].modelsFree).toBe(true);
    expect(PROVIDERS["openai-compatible"].models).toEqual([]);
  });

  it("carries the default model lists", () => {
    expect(PROVIDERS.anthropic.models).toEqual(["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"]);
    expect(PROVIDERS.google.models).toEqual(["gemini-2.5-pro", "gemini-2.5-flash"]);
  });
});

// ---- credential storage -----------------------------------------------------

describe("credential storage — one key per provider, never logged", () => {
  beforeEach(() => localStorage.clear());

  it("stores each provider's key under its own distinct localStorage key", () => {
    setProviderKey("google", "g-key");
    setProviderKey("openai-compatible", "o-key");
    expect(localStorage.getItem("agent-hub:key:google")).toBe("g-key");
    expect(localStorage.getItem("agent-hub:key:openai-compatible")).toBe("o-key");
    expect(keyStorageKey("anthropic")).toBe("agent-hub:key:anthropic");
    // switching providers must not read the wrong credential
    expect(getProviderKey("google")).toBe("g-key");
    expect(getProviderKey("anthropic")).toBeNull();
  });

  it("trims pasted whitespace", () => {
    setProviderKey("google", "  g-key\n");
    expect(getProviderKey("google")).toBe("g-key");
  });

  it("falls back to brain.ts's original single-provider key for anthropic", () => {
    localStorage.setItem("agent-hub:anthropic-key", "legacy");
    expect(getProviderKey("anthropic")).toBe("legacy");
    expect(getProviderKey("google")).toBeNull();
  });

  it("clearing anthropic clears the legacy key too, and touches nothing else", () => {
    setProviderKey("anthropic", "a");
    setProviderKey("google", "g");
    clearProviderKey("anthropic");
    expect(getProviderKey("anthropic")).toBeNull();
    expect(localStorage.getItem("agent-hub:anthropic-key")).toBeNull();
    expect(getProviderKey("google")).toBe("g");
  });

  it("stores a normalized base URL, and only for the provider that has one", () => {
    setBaseUrl("openai-compatible", "  https://api.groq.com/openai/v1///  ");
    expect(getBaseUrl("openai-compatible")).toBe("https://api.groq.com/openai/v1");
    setBaseUrl("google", "https://nope.example");
    expect(getBaseUrl("google")).toBeNull();
  });

  it("readyToCall names what is missing instead of failing at request time", () => {
    expect(readyToCall("openai-compatible")).toEqual({ ok: false, reason: "no API key stored for OpenAI-compatible" });
    setProviderKey("openai-compatible", "o");
    expect(readyToCall("openai-compatible")).toEqual({ ok: false, reason: "no base URL set" });
    setBaseUrl("openai-compatible", "https://openrouter.ai/api/v1");
    expect(readyToCall("openai-compatible")).toEqual({ ok: true });
  });

  it("survives a localStorage that throws (private mode) instead of crashing the app", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => setProviderKey("google", "g")).not.toThrow();
    spy.mockRestore();
  });
});

// ---- request shaping: google ------------------------------------------------

describe("request shaping — google", () => {
  it("targets streamGenerateContent with alt=sse", () => {
    const req = buildRestRequest(baseOpts());
    expect(req.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse"
    );
  });

  it("puts the key in the x-goog-api-key HEADER and never in the query string", () => {
    const req = buildRestRequest(baseOpts());
    expect(req.headers["x-goog-api-key"]).toBe(KEY);
    expect(req.url).not.toContain(KEY);
    expect(new URL(req.url).searchParams.get("key")).toBeNull();
    expect(JSON.stringify(req.body)).not.toContain(KEY);
  });

  it("sends the system prompt as systemInstruction, not as a turn", () => {
    const req = buildRestRequest(baseOpts());
    expect(req.body.systemInstruction).toEqual({ parts: [{ text: "house doctrine" }] });
    expect(req.body.contents).toEqual([{ role: "user", parts: [{ text: "status?" }] }]);
  });

  it("omits tools entirely when the tool list is empty", () => {
    expect(buildRestRequest(baseOpts({ tools: [] })).body).not.toHaveProperty("tools");
    expect(buildRestRequest(baseOpts()).body).not.toHaveProperty("tools");
  });

  it("wraps tools as functionDeclarations when present", () => {
    const body = buildRestRequest(baseOpts({ tools: AGENT_TOOLS })).body as {
      tools: { functionDeclarations: { name: string }[] }[];
    };
    expect(body.tools[0].functionDeclarations.map((d) => d.name)).toContain("read_repo_file");
  });
});

// ---- request shaping: openai-compatible -------------------------------------

describe("request shaping — openai-compatible", () => {
  const oai = (over: Partial<StreamChatOptions> = {}) =>
    baseOpts({
      provider: "openai-compatible",
      model: "llama-3.3-70b",
      baseUrl: "https://api.groq.com/openai/v1",
      ...over,
    });

  it("appends /chat/completions to the operator's base URL, trailing slash or not", () => {
    expect(buildRestRequest(oai()).url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(buildRestRequest(oai({ baseUrl: "https://openrouter.ai/api/v1/" })).url).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });

  it("puts the key in an Authorization: Bearer header, never in the URL", () => {
    const req = buildRestRequest(oai());
    expect(req.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(req.url).not.toContain(KEY);
    expect(JSON.stringify(req.body)).not.toContain(KEY);
  });

  it("streams, caps tokens, and leads with the system message", () => {
    const body = buildRestRequest(oai()).body as { stream: boolean; max_tokens: number; messages: unknown[] };
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(1024);
    expect(body.messages[0]).toEqual({ role: "system", content: "house doctrine" });
  });

  it("omits tools when empty (several gateways 400 on tools: [])", () => {
    expect(buildRestRequest(oai({ tools: [] })).body).not.toHaveProperty("tools");
    const withTools = buildRestRequest(oai({ tools: AGENT_TOOLS })).body as { tools: unknown[] };
    expect(withTools.tools).toHaveLength(AGENT_TOOLS.length);
  });

  it("refuses to guess an endpoint when no base URL is set", () => {
    expect(() => buildRestRequest(oai({ baseUrl: "" }))).toThrow(/base URL/i);
  });
});

// ---- request shaping: anthropic (through the installed SDK) ------------------

describe("request shaping — anthropic goes through the SDK, so assert the real wire call", () => {
  const anthropicSse = (extra: string[] = []) => [
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "the suite cannot decide" },
    })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
    ...extra,
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 1 },
    })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  ];

  const run = async (tools?: ChatTool[]) => {
    const f = mockFetch(async () => sseResponse(anthropicSse()));
    const out = await streamChat(
      baseOpts({ provider: "anthropic", model: "claude-opus-4-8", tools, fetchImpl: asFetch(f) })
    );
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    return { out, url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
  };

  it("POSTs api.anthropic.com/v1/messages with the key in the x-api-key header", async () => {
    const { url, init } = await run();
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "x-api-key")).toBe(KEY);
    expect(headerOf(init, "anthropic-version")).toBeTruthy();
    expect(url).not.toContain(KEY);
  });

  it("carries the browser-direct opt-in header the CORS policy requires", async () => {
    const { init } = await run();
    expect(headerOf(init, "anthropic-dangerous-direct-browser-access")).toBe("true");
  });

  it("streams text deltas and omits tools when the list is empty", async () => {
    const { out, body } = await run([]);
    expect(out.text).toBe("the suite cannot decide");
    expect(body).not.toHaveProperty("tools");
    expect(body.stream).toBe(true);
    expect(body.system).toBe("house doctrine");
  });

  it("passes AGENT_TOOLS through untouched — the Anthropic shape IS the canonical shape", async () => {
    const { body } = await run(AGENT_TOOLS);
    expect(body.tools).toEqual(AGENT_TOOLS);
  });

  it("returns tool_use blocks as unified toolCalls", async () => {
    const f = mockFetch(async () =>
      sseResponse([
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: "msg_2",
            type: "message",
            role: "assistant",
            model: "claude-opus-4-8",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        })}\n\n`,
        `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_9", name: "read_repo_file", input: {} },
        })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"path":"README.md"}' },
        })}\n\n`,
        `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
        `event: message_delta\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: "tool_use", stop_sequence: null },
          usage: { output_tokens: 1 },
        })}\n\n`,
        `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
      ])
    );
    const out = await streamChat(
      baseOpts({ provider: "anthropic", model: "claude-opus-4-8", tools: AGENT_TOOLS, fetchImpl: asFetch(f) })
    );
    expect(out.toolCalls).toEqual([{ id: "toolu_9", name: "read_repo_file", input: { path: "README.md" } }]);
    expect(out.content).toContainEqual({
      type: "tool_use",
      id: "toolu_9",
      name: "read_repo_file",
      input: { path: "README.md" },
    });
  });
});

// ---- tool schema conversion, both directions --------------------------------

describe("tool schema conversion — canonical (Anthropic) <-> OpenAI", () => {
  it("nests the schema under function.parameters", () => {
    const [readFile] = toOpenAiTools([AGENT_TOOLS[1] as ChatTool]);
    expect(readFile.type).toBe("function");
    expect(readFile.function.name).toBe("read_repo_file");
    expect(readFile.function.parameters).toEqual({
      type: "object",
      properties: { path: { type: "string", description: "Repo-relative path, e.g. README.md" } },
      required: ["path"],
    });
  });

  it("round-trips every real AGENT_TOOL back to the canonical shape", () => {
    expect(fromOpenAiTools(toOpenAiTools(AGENT_TOOLS as ChatTool[]))).toEqual(AGENT_TOOLS);
  });

  it("keeps a no-arg tool valid in both directions", () => {
    const noArg = AGENT_TOOLS[0] as ChatTool; // read_recent_commits
    const [conv] = toOpenAiTools([noArg]);
    expect(conv.function.parameters).toEqual({ type: "object", properties: {} });
    expect(fromOpenAiTools([conv])[0].input_schema.required).toEqual([]);
  });
});

describe("tool schema conversion — canonical <-> Google functionDeclarations", () => {
  it("declares name, description and a pruned parameters object", () => {
    const [readFile] = toGoogleFunctionDeclarations([AGENT_TOOLS[1] as ChatTool]);
    expect(readFile.name).toBe("read_repo_file");
    expect(readFile.parameters).toEqual({
      type: "object",
      properties: { path: { type: "string", description: "Repo-relative path, e.g. README.md" } },
      required: ["path"],
    });
  });

  it("OMITS parameters for a no-arg tool — Google rejects an empty properties object", () => {
    const [commits] = toGoogleFunctionDeclarations([AGENT_TOOLS[0] as ChatTool]);
    expect(commits).not.toHaveProperty("parameters");
    expect(commits.name).toBe("read_recent_commits");
  });

  it("strips JSON Schema keys Google's dialect rejects", () => {
    const tool: ChatTool = {
      name: "t",
      input_schema: {
        type: "object",
        properties: { a: { type: "string", additionalProperties: false, $comment: "x" } },
        required: ["a"],
        $schema: "https://json-schema.org/draft/2020-12/schema",
      },
    };
    const [decl] = toGoogleFunctionDeclarations([tool]);
    const params = JSON.stringify(decl.parameters);
    expect(params).not.toContain("additionalProperties");
    expect(params).not.toContain("$schema");
    expect(params).toContain('"type":"string"');
  });

  it("round-trips every real AGENT_TOOL back to the canonical shape", () => {
    expect(fromGoogleFunctionDeclarations(toGoogleFunctionDeclarations(AGENT_TOOLS as ChatTool[]))).toEqual(
      AGENT_TOOLS
    );
  });
});

// ---- message / tool-block conversion ----------------------------------------

const TOOL_TRANSCRIPT: ChatMessage[] = [
  { role: "user", content: "read the readme" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "on it" },
      { type: "tool_use", id: "toolu_1", name: "read_repo_file", input: { path: "README.md" } },
    ],
  },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "<untrusted-file>…" }] },
];

describe("tool_use / tool_result conversion — OpenAI dialect", () => {
  it("turns tool_use into tool_calls with JSON-string arguments", () => {
    const msgs = toOpenAiMessages("sys", TOOL_TRANSCRIPT);
    const assistant = msgs.find((m) => m.role === "assistant")!;
    expect(assistant.content).toBe("on it");
    expect(assistant.tool_calls).toEqual([
      { id: "toolu_1", type: "function", function: { name: "read_repo_file", arguments: '{"path":"README.md"}' } },
    ]);
  });

  it("turns tool_result into its own tool-role message keyed by tool_call_id", () => {
    const msgs = toOpenAiMessages("sys", TOOL_TRANSCRIPT);
    const toolMsg = msgs.find((m) => m.role === "tool")!;
    expect(toolMsg).toEqual({ role: "tool", tool_call_id: "toolu_1", content: "<untrusted-file>…" });
    // and it must come after the assistant turn that called it
    expect(msgs.indexOf(toolMsg)).toBeGreaterThan(msgs.findIndex((m) => m.role === "assistant"));
  });
});

describe("tool_use / tool_result conversion — Google dialect", () => {
  it("maps assistant to model and tool_use to functionCall", () => {
    const contents = toGoogleContents(TOOL_TRANSCRIPT);
    expect(contents[1].role).toBe("model");
    expect(contents[1].parts).toEqual([
      { text: "on it" },
      { functionCall: { name: "read_repo_file", args: { path: "README.md" } } },
    ]);
  });

  it("answers with functionResponse keyed by NAME, resolved from the earlier call id", () => {
    const contents = toGoogleContents(TOOL_TRANSCRIPT);
    expect(contents[2]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "read_repo_file", response: { result: "<untrusted-file>…" } } }],
    });
  });
});

// ---- SSE parsing ------------------------------------------------------------

describe("SSE parsing", () => {
  it("reassembles an event split across two network chunks", async () => {
    const events = await collect(sseData(streamOf(['data: {"a"', ':1}\n\n'])));
    expect(events).toEqual(['{"a":1}']);
  });

  it("handles a boundary that itself lands mid-terminator", async () => {
    const events = await collect(sseData(streamOf(["data: one\n", "\ndata: two\n\n"])));
    expect(events).toEqual(["one", "two"]);
  });

  it("passes [DONE] through as an event so the reader can terminate", async () => {
    const events = await collect(sseData(streamOf(["data: {}\n\n", "data: [DONE]\n\n"])));
    expect(events).toEqual(["{}", "[DONE]"]);
  });

  it("ignores comment keepalives and event: lines", async () => {
    const events = await collect(sseData(streamOf([": ping\n\n", "event: delta\ndata: x\n\n"])));
    expect(events).toEqual(["x"]);
  });

  it("joins multi-line data payloads and tolerates CRLF", async () => {
    const events = await collect(sseData(streamOf(["data: a\r\ndata: b\r\n\r\n"])));
    expect(events).toEqual(["a\nb"]);
  });

  it("yields a final event even when the server omits the trailing blank line", async () => {
    expect(await collect(sseData(streamOf(["data: last"])))).toEqual(["last"]);
  });

  it("returns nothing for a null body instead of throwing", async () => {
    expect(await collect(sseData(null))).toEqual([]);
  });
});

// ---- streaming end-to-end (mocked transport) --------------------------------

describe("streamChat — openai-compatible", () => {
  const oaiChunk = (delta: Record<string, unknown>) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`;

  it("accumulates text across split chunks and stops at [DONE]", async () => {
    const raw = oaiChunk({ content: "deterministic " }) + oaiChunk({ content: "checks" });
    const f = mockFetch(async () =>
      sseResponse([
        raw.slice(0, 30), // split mid-JSON, mid-event
        raw.slice(30),
        "data: [DONE]\n\n",
        oaiChunk({ content: "AFTER-DONE" }), // must never be read
      ])
    );
    const deltas: string[] = [];
    const out = await streamChat(
      baseOpts({
        provider: "openai-compatible",
        model: "llama-3.3-70b",
        baseUrl: "https://api.groq.com/openai/v1",
        onDelta: (t) => deltas.push(t),
        fetchImpl: asFetch(f),
      })
    );
    expect(out.text).toBe("deterministic checks");
    expect(out.text).not.toContain("AFTER-DONE");
    expect(deltas).toEqual(["deterministic ", "checks"]);
  });

  it("reassembles tool_calls streamed as fragments keyed by index", async () => {
    const f = mockFetch(async () =>
      sseResponse([
        oaiChunk({ tool_calls: [{ index: 0, id: "call_a", function: { name: "read_repo_file", arguments: '{"pa' } }] }),
        oaiChunk({ tool_calls: [{ index: 0, function: { arguments: 'th":"README.md"}' } }] }),
        "data: [DONE]\n\n",
      ])
    );
    const out = await streamChat(
      baseOpts({
        provider: "openai-compatible",
        model: "llama-3.3-70b",
        baseUrl: "https://openrouter.ai/api/v1",
        tools: AGENT_TOOLS,
        fetchImpl: asFetch(f),
      })
    );
    expect(out.toolCalls).toEqual([{ id: "call_a", name: "read_repo_file", input: { path: "README.md" } }]);
  });

  it("throws with the HTTP status and never echoes the key on a rejected call", async () => {
    const f = mockFetch(async () => new Response('{"error":"invalid_api_key"}', { status: 401 }));
    const err = await streamChat(
      baseOpts({
        provider: "openai-compatible",
        model: "x",
        baseUrl: "https://api.x.ai/v1",
        fetchImpl: asFetch(f),
      })
    ).catch((e: Error) => e);
    expect(String(err)).toContain("401");
    expect(String(err)).not.toContain(KEY);
  });
});

describe("streamChat — google", () => {
  it("streams text parts and synthesizes an id for the id-less functionCall", async () => {
    const f = mockFetch(async () =>
      sseResponse([
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "numbers " }] } }] })}\n\n`,
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "or it's a hunch" }] } }] })}\n\n`,
        `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ functionCall: { name: "read_recent_commits", args: {} } }] } }],
        })}\n\n`,
      ])
    );
    const deltas: string[] = [];
    const out = await streamChat(
      baseOpts({ tools: AGENT_TOOLS, onDelta: (t) => deltas.push(t), fetchImpl: asFetch(f) })
    );
    expect(out.text).toBe("numbers or it's a hunch");
    expect(deltas).toHaveLength(2);
    expect(out.toolCalls).toEqual([{ id: "call_0_read_recent_commits", name: "read_recent_commits", input: {} }]);
    // the assistant turn is ready to append before sending tool results back
    expect(out.content[0]).toEqual({ type: "text", text: "numbers or it's a hunch" });
  });

  it("POSTs the shaped request to the SSE endpoint", async () => {
    const f = mockFetch(async () => sseResponse([]));
    await streamChat(baseOpts({ fetchImpl: asFetch(f) }));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(":streamGenerateContent?alt=sse");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "x-goog-api-key")).toBe(KEY);
  });
});

// ---- probe ------------------------------------------------------------------

describe("probeProvider — four failures reported as four different things", () => {
  const probe = (impl: (url: string, init?: RequestInit) => Promise<Response>, over = {}) => {
    const f = mockFetch(impl);
    return {
      f,
      run: () =>
        probeProvider({ provider: "anthropic", apiKey: KEY, fetchImpl: asFetch(f), ...over }),
    };
  };

  it("reachable + authorized → ok", async () => {
    const { run } = probe(async () => new Response('{"data":[]}', { status: 200 }));
    const r = await run();
    expect(r.status).toBe("ok");
    expect(r.httpStatus).toBe(200);
  });

  it("reachable + rejected key → bad-key, not a network story", async () => {
    const { run } = probe(async () => new Response("{}", { status: 401 }));
    const r = await run();
    expect(r.status).toBe("bad-key");
    expect(r.detail).toMatch(/rejected the key/i);
  });

  it("CORS-blocked → cors-blocked, and says explicitly it is NOT a key problem", async () => {
    // Exactly the api.openai.com case: the browser rejects with a bare
    // TypeError, but the no-cors retry proves the host answered.
    let call = 0;
    const { f, run } = probe(
      async (_url, init) => {
        call++;
        // A real opaque response has status 0, which the Response constructor
        // refuses to build; what matters to the probe is only that it RESOLVES.
        if (init?.mode === "no-cors") return new Response(null, { status: 204 });
        throw new TypeError("Failed to fetch");
      },
      { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1" }
    );
    const r = await run();
    expect(r.status).toBe("cors-blocked");
    expect(r.detail).toMatch(/blocked by the browser/i);
    expect(r.detail).toMatch(/NOT a key problem/i);
    expect(call).toBe(2);
    // the no-cors probe must be header-free, so the key is never sent on it
    const retry = f.mock.calls[1] as [string, RequestInit];
    expect(retry[1].mode).toBe("no-cors");
    expect(retry[1].headers).toBeUndefined();
  });

  it("dead network → network-error (both attempts fail)", async () => {
    const { run } = probe(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await run();
    expect(r.status).toBe("network-error");
    expect(r.detail).toMatch(/could not reach/i);
  });

  it("reachable but broken → server-error, never guessed as a bad key", async () => {
    const { run } = probe(async () => new Response("upstream boom", { status: 502 }));
    const r = await run();
    expect(r.status).toBe("server-error");
    expect(r.detail).toMatch(/neither confirmed nor rejected/i);
  });

  it("sends the key in a header and never in the probe URL", async () => {
    const { f, run } = probe(async () => new Response("{}", { status: 200 }));
    await run();
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
  });

  it("uses each provider's own cheap list-models endpoint", async () => {
    for (const [over, expected] of [
      [{ provider: "google" as const }, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1"],
      [
        { provider: "openai-compatible" as const, baseUrl: "https://api.groq.com/openai/v1/" },
        "https://api.groq.com/openai/v1/models",
      ],
    ] as const) {
      const { f, run } = probe(async () => new Response("{}", { status: 200 }), over);
      await run();
      expect(String((f.mock.calls[0] as [string])[0])).toBe(expected);
    }
  });

  it("never spends a request when there is nothing to probe with", async () => {
    const { f, run } = probe(async () => new Response("{}", { status: 200 }), { apiKey: "" });
    expect((await run()).status).toBe("bad-key");
    const missingBase = probe(async () => new Response("{}", { status: 200 }), {
      provider: "openai-compatible",
      baseUrl: "",
    });
    expect((await missingBase.run()).status).toBe("network-error");
    expect(f.mock.calls).toHaveLength(0);
    expect(missingBase.f.mock.calls).toHaveLength(0);
  });

  it("short-circuits to network-error when the browser reports it is offline", async () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      const { f, run } = probe(async () => new Response("{}", { status: 200 }));
      const r = await run();
      expect(r.status).toBe("network-error");
      expect(r.detail).toMatch(/offline/i);
      expect(f.mock.calls).toHaveLength(0);
    } finally {
      if (original) Object.defineProperty(Navigator.prototype, "onLine", original);
      delete (navigator as unknown as Record<string, unknown>).onLine;
    }
  });
});
