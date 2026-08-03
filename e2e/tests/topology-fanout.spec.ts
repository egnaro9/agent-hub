import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { FAKE_KEY, stubAnthropic } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// DOES THE FAN-OUT ACTUALLY FAN OUT?
//
// The room already had a "@team" poll, and it is SEQUENTIAL by construction:
// each agent answers with the previous answers in its context. A fan-out that
// silently ran the same way would look identical on screen — same avatars, same
// three replies, same merge at the end — and cost the same. The only difference
// that matters is invisible in the transcript: whether the three worker calls
// were in flight AT THE SAME TIME, and whether any worker could see another's
// answer.
//
// So this spec asserts on the wire, not the UI. The stub holds every response
// open; a held response means a request that has been SENT and not COMPLETED.
// Getting to three recorded-but-unanswered worker requests is only possible if
// the runner issued them concurrently — a sequential loop would deadlock at one.
//
// The hold/release dance is race-free on purpose: `release(); hold();` are two
// synchronous statements, and Playwright's route handler is an async callback,
// so no request can be answered between them.
// ─────────────────────────────────────────────────────────────────────────────

const ROOM = ["strat", "forge", "critic", "oracle"];
const TASK = "cut the release: what has to be true before we tag it?";

/** Four agents present, nothing queued — no canned roundtable talking over the run. */
const quadRoom = () =>
  persistedState({ channels: { crashkit: { participants: ROOM, queue: [], messages: [] } } });

// One entry per model call the run should make: decompose, three workers,
// synthesize. Worker answers are tagged so a later request can be searched for
// them; nothing else in the script contains the tag.
const MANAGER_SPLIT = "Splitting it: one of you takes the diff, one the claim, one the metric.";
const W1 = "ANSWER-ALPHA: the diff is two files and a migration.";
const W2 = "ANSWER-BETA: the README claim about parity is unbacked.";
const W3 = "ANSWER-GAMMA: the noise floor is three points, so a two-point win is nothing.";
const MERGED = "Merged: land the two files, cut the parity claim, hold the three-point floor.";

const SCRIPT = [{ text: MANAGER_SPLIT }, { text: W1 }, { text: W2 }, { text: W3 }, { text: MERGED }];

/** The caret the room paints on a message that is still being written. */
const carets = (page: import("@playwright/test").Page) => page.locator('[role="log"] span.breathe');

test.describe("the topology runner", () => {
  test("a fan-out sends its workers concurrently, then synthesizes over all of them", async ({
    context,
    page,
  }) => {
    await isolate(context, quadRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, SCRIPT);

    await gotoHub(page, "/#/p/crashkit/work");

    // The price is on screen BEFORE anything is spent: 1 decompose + 3 workers
    // + 1 synthesize, and not one request made yet. It reads "5+", not "5" —
    // nodes keep their tools, so a worker that reads the repo takes another
    // turn. The floor is what can be promised; the run reports what it spent.
    await page.getByRole("button", { name: "fan-out" }).click();
    await expect(page.getByText("5+ model calls")).toBeVisible();
    expect(stub.requests).toHaveLength(0);

    // Hold the manager's turn open so the run is observable phase by phase.
    stub.hold();
    await page.getByLabel("Topology task").fill(TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect.poll(() => stub.requests.length).toBe(1);
    // Launch is refused while a run is in flight — one shape at a time.
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeDisabled();
    await expect(page.getByText(/phase 1\/3 · decompose/)).toBeVisible();

    // The manager was told to split and NOT to answer, and carries the task.
    expect(stub.requests[0].system).toContain("You are the MANAGER of this run");
    expect(stub.requests[0].system).toContain(TASK);
    expect(stub.requests[0].apiKey).toBe(FAKE_KEY);

    // Let the manager's turn complete and hold whatever comes next. Synchronous
    // pair: no route handler can run between these two statements.
    stub.release();
    stub.hold();

    // ── THE ASSERTION ────────────────────────────────────────────────────────
    // Three more requests are on the wire while every one of them is still
    // unanswered. Sequential execution cannot reach this state: worker 2 would
    // never be sent, because worker 1's response has not arrived.
    await expect.poll(() => stub.requests.length).toBe(4);
    await expect(page.getByText(/phase 2\/3 · fan-out · 3 workers/)).toBeVisible();

    // Three agents mid-turn at once, on screen — and nothing has landed.
    await expect(carets(page)).toHaveCount(3);
    for (const answer of [W1, W2, W3]) await expect(page.getByText(answer)).toHaveCount(0);

    // The workers are three DIFFERENT agents, each told it is a worker, and
    // none of them can see another's answer — that independence is the only
    // reason a fan-out is worth its extra calls.
    const workers = stub.requests.slice(1, 4);
    const speakers = workers.map((r) => r.system.match(/You are (\w+) —/)?.[1] ?? "?");
    expect(new Set(speakers).size).toBe(3);
    for (const r of workers) {
      expect(r.system).toContain("You are a WORKER on this run");
      expect(r.system).not.toContain("You are the MANAGER of this run"); // no manager brief leaks in
      expect(JSON.stringify(r.messages)).toContain(MANAGER_SPLIT); // the split IS shared
      expect(JSON.stringify(r.messages)).not.toContain("ANSWER-"); // sibling answers are not
    }

    // And the synthesize phase waits: it must not be issued while the workers
    // are still out.
    await page.waitForTimeout(400);
    expect(stub.requests).toHaveLength(4);

    // ── the merge sees all three ─────────────────────────────────────────────
    stub.release();
    await expect.poll(() => stub.requests.length).toBe(5);
    const synth = stub.requests[4];
    expect(synth.system).toContain("You are the MANAGER");
    expect(synth.system).toContain("Merge the workers' answers");
    const seen = JSON.stringify(synth.messages);
    for (const answer of [W1, W2, W3]) expect(seen).toContain(answer);

    // Settled: the merged result is in the room, the run is over, the strip is
    // launchable again — and the run cost exactly what the strip quoted.
    await expect(page.getByText(MERGED)).toBeVisible();
    await expect(carets(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();
    expect(stub.requests).toHaveLength(5);
    expect(stub.overflow).toBe(0);
  });

  test("without a key the shape stays dark — it says so and spends nothing", async ({ context, page }) => {
    // No liveBrain: the store has no key, so the offline persona path is what a
    // careless implementation would fall back to. A topology must not: canned
    // lines dressed as a fan-out would be a lie about what just ran.
    await isolate(context, quadRoom());
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: "fan-out" }).click();
    await expect(page.getByText("5+ model calls")).toBeVisible();
    await page.getByLabel("Topology task").fill(TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect(page.getByText(/a topology needs a live brain/)).toBeVisible();
    await expect(page.getByText(/phase \d+\/\d+/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();
  });
});
