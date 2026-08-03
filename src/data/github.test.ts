import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearRepoCache, fetchOpenIssues, fetchRepoTree, type RepoFeed } from "./github";

// Every test here stubs fetch. ZERO real network calls are made — the whole
// point of this layer is that its rate-limit and cache behaviour is provable
// without spending one of the 60 requests an hour it has to live inside.

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

/** What GitHub sends when the unauthenticated hourly budget is gone. */
const rateLimited = () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } });

const stubFetch = (impl: (url: string) => Promise<Response>) => {
  const spy = vi.fn((input: RequestInfo | URL) => impl(String(input)));
  vi.stubGlobal("fetch", spy);
  return spy;
};

const once = (res: Response | (() => Response)) => stubFetch(async () => (typeof res === "function" ? res() : res));

const dir = (name: string) => ({ name, type: "dir" });
const file = (name: string, size = 100) => ({ name, type: "file", size });

const issue = (number: number, title: string, extra: Record<string, unknown> = {}) => ({
  number,
  title,
  created_at: new Date().toISOString(),
  ...extra,
});

const names = <T extends { name: string }>(f: RepoFeed<T>) => f.items.map((i) => i.name);

beforeEach(() => {
  clearRepoCache();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

// ---- pull requests are not tasks --------------------------------------------

describe("fetchOpenIssues — PR filter", () => {
  it("drops entries carrying a pull_request key, so a PR is never shown as a task", async () => {
    once(
      json([
        issue(15, "Drift: 2 model(s) regressed — Grok 4 Fast -2.9 pts"),
        issue(14, "Bump vite to 5.4.9", { pull_request: { url: "https://api.github.com/…/pulls/14" } }),
        issue(13, "Drift: 1 model(s) regressed"),
      ]),
    );
    const out = await fetchOpenIssues("model-drift");
    expect(out.status).toBe("ok");
    expect(out.items.map((i) => i.number)).toEqual([15, 13]);
    expect(out.items.some((i) => i.title.startsWith("Bump vite"))).toBe(false);
  });

  it("reports 'empty' when every open entry was a PR — nothing to show is not a failure", async () => {
    once(json([issue(9, "a PR", { pull_request: {} }), issue(8, "another PR", { pull_request: {} })]));
    const out = await fetchOpenIssues("crashkit");
    expect(out.status).toBe("empty");
    expect(out.items).toEqual([]);
  });

  it("reports 'empty' for the 12 repos that genuinely have no open issues", async () => {
    once(json([]));
    expect((await fetchOpenIssues("gradecore")).status).toBe("empty");
  });

  it("carries title, number and age through", async () => {
    const created = new Date(Date.now() - 3 * 86_400_000).toISOString();
    once(json([{ number: 42, title: "Emit suite size into metrics.json", created_at: created }]));
    const [row] = (await fetchOpenIssues("model-drift")).items;
    expect(row).toEqual({ number: 42, title: "Emit suite size into metrics.json", age: "3d ago" });
  });
});

// ---- the failure an operator actually hits ----------------------------------

describe("rate limit is reported distinctly, never as an empty repo", () => {
  it("maps 403 + x-ratelimit-remaining:0 to 'rate-limited' on both feeds", async () => {
    once(rateLimited);
    expect((await fetchRepoTree("crashkit")).status).toBe("rate-limited");
    expect((await fetchOpenIssues("crashkit")).status).toBe("rate-limited");
  });

  it("a 403 that is NOT the budget (remaining still on the clock) is a plain failure", async () => {
    once(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "42" } }));
    expect((await fetchRepoTree("crashkit")).status).toBe("failed");
  });

  it("caches the rate-limited answer, or a spent session re-requests forever", async () => {
    const spy = once(rateLimited);
    expect((await fetchOpenIssues("crashkit")).status).toBe("rate-limited");
    expect((await fetchOpenIssues("crashkit")).status).toBe("rate-limited");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---- failed is not empty -----------------------------------------------------

describe("failure returns the failed-not-empty shape", () => {
  it("returns 'failed' on 404 (renamed or private repo) rather than throwing", async () => {
    once(() => new Response("Not Found", { status: 404 }));
    const out = await fetchRepoTree("renamed-away");
    expect(out).toEqual({ status: "failed", items: [], more: 0 });
  });

  it("returns 'failed' when the network rejects outright — no throw reaches the UI", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    await expect(fetchOpenIssues("mcp-tools")).resolves.toEqual({ status: "failed", items: [], more: 0 });
  });

  it("returns 'failed' when the body is not the array we expected", async () => {
    once(json({ name: "README.md", type: "file" }));
    expect((await fetchRepoTree("agent-graph")).status).toBe("failed");
  });

  it("keeps 'failed' distinguishable from 'empty' — the panel says different words", async () => {
    once(json([]));
    const empty = await fetchRepoTree("brand-new");
    once(() => new Response("nope", { status: 500 }));
    clearRepoCache();
    const broken = await fetchRepoTree("brand-new");
    expect(empty.status).toBe("empty");
    expect(broken.status).toBe("failed");
    expect(empty.items).toEqual(broken.items); // identical arrays, different meaning
  });
});

// ---- sort, cap, overflow -----------------------------------------------------

describe("fetchRepoTree — sort, cap and the overflow count", () => {
  it("puts directories first, then files, alphabetical within each group", async () => {
    once(json([file("README.md"), dir("src"), file("index.html"), dir("e2e"), dir("public")]));
    // Alphabetical the way a reader means it, not the way ASCII means it:
    // localeCompare keeps index.html ahead of README.md, matching how GitHub
    // itself lists a repo root. A raw < would file every capital first.
    expect(names(await fetchRepoTree("agent-hub"))).toEqual(["e2e", "public", "src", "index.html", "README.md"]);
  });

  it("caps the card at 8 rows and reports what it withheld, so the UI can say '+N more'", async () => {
    const many = Array.from({ length: 15 }, (_, i) => file(`f${String(i).padStart(2, "0")}.ts`));
    const out = await (once(json(many)), fetchRepoTree("big-repo"));
    expect(out.status).toBe("ok");
    expect(out.items).toHaveLength(8);
    expect(out.more).toBe(7);
    expect(names(out)[0]).toBe("f00.ts"); // the cap keeps the sort, it does not reshuffle
  });

  it("leaves more at 0 when nothing was withheld", async () => {
    once(json([dir("src"), file("LICENSE")]));
    const out = await fetchRepoTree("small");
    expect(out.more).toBe(0);
    expect(out.items).toHaveLength(2);
  });

  it("sizes files and leaves directories unsized", async () => {
    once(json([dir("src"), file("LICENSE", 1066)]));
    expect((await fetchRepoTree("agent-hub")).items).toEqual([
      { name: "src", kind: "dir", size: null },
      { name: "LICENSE", kind: "file", size: 1066 },
    ]);
  });

  it("caps issues at 6 and counts the rest AFTER the PR filter", async () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => issue(100 - i, `Drift: run ${i}`)),
      ...Array.from({ length: 4 }, (_, i) => issue(50 - i, `PR ${i}`, { pull_request: {} })),
    ];
    once(json(rows));
    const out = await fetchOpenIssues("model-drift");
    expect(out.items).toHaveLength(6);
    expect(out.more).toBe(9); // 15 real issues − 6 shown; the 4 PRs are not "more"
  });
});

// ---- the session cache -------------------------------------------------------

describe("session cache — one request per repo per feed", () => {
  it("does not spend a second request when a project is re-entered", async () => {
    const spy = once(json([dir("src")]));
    await fetchRepoTree("crashkit");
    await fetchRepoTree("crashkit");
    await fetchRepoTree("crashkit");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keys per repo and per feed, so one project's answer never stands in for another's", async () => {
    const spy = stubFetch(async (url) => (url.includes("/issues") ? json([]) : json([dir("src")])));
    await fetchRepoTree("crashkit");
    await fetchOpenIssues("crashkit");
    await fetchRepoTree("gradecore");
    await fetchRepoTree("crashkit"); // cached
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("survives a page reload through sessionStorage, not just the in-memory map", async () => {
    const spy = once(json([dir("src"), file("README.md")]));
    const first = await fetchRepoTree("pi-gates");
    memoryOnlyReset(); // simulate a fresh module instance; sessionStorage persists
    const second = await fetchRepoTree("pi-gates");
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("agent-hub:gh:tree:pi-gates")).toContain("README.md");
  });

  it("re-fetches rather than rendering a corrupted cache entry", async () => {
    sessionStorage.setItem("agent-hub:gh:tree:crashkit", "{not json");
    const spy = once(json([dir("src")]));
    expect((await fetchRepoTree("crashkit")).status).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not crash when sessionStorage refuses to store (private mode)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const spy = once(json([dir("src")]));
    expect((await fetchRepoTree("eval-history")).status).toBe("ok");
    await fetchRepoTree("eval-history");
    expect(spy).toHaveBeenCalledTimes(1); // in-memory copy still covers the session
    setItem.mockRestore();
  });
});

/**
 * The module's in-memory map is private, and clearRepoCache() drops
 * sessionStorage too — so to prove the persisted half works on its own we snap
 * the storage contents, clear both, and put the storage back.
 */
function memoryOnlyReset() {
  const saved = Object.entries({ ...sessionStorage });
  clearRepoCache();
  for (const [k, v] of saved) sessionStorage.setItem(k, String(v));
}
