import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearRegistryCache, fetchRegistryCount, parseAcceptedCount } from "./registry";

// Every test here stubs fetch — zero real network calls. The sun's brightness
// and caption are data-bound to what this module returns, so what is proven
// here is the map's honesty: a count is only ever a count that was READ.

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const stubFetch = (impl: () => Promise<Response>) => {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
};

const once = (res: Response | (() => Response)) => stubFetch(async () => (typeof res === "function" ? res() : res));

const entry = (status: string) => ({ name: `x/${status}-${Math.random()}`, status });
const registry = (...statuses: string[]) => ({ registry_version: "0.1", entries: statuses.map(entry) });

beforeEach(() => {
  clearRegistryCache();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

// ---- parsing: a count is entries with status accepted, nothing else --------

describe("parseAcceptedCount", () => {
  it("counts only the accepted entries", () => {
    expect(parseAcceptedCount(registry("accepted", "accepted", "pending", "rejected"))).toBe(2);
  });

  it("zero accepted is a real zero — the registry SAYS zero, that is a fact", () => {
    expect(parseAcceptedCount(registry("pending"))).toBe(0);
    expect(parseAcceptedCount({ entries: [] })).toBe(0);
  });

  it("tolerates a bare entries array, in case the file ever flattens", () => {
    expect(parseAcceptedCount([entry("accepted"), entry("challenged")])).toBe(1);
  });

  it("refuses to invent a count from a body without an entries array", () => {
    expect(parseAcceptedCount({})).toBeNull();
    expect(parseAcceptedCount({ entries: "eleven" })).toBeNull();
    expect(parseAcceptedCount("registry")).toBeNull();
    expect(parseAcceptedCount(null)).toBeNull();
    expect(parseAcceptedCount(42)).toBeNull();
  });

  it("skips entries that are not objects rather than crashing on them", () => {
    expect(parseAcceptedCount({ entries: [entry("accepted"), null, "junk", 7] })).toBe(1);
  });
});

// ---- the live path ----------------------------------------------------------

describe("fetchRegistryCount — live", () => {
  it("reports the accepted count as live", async () => {
    once(json(registry("accepted", "accepted", "accepted", "pending")));
    expect(await fetchRegistryCount()).toEqual({ status: "live", accepted: 3 });
  });

  it("spends one request per session, not one per bake", async () => {
    const spy = once(json(registry("accepted")));
    await fetchRegistryCount();
    await fetchRegistryCount();
    await fetchRegistryCount();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("records the count as last-seen, so a later failure can be honest about staleness", async () => {
    once(json(registry("accepted", "accepted")));
    await fetchRegistryCount();
    expect(localStorage.getItem("agent-hub:registry:last-seen")).toBe("2");
  });
});

// ---- the fallback: never a fake count ---------------------------------------

describe("fetchRegistryCount — fallback", () => {
  it("with no successful read EVER, failure is unreachable with a null count — not a defaulted number", async () => {
    once(() => new Response("gone", { status: 404 }));
    expect(await fetchRegistryCount()).toEqual({ status: "unreachable", accepted: null });
  });

  it("after a past success, failure reports the last count actually seen, NAMED cached", async () => {
    localStorage.setItem("agent-hub:registry:last-seen", "11");
    stubFetch(() => Promise.reject(new Error("offline")));
    expect(await fetchRegistryCount()).toEqual({ status: "cached", accepted: 11 });
  });

  it("a malformed body degrades the same way as no answer — a shape it cannot read is not a zero", async () => {
    once(json({ registry_version: "0.1" })); // no entries array
    expect((await fetchRegistryCount()).status).toBe("unreachable");
    clearRegistryCache();
    once(() => new Response("<html>rate limited</html>", { status: 200 }));
    expect((await fetchRegistryCount()).status).toBe("unreachable");
  });

  it("ignores a corrupted last-seen rather than reporting it", async () => {
    localStorage.setItem("agent-hub:registry:last-seen", "eleven-ish");
    once(() => new Response("nope", { status: 500 }));
    expect(await fetchRegistryCount()).toEqual({ status: "unreachable", accepted: null });
  });

  it("caches the failure too, so an offline session does not re-request every bake", async () => {
    const spy = once(() => new Response("nope", { status: 500 }));
    await fetchRegistryCount();
    await fetchRegistryCount();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---- the session cache ------------------------------------------------------

describe("fetchRegistryCount — cache plumbing", () => {
  it("survives a fresh module memory through sessionStorage", async () => {
    const spy = once(json(registry("accepted", "accepted")));
    const first = await fetchRegistryCount();
    // simulate a fresh in-memory state; sessionStorage persists
    const saved = sessionStorage.getItem("agent-hub:registry:count")!;
    clearRegistryCache();
    sessionStorage.setItem("agent-hub:registry:count", saved);
    expect(await fetchRegistryCount()).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches rather than trusting a corrupted cache entry", async () => {
    sessionStorage.setItem("agent-hub:registry:count", "{not json");
    const spy = once(json(registry("accepted")));
    expect((await fetchRegistryCount()).status).toBe("live");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not crash when storage refuses to store (private mode)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const spy = once(json(registry("accepted")));
    expect((await fetchRegistryCount()).status).toBe("live");
    await fetchRegistryCount();
    expect(spy).toHaveBeenCalledTimes(1); // in-memory copy still covers the session
    setItem.mockRestore();
  });
});
