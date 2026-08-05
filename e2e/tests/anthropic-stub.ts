import type { BrowserContext, Route } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// A SCRIPTED ANTHROPIC AT THE NETWORK BOUNDARY.
//
// Why this file exists: every gate test used to stage a pending proposal card by
// writing it straight into persisted state, then click approve. That proves
// approveAction works — it never once exercised the path that CREATES a card.
// A mutation that wrote proposals as `status: "approved"` (and dropped
// approveAction's pending guard) left the whole suite green.
//
// The only honest fix is to drive the REAL producer: sendToChannel →
// streamAgent → runToolLoop → the SDK → the wire. So we stub the wire, and
// nothing above it. The app runs unmodified, with a real @anthropic-ai/sdk
// client, a real MessageStream, a real SSE decode, and a real tool loop; only
// the bytes coming back are ours.
//
// Everything below is the documented Anthropic streaming envelope:
//   message_start → (content_block_start → …delta… → content_block_stop)* →
//   message_delta → message_stop
// The SDK's MessageStream accumulator is strict about this: it throws
// "Unexpected event order" if message_start is missing, and finalMessage()
// throws "request ended without sending any chunks" if message_stop never
// arrives. Getting the shape wrong fails loudly rather than silently, which is
// the property we want from a stub.
// ─────────────────────────────────────────────────────────────────────────────

export const KEY_STORAGE_KEY = "agent-hub:anthropic-key";
/** Not a credential. The stub answers every request, so this never leaves the tab. */
export const FAKE_KEY = "sk-ant-test";

export interface ScriptedTurn {
  /** Streamed as text_delta chunks, in order — this is what lands in the room. */
  text?: string;
  /** A tool_use block emitted after the text, i.e. what makes the agent ACT. */
  tool?: { name: string; input: Record<string, unknown>; id?: string };
}

/** What the app actually sent — the request side is evidence too. */
export interface RecordedRequest {
  model: string;
  system: string;
  /** Anthropic MessageParam[] — user/assistant turns plus tool_result blocks. */
  messages: { role: string; content: unknown }[];
  toolNames: string[];
  /** The generation pin the app sent — evidence for the export's config block. */
  maxTokens: number | null;
  temperature: number | null;
  /** Present iff the app sent an Authorization-equivalent header. */
  apiKey: string | null;
}

/**
 * How a request gets answered. An ARRAY keys the answer to arrival order, which
 * is exactly right for a sequential run and a lottery for a concurrent one: a
 * fan-out of six issues its calls together, so "the fourth request" is not
 * reliably any particular agent, and an index-keyed script quietly hands Forge's
 * answer to Oracle. A FUNCTION keys the answer to WHO ASKED — the recorded
 * request carries the system prompt, so a responder can reply as that agent and
 * the assertions downstream stop depending on a scheduling order nothing
 * guarantees. Returning undefined means "off the end of the script": counted in
 * `overflow`, same as running past an array.
 */
export type Script = ScriptedTurn[] | ((request: RecordedRequest, index: number) => ScriptedTurn | undefined);

export interface AnthropicStub {
  /** One entry per request the app made to api.anthropic.com, in order. */
  readonly requests: RecordedRequest[];
  /** Requests that ran past the end of the script — should always be 0. */
  readonly overflow: number;
  /** Make the NEXT response block until release(). Call before triggering it. */
  hold(): void;
  release(): void;
}

const sseFrame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Split into several deltas so the app's onDelta → paint loop runs more than
 * once, the way it does against the real API. Chunk boundaries are arbitrary on
 * the wire, so chopping mid-word is realistic, not sloppy.
 */
function chunk(text: string, size = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length > 0 ? out : [];
}

/** Build one complete `text/event-stream` body for a single model turn. */
export function sseBody(turn: ScriptedTurn, model = "claude-opus-4-8"): string {
  const parts: string[] = [];
  let index = 0;

  parts.push(
    sseFrame("message_start", {
      type: "message_start",
      message: {
        id: `msg_stub_${Math.random().toString(36).slice(2, 10)}`,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 24, output_tokens: 1 },
      },
    })
  );
  // A ping mid-stream is normal traffic; including one pins that the SDK's
  // "skip unknown/keepalive events" path is on the tested route.
  parts.push(sseFrame("ping", { type: "ping" }));

  if (turn.text) {
    parts.push(
      sseFrame("content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "", citations: null },
      })
    );
    for (const piece of chunk(turn.text)) {
      parts.push(
        sseFrame("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text: piece },
        })
      );
    }
    parts.push(sseFrame("content_block_stop", { type: "content_block_stop", index }));
    index++;
  }

  if (turn.tool) {
    // The real API streams tool input as partial JSON, never as an object on
    // content_block_start — the SDK parses it lazily out of a buffer. Emitting
    // it the real way keeps this stub honest about the SDK code it exercises.
    parts.push(
      sseFrame("content_block_start", {
        type: "content_block_start",
        index,
        content_block: {
          type: "tool_use",
          id: turn.tool.id ?? `toolu_stub_${Math.random().toString(36).slice(2, 10)}`,
          name: turn.tool.name,
          input: {},
        },
      })
    );
    for (const piece of chunk(JSON.stringify(turn.tool.input), 16)) {
      parts.push(
        sseFrame("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "input_json_delta", partial_json: piece },
        })
      );
    }
    parts.push(sseFrame("content_block_stop", { type: "content_block_stop", index }));
    index++;
  }

  parts.push(
    sseFrame("message_delta", {
      type: "message_delta",
      delta: { stop_reason: turn.tool ? "tool_use" : "end_turn", stop_sequence: null },
      usage: { output_tokens: 64 },
    })
  );
  parts.push(sseFrame("message_stop", { type: "message_stop" }));
  return parts.join("");
}

/**
 * Route api.anthropic.com to a scripted stream. `script[n]` answers the n-th
 * request the app makes, so a tool loop is scripted as [turn-with-tool,
 * follow-up-turn] — exactly the two round trips the real loop would make. Pass a
 * function instead when the run is concurrent and arrival order is not a fact
 * worth pinning (see Script).
 *
 * Anything past the end of the script is answered with a loud, visible line and
 * counted in `overflow`, so an unexpected extra model call shows up in an
 * assertion instead of hiding.
 */
export async function stubAnthropic(context: BrowserContext, script: Script): Promise<AnthropicStub> {
  const requests: RecordedRequest[] = [];
  let overflow = 0;
  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  const stub: AnthropicStub = {
    get requests() {
      return requests;
    },
    get overflow() {
      return overflow;
    },
    hold() {
      gate = new Promise<void>((resolve) => (openGate = resolve));
    },
    release() {
      openGate?.();
      gate = null;
      openGate = null;
    },
  };

  await context.route("https://api.anthropic.com/**", async (route: Route) => {
    const request = route.request();

    // The SDK's custom headers (x-api-key, anthropic-version, …) make this a
    // non-simple cross-origin request, so the browser preflights it first. The
    // preflight carries no body and must be answered on its own terms.
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "0",
        },
      });
      return;
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    } catch {
      /* recorded as empty — assertions on shape will catch it */
    }
    const headers = await request.allHeaders();
    requests.push({
      model: String(body.model ?? ""),
      system: String(body.system ?? ""),
      messages: (body.messages as RecordedRequest["messages"]) ?? [],
      toolNames: ((body.tools as { name: string }[]) ?? []).map((t) => t.name),
      maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : null,
      temperature: typeof body.temperature === "number" ? body.temperature : null,
      apiKey: headers["x-api-key"] ?? null,
    });

    const index = requests.length - 1;
    const turn = typeof script === "function" ? script(requests[index], index) : script[index];
    if (!turn) overflow++;

    if (gate) await gate;

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "*",
      },
      body: sseBody(turn ?? { text: "(unscripted model turn — the stub ran out of script)" }, String(body.model ?? "")),
    });
  });

  return stub;
}
