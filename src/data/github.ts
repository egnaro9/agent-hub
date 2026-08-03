// The first real seam: read-only, unauthenticated GitHub — public data only.
// Called lazily per project when its stage opens; any failure (offline, rate
// limit, renamed repo) silently leaves the curated mock feed in place.

const OWNER = "egnaro9";

const rel = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
};

export async function fetchRecentCommits(repo: string): Promise<string[]> {
  // Cached like the other two. It was the only uncached call left, and the
  // tasks card now FALLS BACK to it, so without this a tab reload re-spends one
  // request per project browsed — 18 projects reloaded twice is 90 against a
  // 60/hour budget, and the panels go dark for an hour.
  const key = `commits:${repo}`;
  const cached = readCache<string>(key);
  if (cached) return cached.items;
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/commits?per_page=3`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    writeCache(key, { status: "failed", items: [], more: 0 });
    return [];
  }
  const data: { commit: { message: string; author?: { date?: string } } }[] = await res.json();
  const items = data
    .map((c) => {
      const title = c.commit.message.split("\n")[0];
      const when = c.commit.author?.date ? rel(c.commit.author.date) : "";
      return when ? `${title} · ${when}` : title;
    })
    .slice(0, 3);
  writeCache(key, { status: items.length ? "ok" : "empty", items, more: 0 });
  return items;
}

// ---- the WORK panel's two feeds ---------------------------------------------
//
// Unauthenticated api.github.com allows 60 requests per hour PER IP, shared by
// everything this app does — the commit feed above is already spending from it.
// Two more calls on every project would empty the budget in one browsing
// session and leave every card blank for an hour. So: fetch only for the
// project actually opened, and park every answer — including the failures — in
// sessionStorage. A rate-limited session that re-requested on each visit would
// spend its way deeper into the hole and never climb out.

const CACHE_PREFIX = "agent-hub:gh:";

// A 300px card holds roughly this many rows before it becomes a scroll bar.
// What the cap hides is counted, never silently dropped.
const TREE_CAP = 8;
const ISSUE_CAP = 6;

export type FeedStatus = "ok" | "empty" | "failed" | "rate-limited";

/**
 * `status` exists because a bare [] cannot tell the panel apart from the repo
 * genuinely having nothing to show, and those two need different words on
 * screen — "no open issues" is a fact, "couldn't reach GitHub" is an apology.
 * `rate-limited` is broken out because it is the failure an operator actually
 * hits, and the honest sentence for it names the browser's hourly budget.
 * `more` is what the cap withheld, so a card can say "+7 more" rather than
 * imply the repo is smaller than it is.
 */
export interface RepoFeed<T> {
  status: FeedStatus;
  items: T[];
  more: number;
}

export interface TreeEntry {
  name: string;
  kind: "file" | "dir";
  /** Bytes for files; null for directories, which the API does not size. */
  size: number | null;
}

export interface IssueEntry {
  title: string;
  number: number;
  /** Same relative phrasing as the commit feed, so the card reads as one voice. */
  age: string;
}

const feed = <T>(status: FeedStatus, items: T[] = [], more = 0): RepoFeed<T> => ({ status, items, more });

// In-memory first, sessionStorage behind it: a browser that refuses storage
// (private mode, quota) must still not cost a second request in this session.
const memo = new Map<string, RepoFeed<unknown>>();

// A negative answer is cached — otherwise a rate-limited session re-requests on
// every visit and digs deeper — but not FOREVER, because the card tells the
// operator the limit "comes back within the hour". A sticky negative would make
// that sentence false: the hour passes, the budget refills, and the cache keeps
// answering "rate-limited". So negatives carry a stamp and expire; a successful
// answer stays for the session, since a repo root does not move underneath you.
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const isNegative = (f: RepoFeed<unknown>) => f.status === "rate-limited" || f.status === "failed";

const fresh = (f: RepoFeed<unknown> & { at?: number }) =>
  !isNegative(f) || (typeof f.at === "number" && Date.now() - f.at < NEGATIVE_TTL_MS);

const readCache = <T>(key: string): RepoFeed<T> | null => {
  const hit = memo.get(key) as (RepoFeed<T> & { at?: number }) | undefined;
  if (hit) {
    if (fresh(hit)) return hit;
    memo.delete(key);
    return null;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RepoFeed<T> & { at?: number };
    // A half-written or hand-edited entry is not worth trusting; re-fetching is
    // cheaper than rendering nonsense.
    if (!parsed || typeof parsed.status !== "string" || !Array.isArray(parsed.items)) return null;
    if (!fresh(parsed)) return null;
    memo.set(key, parsed as RepoFeed<unknown>);
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (key: string, value: RepoFeed<unknown>) => {
  const stamped = isNegative(value) ? { ...value, at: Date.now() } : value;
  memo.set(key, stamped);
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(stamped));
  } catch {
    /* storage unavailable — the in-memory copy still covers this session */
  }
};

/**
 * The session cache is deliberately sticky, so this is the only way back to the
 * network: tests use it, and a future explicit "refresh" control would too.
 */
export function clearRepoCache(): void {
  memo.clear();
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k);
  } catch {
    /* nothing to clear if storage was never readable */
  }
}

type Fetched = { ok: true; body: unknown } | { ok: false; status: "failed" | "rate-limited" };

/**
 * One place that knows what a spent budget looks like, so both feeds report it
 * with the same word. Never throws: callers get a shape, always.
 */
async function getJson(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) {
      // GitHub answers a spent unauthenticated budget with 403 (429 on the
      // newer path) and the remaining count pinned at 0. That is emphatically
      // not an empty repo, and the card must not imply it is.
      const remaining = res.headers.get("x-ratelimit-remaining");
      const spent = (res.status === 403 || res.status === 429) && remaining === "0";
      return { ok: false, status: spent ? "rate-limited" : "failed" };
    }
    return { ok: true, body: await res.json() };
  } catch {
    // Offline, DNS, CORS, malformed JSON — all the same to the panel: no answer.
    return { ok: false, status: "failed" };
  }
}

/** Directories first, then files, alphabetical within each group. */
const byTreeOrder = (a: TreeEntry, b: TreeEntry) =>
  a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1;

/**
 * Top-level entries only. One request, no pagination on this endpoint, so the
 * overflow count is exact.
 */
export async function fetchRepoTree(repo: string): Promise<RepoFeed<TreeEntry>> {
  const key = `tree:${repo}`;
  const cached = readCache<TreeEntry>(key);
  if (cached) return cached;

  const got = await getJson(`https://api.github.com/repos/${OWNER}/${repo}/contents/`);
  let out: RepoFeed<TreeEntry>;

  if (!got.ok) {
    out = feed<TreeEntry>(got.status);
  } else if (!Array.isArray(got.body)) {
    // The contents endpoint answers with an object when the path is a file.
    // Not a tree — say we failed rather than draw an empty directory.
    out = feed<TreeEntry>("failed");
  } else {
    const raw = got.body as { name?: unknown; type?: unknown; size?: unknown }[];
    const rows: TreeEntry[] = raw
      .filter((e) => e && typeof e.name === "string")
      .map((e) => ({
        name: e.name as string,
        // Anything not a directory (file, symlink, submodule) draws as a file.
        kind: e.type === "dir" ? "dir" : "file",
        size: e.type === "dir" || typeof e.size !== "number" ? null : e.size,
      }));
    rows.sort(byTreeOrder);
    out =
      rows.length === 0
        ? feed<TreeEntry>("empty")
        : feed("ok", rows.slice(0, TREE_CAP), Math.max(0, rows.length - TREE_CAP));
  }

  writeCache(key, out);
  return out;
}

/**
 * Open issues, pull requests removed. per_page is maxed because it costs the
 * same single request either way and keeps the "+N more" count honest.
 */
export async function fetchOpenIssues(repo: string): Promise<RepoFeed<IssueEntry>> {
  const key = `issues:${repo}`;
  const cached = readCache<IssueEntry>(key);
  if (cached) return cached;

  const got = await getJson(`https://api.github.com/repos/${OWNER}/${repo}/issues?state=open&per_page=100`);
  let out: RepoFeed<IssueEntry>;

  if (!got.ok) {
    out = feed<IssueEntry>(got.status);
  } else if (!Array.isArray(got.body)) {
    out = feed<IssueEntry>("failed");
  } else {
    const raw = got.body as { title?: unknown; number?: unknown; created_at?: unknown; pull_request?: unknown }[];
    const rows: IssueEntry[] = raw
      // The REST issues list returns pull requests too — an entry carrying a
      // pull_request key IS a PR, and calling a PR a task is a lie the panel
      // would tell on every repo with an open branch.
      // `in` throws on a primitive, and a proxy or an error body can put one in
      // the array — which escaped this function entirely and left the card
      // stuck on "reading github…" forever.
      .filter(
        (e) =>
          typeof e === "object" && e !== null && !("pull_request" in e) && typeof e.title === "string" && typeof e.number === "number"
      )
      .map((e) => ({
        title: e.title as string,
        number: e.number as number,
        age: typeof e.created_at === "string" ? rel(e.created_at) : "",
      }));
    out =
      rows.length === 0
        ? feed<IssueEntry>("empty")
        : feed("ok", rows.slice(0, ISSUE_CAP), Math.max(0, rows.length - ISSUE_CAP));
  }

  writeCache(key, out);
  return out;
}
