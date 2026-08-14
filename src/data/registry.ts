// The registry seam: one public JSON file, read-only, no auth. The sun's
// brightness and caption are DATA-BOUND to this count, so the count must be
// honest end to end — a failed fetch never invents a number, it reports the
// last one actually seen and says so, or admits it has nothing.

const REGISTRY_URL = "https://raw.githubusercontent.com/egnaro9/vac-protocol/main/registry.json";

const CACHE_KEY = "agent-hub:registry:count";
const LAST_SEEN_KEY = "agent-hub:registry:last-seen";

// A failed read is retried eventually, but not per-bake while offline. Five
// minutes, not github.ts's hour: there is no hourly budget to protect here —
// raw.githubusercontent is unmetered — only the courtesy of not hammering.
const NEGATIVE_TTL_MS = 5 * 60 * 1000;

/**
 * `live` is a count read this session. `cached` is the honest fallback — the
 * registry did not answer, and `accepted` is the last count a successful read
 * ever recorded (localStorage, so it survives sessions). `unreachable` with
 * accepted null means no read has EVER succeeded on this browser: the sun
 * dims and the caption says so, because a defaulted number would be a fake.
 */
export interface RegistryCount {
  status: "live" | "cached" | "unreachable";
  accepted: number | null;
}

/**
 * The registry's shape is `{ entries: [{ status, … }] }`; a bare array is
 * tolerated in case the file ever flattens. Anything else — including an
 * object with no entries array — is null: a parse failure, never a zero.
 * Zero means "the registry says zero accepted claims", and this function
 * refuses to say that about a body it could not read.
 */
export function parseAcceptedCount(body: unknown): number | null {
  const entries = Array.isArray(body)
    ? body
    : typeof body === "object" && body !== null && Array.isArray((body as { entries?: unknown }).entries)
      ? ((body as { entries: unknown[] }).entries)
      : null;
  if (!entries) return null;
  return entries.filter(
    (e) => typeof e === "object" && e !== null && (e as { status?: unknown }).status === "accepted"
  ).length;
}

// In-memory first, sessionStorage behind it — the same two-layer cache as
// github.ts, for the same reason: a browser that refuses storage must still
// not cost a second request this session.
let memo: (RegistryCount & { at?: number }) | null = null;

const isNegative = (r: RegistryCount) => r.status !== "live";
const fresh = (r: RegistryCount & { at?: number }) =>
  !isNegative(r) || (typeof r.at === "number" && Date.now() - r.at < NEGATIVE_TTL_MS);
const strip = ({ status, accepted }: RegistryCount): RegistryCount => ({ status, accepted });

const readCache = (): RegistryCount | null => {
  if (memo) {
    if (fresh(memo)) return strip(memo);
    memo = null;
    return null;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistryCount & { at?: number };
    if (!parsed || typeof parsed.status !== "string") return null;
    if (typeof parsed.accepted !== "number" && parsed.accepted !== null) return null;
    if (!fresh(parsed)) return null;
    memo = parsed;
    return strip(parsed);
  } catch {
    return null;
  }
};

const writeCache = (value: RegistryCount) => {
  const stamped = isNegative(value) ? { ...value, at: Date.now() } : value;
  memo = stamped;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(stamped));
  } catch {
    /* storage unavailable — the in-memory copy still covers this session */
  }
};

const readLastSeen = (): number | null => {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
};

const writeLastSeen = (n: number) => {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(n));
  } catch {
    /* the live answer still stands; only the cross-session fallback is lost */
  }
};

/** Tests use it; a future explicit "refresh" control would too. */
export function clearRegistryCache(): void {
  memo = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to clear if storage was never readable */
  }
}

/**
 * The accepted-claim count, once per session. Every miss — offline, non-200,
 * malformed JSON, wrong shape — degrades the same way: last seen if a read
 * ever succeeded here, an admitted nothing otherwise.
 */
export async function fetchRegistryCount(): Promise<RegistryCount> {
  const cached = readCache();
  if (cached) return cached;

  const miss = (): RegistryCount => {
    const lastSeen = readLastSeen();
    const out: RegistryCount =
      lastSeen !== null ? { status: "cached", accepted: lastSeen } : { status: "unreachable", accepted: null };
    writeCache(out);
    return out;
  };

  try {
    const res = await fetch(REGISTRY_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return miss();
    const n = parseAcceptedCount(await res.json());
    if (n === null) return miss();
    writeLastSeen(n);
    const out: RegistryCount = { status: "live", accepted: n };
    writeCache(out);
    return out;
  } catch {
    return miss();
  }
}
