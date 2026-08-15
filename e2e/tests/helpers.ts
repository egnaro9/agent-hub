import { expect, type BrowserContext, type Page } from "@playwright/test";
import { FAKE_KEY, KEY_STORAGE_KEY } from "./anthropic-stub";

// The one localStorage key zustand's persist middleware owns.
export const HUB_KEY = "agent-hub:state";

export interface IsolateOptions {
  /**
   * Seed a fake BYOK key so the store boots with brainConnected === true and
   * sendToChannel takes the LIVE path (streamAgent → runToolLoop → the SDK),
   * and leave api.anthropic.com routable so a stub can answer it.
   *
   * Only pass this together with stubAnthropic(). Nothing here holds a real
   * key, so an unstubbed request would 401 rather than spend anything — but it
   * would also be a real request, and this suite makes none. Every live-path
   * spec asserts on stub.requests, so a missing stub fails the test instead of
   * quietly reaching the network.
   */
  liveBrain?: boolean;
}

/**
 * TEST ISOLATION — the thing most likely to make this suite lie.
 *
 * The hub persists rooms, assignments, operator-created projects and node
 * positions to localStorage. Two competing requirements:
 *
 *   1. Every test must start from virgin state (otherwise a project minted in
 *      the gate spec shows up in the persistence spec's sidebar).
 *   2. A test must be able to reload() mid-test and still see what the app
 *      persisted a moment ago — that IS the persistence invariant.
 *
 * A plain `addInitScript(() => localStorage.clear())` satisfies (1) and breaks
 * (2): init scripts re-run on EVERY navigation, so the reload would wipe the
 * state the test is about to assert on.
 *
 * The fix is a sessionStorage sentinel. sessionStorage survives a reload in the
 * same tab but is empty in a fresh BrowserContext — and Playwright hands every
 * test its own context. So the wipe fires exactly once per test, before the
 * app's first script runs, and every later navigation in that test is a no-op.
 *
 * `seed` (optional) is written into the hub's persist key inside the same
 * guarded block, which is how specs stage state the offline app can't reach on
 * its own (e.g. a pending gated proposal card, which normally only a live
 * Anthropic key can produce).
 */
export async function isolate(context: BrowserContext, seed?: unknown, opts: IsolateOptions = {}) {
  await context.addInitScript(
    ([key, seedJson, keyKey, brainKey]: [string, string, string, string]) => {
      if (!sessionStorage.getItem("__e2e_isolated__")) {
        localStorage.clear();
        if (seedJson) localStorage.setItem(key, seedJson);
        // Written inside the same guarded block as the wipe, so the reload in a
        // persistence assertion doesn't re-seed over what the app just wrote.
        if (brainKey) localStorage.setItem(keyKey, brainKey);
        sessionStorage.setItem("__e2e_isolated__", "1");
      }
    },
    [HUB_KEY, seed ? JSON.stringify(seed) : "", KEY_STORAGE_KEY, opts.liveBrain ? FAKE_KEY : ""] as [
      string,
      string,
      string,
      string,
    ]
  );

  // Hermetic: GitHub commit hydration and the BYOK brain are the only two
  // network calls the app makes. Both are optional by design; aborting them
  // means a rate limit or an offline runner can never colour a result.
  //
  // With liveBrain the Anthropic host stays routable — but only so that
  // stubAnthropic() can answer it with a scripted stream. GitHub is aborted
  // either way.
  await context.route(
    opts.liveBrain ? /api\.github\.com/ : /api\.github\.com|api\.anthropic\.com/,
    (route) => route.abort()
  );
}

/** zustand-persist envelope. `state` must match hub.ts's partialize(). */
export function persistedState(state: Record<string, unknown>) {
  return {
    state: {
      channels: {},
      assignments: { critic: "crashkit", forge: "tapdodge-engine" },
      mapLocked: false,
      extraProjects: [],
      positions: {},
      ...state,
    },
    version: 1,
  };
}

/**
 * Navigate and wait for the shell to actually exist before any spec assertion
 * runs. The first navigation of a run pays for Vite's cold module graph plus
 * React StrictMode's double mount; folding that cost into a generous, explicit
 * wait keeps the per-assertion timeouts meaningful (a real regression still
 * fails — the element never appears — it just fails after the shell is up).
 */
export async function gotoHub(page: Page, hash = "/") {
  await page.goto(hash);
  await expect(page.locator("aside")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "constellation" })).toBeVisible({ timeout: 20_000 });
}

/** Inline transform React Flow writes on its viewport, e.g. "translate(…) scale(…)". */
/** The galaxy publishes its camera zoom on the host element each frame. */
export function galaxyZoom(page: Page) {
  return page.getByTestId("galaxy").getAttribute("data-zoom");
}

/**
 * React Flow measures nodes and re-runs fitView a beat after mount. Wait for
 * the transform to stop changing rather than sleeping a fixed amount.
 */
export async function settleFlow(page: Page) {
  // The galaxy's camera eases toward its target; settled = zoom stops moving.
  await expect(page.getByTestId("galaxy")).toBeVisible();
  let previous = "unset";
  await expect
    .poll(
      async () => {
        const now = (await galaxyZoom(page)) ?? "";
        const stable = now.length > 0 && now === previous;
        previous = now;
        return stable;
      },
      { timeout: 10_000, intervals: [200, 200, 200, 300] }
    )
    .toBe(true);
}

/** Real trackpad-style wheel over the canvas — d3-zoom ignores synthetic dispatch. */
/**
 * Stops the galaxy's idle drift via its own ◐ control. Click-heavy specs need
 * it: a label in continuous cinematic motion only passes Playwright's
 * stability gate during the drift ellipse's velocity lulls — pass-by-luck.
 */
export async function stillGalaxy(page: Page) {
  await page.getByRole("button", { name: "Toggle idle drift" }).click();
  await expect(page.getByTestId("galaxy")).toHaveAttribute("data-zoom-settled", "true", { timeout: 10_000 });
}

export async function wheelOverPane(page: Page, deltaY = -500) {
  const box = await page.getByTestId("galaxy").boundingBox();
  if (!box) throw new Error("galaxy has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  // The camera eases toward its target over a few hundred ms. A fixed settle
  // beats a web-first assertion here for the same reason as ever: the locked
  // case expects NOTHING to change.
  await page.waitForTimeout(600);
}

/** The work-mode composer. Its placeholder names the room, so it doubles as a mode assertion. */
export function composer(page: Page, projectName: string) {
  return page.getByPlaceholder(new RegExp(`^Message #${projectName}\\b`));
}

export async function say(page: Page, projectName: string, text: string) {
  const input = composer(page, projectName);
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

/**
 * Sidebar project rows are buttons whose accessible name STARTS with the
 * project id — a project with crew appends the crew glyphs to the name
 * ("crashkit C"), so an exact match silently misses exactly the rows that
 * matter. Anchored + boundary so "persist-probe" never matches
 * "persist-probe-2".
 */
export function sidebarProject(page: Page, id: string) {
  return page.locator("aside").getByRole("button", { name: new RegExp(`^${id}(\\s|$)`) });
}
