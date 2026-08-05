import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { FAKE_KEY, stubAnthropic, type RecordedRequest } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// A SHAPE THE OPERATOR DREW, RUN FOR REAL.
//
// The four presets were always safe: they are written in code, so nothing about
// them can be wrong at runtime that isn't wrong at compile time. A composed
// shape is the opposite — its stages come out of localStorage, its agents come
// out of a room that can change under it, and it can name the same stage twice.
// Every claim the app makes about a preset has to survive that.
//
// The claims worth a spec each:
//
//   1. ORDER + ROUNDS — the stages run in the order they were drawn, and the
//      SECOND fan-out is told it is round 2 and shown round 1. If round-2
//      workers get the round-1 brief, the operator paid twice for one round.
//   2. CONCURRENCY — a fan-out stage of a composed shape fans out. A serialized
//      one is invisible in the transcript and costs the same, so this is
//      asserted at the wire: N requests SENT and none of them answered is a
//      state a sequential loop cannot reach.
//   3. THE PRICE CHIP IS A FLOOR, AND THE RUN CONFESSES — the chip reads "N+",
//      because nodes keep their tools and a node that reads the repo answers the
//      result in a second call. So the number on the button is a minimum, and
//      the honest number is the one the run REPORTS when it finishes. Both are
//      asserted, including a run that goes over.
//   4. THE WINDOW REALLY WIDENS — a round-2 worker is told round 1 is above, and
//      a run long enough to push round 1 out of the default 20-message window is
//      the only run that can prove it.
//   5. REFUSAL IS FREE — a shape naming an agent the room no longer holds is
//      refused, says which agent, and spends nothing.
//
// The hold/release dance is race-free for the reason topology-fanout.spec gives:
// `release(); hold();` are two synchronous statements and the route handler is
// an async callback, so no request can be answered between them.
// ─────────────────────────────────────────────────────────────────────────────

const ROOM = ["strat", "forge", "critic", "oracle"];
const PROJECT = "crashkit";
const SHAPE = "two-round-review";
const TASK = "the parity claim in the README — is it backed, and what lands first?";

/** Four agents present, nothing queued — no canned roundtable talking over the run. */
const quadRoom = () =>
  persistedState({ channels: { [PROJECT]: { participants: ROOM, queue: [], messages: [] } } });

// One entry per model call the shape should make, in plan order:
// mgr → 2 workers → judge → 2 workers (round 2) → judge. Each answer is tagged
// so a later request can be searched for it; nothing else contains the tags.
const SPLIT = "SPLIT-1: Forge takes the diff, Critic takes the claim.";
const W1A = "ROUND1-ALPHA: the diff is two files and a migration.";
const W1B = "ROUND1-BETA: the parity sentence has no run behind it.";
const VERDICT1 = "VERDICT-1: beta is stronger, but alpha never named the migration.";
const W2A = "ROUND2-GAMMA: the migration is 0003_add_floor.sql.";
const W2B = "ROUND2-DELTA: cut the parity sentence rather than soften it.";
const VERDICT2 = "VERDICT-2: land gamma, cut the sentence, ship.";

const SCRIPT = [
  { text: SPLIT },
  { text: W1A },
  { text: W1B },
  { text: VERDICT1 },
  { text: W2A },
  { text: W2B },
  { text: VERDICT2 },
];

/**
 * The strip's live phase line, matched WHOLE. Substring matching is a trap
 * here: it cannot tell "judge · judge" from "judge · judger2", so a node-id
 * regression walks straight through a phase assertion that looks strict.
 * (Measured — a mutant survived this exact assertion until it became exact.)
 */
const phaseLine = (page: Page, label: string) => page.getByText(label, { exact: true });

/** The caret the room paints on a message still being written. */
const carets = (page: Page) => page.locator('[role="log"] span.breathe');

/** The composer's own quote, while the shape is still being drawn. */
const composerPrice = (page: Page) => page.getByTestId("composer-calls");

/**
 * The launcher's quote. Scoped to the launch button's own row rather than
 * matched globally — while the composer is open there are two price chips on
 * screen, and a spec that grabs the wrong one proves nothing. The trailing "+"
 * is part of the pattern on purpose: a chip that has quietly gone back to
 * promising an exact number matches nothing and fails here.
 */
const barPrice = (page: Page) =>
  page
    .getByRole("button", { name: "Launch topology" })
    .locator("..")
    .getByText(/^(\d+\+ model calls?|nothing to run)$/);

const priceOf = async (chip: ReturnType<typeof barPrice>) =>
  Number(/(\d+)/.exec((await chip.textContent()) ?? "")?.[1] ?? NaN);

/** Which agent a recorded request belongs to — the persona line names them. */
const speakerOf = (system: string) => /You are (\w+) —/.exec(system)?.[1] ?? "?";

/**
 * The line the run posts when it is over. This is the honest half of the price:
 * the chip is a floor read off the plan, this is the measured spend. Written out
 * here so every assertion on it is the app's exact sentence, not a fuzzy match
 * that would survive the number being wrong.
 */
const spentInside = (quoted: number, spent: number) =>
  `shape done · quoted ${quoted}+ · spent ${spent} model calls — inside the quote.`;
const spentOver = (quoted: number, spent: number) =>
  `shape done · quoted ${quoted}+ · spent ${spent} model calls — ${spent - quoted} OVER the quote.`;

/**
 * Draw the shape the operator approved, through the composer, with no
 * shortcuts through localStorage:
 *
 *   (1) SINGLE  manager → Strat
 *   (2) FAN-OUT workers → Forge, Critic
 *   (3) SINGLE  judge   → Oracle
 *   (4) FAN-OUT workers → Forge, Critic     ← round 2
 *   (5) SINGLE  judge   → Oracle            ← round 2
 *
 * Seven model calls at the floor. Multi-round on purpose: a shape whose stages
 * are all distinct would never exercise the round counter, the round-2 brief, or
 * the node-id suffixing that keeps the two rounds apart in the transcript.
 *
 * The structural assertions live here rather than in one test, because every
 * assertion downstream is meaningless if the drawn shape isn't this one.
 */
async function composeMultiRound(page: Page) {
  await page.getByRole("button", { name: "+ new shape" }).click();
  await expect(page.getByTestId("shape-composer")).toBeVisible();
  await page.getByLabel("Shape name").fill(SHAPE);

  // (1) is the stage a new shape opens on: SINGLE manager → the first agent in
  // the room. Assert rather than assume — the defaults are part of the feature.
  await expect(page.getByLabel("Stage 1 kind")).toHaveValue("solo");
  await expect(page.getByLabel("Stage 1 role")).toHaveValue("manager");
  await expect(page.getByLabel("Stage 1 agent 1")).toHaveValue("strat");

  // (2) proposed as a fan-out of everyone the manager isn't — trim it to two.
  await page.getByLabel("Add stage", { exact: true }).click();
  await expect(page.getByLabel("Stage 2 kind")).toHaveValue("fanout");
  await page.getByLabel("Remove agent 3 from stage 2").click();
  await expect(page.getByLabel("Stage 2 agent 1")).toHaveValue("forge");
  await expect(page.getByLabel("Stage 2 agent 2")).toHaveValue("critic");

  // (3) a judge over the round.
  await page.getByLabel("Add stage", { exact: true }).click();
  await expect(page.getByLabel("Stage 3 kind")).toHaveValue("solo");
  await expect(page.getByLabel("Stage 3 role")).toHaveValue("judge");
  await expect(page.getByLabel("Stage 3 agent 1")).toHaveValue("oracle");

  // (4) the same two workers again — this is the round the feature exists for.
  await page.getByLabel("Add stage", { exact: true }).click();
  await page.getByLabel("Stage 4 kind").selectOption("fanout");
  await page.getByLabel("Stage 4 role").selectOption("worker");
  await page.getByLabel("Stage 4 agent 1").selectOption("forge");
  await page.getByLabel("Stage 4 agent 2").selectOption("critic");

  // (5) the same judge again.
  await page.getByLabel("Add stage", { exact: true }).click();
  await expect(page.getByLabel("Stage 5 role")).toHaveValue("judge");
  await expect(page.getByLabel("Stage 5 agent 1")).toHaveValue("oracle");

  // ROUND 2 IS VISIBLE BEFORE IT IS PAID FOR. The badge is read off plan(), so
  // it disappearing means the engine stopped counting rounds — which is exactly
  // the state in which round-2 workers silently get a first-draft brief.
  await expect(page.getByTestId("stage-1")).not.toContainText("round 2");
  await expect(page.getByTestId("stage-3")).toContainText("round 2");
  await expect(page.getByTestId("stage-4")).toContainText("round 2");

  // Per-stage cost, also read off the plan: 1 + 2 + 1 + 2 + 1.
  for (const [i, n] of [1, 2, 1, 2, 1].entries()) {
    await expect(page.getByTestId(`stage-${i}`)).toContainText(`${n}×`);
  }

  await expect(page.getByTestId("shape-problems")).toHaveCount(0);
  await expect(composerPrice(page)).toHaveText("7+ model calls");

  await page.getByRole("button", { name: "Save shape" }).click();
  await expect(page.getByTestId("shape-composer")).toHaveCount(0);
  // Saving selects it: the chip is pressed and the launcher is now holding it.
  await expect(page.getByRole("button", { name: SHAPE })).toHaveAttribute("aria-pressed", "true");
}

test.describe("a composed harness shape", () => {
  test("runs its stages in the order they were drawn, and round 2 is told it is round 2", async ({
    context,
    page,
  }) => {
    await isolate(context, quadRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, SCRIPT);

    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await composeMultiRound(page);

    // ── THE FLOOR IS ON SCREEN ───────────────────────────────────────────────
    // Read the number the operator can actually see, before a single call. It
    // must be 7 (the shape really has seven nodes) and it must be shown as a
    // floor — barPrice only matches a chip carrying the "+".
    const quoted = await priceOf(barPrice(page));
    expect(quoted, "the launcher quoted a different shape than the composer priced").toBe(7);
    expect(stub.requests, "a shape spent something before it was launched").toHaveLength(0);

    await page.getByLabel("Topology task").fill(TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect(page.getByText(VERDICT2)).toBeVisible({ timeout: 30_000 });
    await expect(carets(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();

    // ── ORDER, AT THE WIRE ───────────────────────────────────────────────────
    expect(stub.requests).toHaveLength(7);
    expect(stub.overflow).toBe(0);
    const [mgr, w1a, w1b, judge1, w2a, w2b, judge2] = stub.requests;

    expect(mgr.system).toContain("You are the MANAGER of this run");
    expect(mgr.system).toContain(TASK);
    expect(mgr.apiKey).toBe(FAKE_KEY);
    expect(speakerOf(mgr.system)).toBe("Strat");

    // Round 1: two workers, told they are workers and NOT told about a round.
    for (const r of [w1a, w1b]) {
      expect(r.system).toContain("You are a WORKER on this run.");
      expect(r.system, "round 1 was told it was a later round").not.toContain("in ROUND");
      expect(JSON.stringify(r.messages)).toContain(SPLIT);
    }
    expect(new Set([w1a, w1b].map((r) => speakerOf(r.system)))).toEqual(new Set(["Forge", "Critic"]));

    expect(judge1.system).toContain("You are the JUDGE");
    expect(speakerOf(judge1.system)).toBe("Oracle");
    // The judge read the round it is judging.
    for (const answer of [W1A, W1B]) expect(JSON.stringify(judge1.messages)).toContain(answer);

    // ── ROUND 2 IS A SECOND ROUND, NOT A SECOND FIRST DRAFT ──────────────────
    // The whole justification for paying for stages 4 and 5. If this brief
    // regresses to the round-1 text, the run buys two more opening answers and
    // the judge merges duplicates — same cost, none of the value.
    for (const r of [w2a, w2b]) {
      expect(r.system).toContain("You are a WORKER on this run, in ROUND 2.");
      expect(r.system).toContain("build on that result");
      expect(r.system).toContain("Do not start over as if the task were fresh");
      // And the thing it is told to build on is actually in its context.
      const seen = JSON.stringify(r.messages);
      for (const earlier of [W1A, W1B, VERDICT1]) {
        expect(seen, "round 2 was told round 1 was above, and it was not").toContain(earlier);
      }
    }
    expect(new Set([w2a, w2b].map((r) => speakerOf(r.system)))).toEqual(new Set(["Forge", "Critic"]));

    // The round-2 JUDGE is told the same thing, for the reason the round-2
    // worker is: judging a revision as a first draft throws away the one thing
    // the second round was bought for.
    expect(judge2.system).toContain("You are the JUDGE, in ROUND 2.");
    expect(judge2.system).toContain("what you are reading now is a REVISED round");
    for (const answer of [W2A, W2B]) expect(JSON.stringify(judge2.messages)).toContain(answer);

    // ── ORDER, IN THE ROOM ───────────────────────────────────────────────────
    // The transcript is what the operator reads back afterwards; a run whose
    // wire order is right and whose transcript is interleaved is still wrong.
    const log = await page.getByRole("log").innerText();
    const at = (s: string) => log.indexOf(s);
    expect(at(TASK)).toBeGreaterThanOrEqual(0);
    for (const [before, after] of [
      [TASK, SPLIT],
      [SPLIT, W1A],
      [W1A, VERDICT1],
      [W1B, VERDICT1],
      [VERDICT1, W2A],
      [W2A, VERDICT2],
      [W2B, VERDICT2],
    ]) {
      expect(at(after), `"${after}" should follow "${before}" in the room`).toBeGreaterThan(at(before));
    }

    // ── AND IT SAYS WHAT IT SPENT ────────────────────────────────────────────
    // Nothing in this script calls a tool, so every node really was one call and
    // the floor really was the whole bill. The run still has to SAY so — the
    // measured number is the honest one, and a run that only ever prints the
    // planned number is back to quoting a promise it cannot keep.
    expect(stub.requests.length, "the floor was not a floor — the shape spent less than quoted").toBe(quoted);
    await expect(page.getByText(spentInside(quoted, 7))).toBeVisible();
    await expect(barPrice(page)).toHaveText(`${quoted}+ model calls`);
  });

  test("every fan-out stage of it runs concurrently, in both rounds", async ({ context, page }) => {
    await isolate(context, quadRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, SCRIPT);

    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await composeMultiRound(page);

    // Hold the manager's turn so the run is observable stage by stage.
    stub.hold();
    await page.getByLabel("Topology task").fill(TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect.poll(() => stub.requests.length).toBe(1);
    await expect(phaseLine(page, "phase 1/5 · decompose · mgr")).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeDisabled();

    stub.release();
    stub.hold();

    // ── ROUND 1 FANS OUT ─────────────────────────────────────────────────────
    // Two requests SENT while neither has been answered. A sequential stage
    // deadlocks at one: worker 2 is never issued, because worker 1's response
    // has not arrived, and this poll times out.
    await expect.poll(() => stub.requests.length).toBe(3);
    await expect(phaseLine(page, "phase 2/5 · fan-out · 2 workers")).toBeVisible();
    await expect(carets(page)).toHaveCount(2);
    for (const answer of [W1A, W1B]) await expect(page.getByText(answer)).toHaveCount(0);

    // Independent: neither worker can see the other's answer, which is the only
    // reason a fan-out is worth more than one call.
    for (const r of stub.requests.slice(1, 3)) {
      expect(r.system).toContain("You are a WORKER on this run.");
      expect(JSON.stringify(r.messages)).not.toContain("ROUND1-");
    }

    // The judge waits for the whole stage — it must not be issued while the
    // workers are still out, or it judges a round that hasn't finished.
    await page.waitForTimeout(400);
    expect(stub.requests, "a later stage started before the fan-out finished").toHaveLength(3);

    stub.release();
    stub.hold();

    await expect.poll(() => stub.requests.length).toBe(4);
    await expect(phaseLine(page, "phase 3/5 · judge · judge")).toBeVisible();
    await expect(carets(page)).toHaveCount(1);

    stub.release();
    stub.hold();

    // ── ROUND 2 FANS OUT TOO ─────────────────────────────────────────────────
    // A second fan-out is a different code path in one way that matters: its
    // nodes carry a round. Whatever the round changes, it must not quietly
    // change these two calls into a sequence.
    await expect.poll(() => stub.requests.length).toBe(6);
    await expect(phaseLine(page, "phase 4/5 · fan-out · 2 workers")).toBeVisible();
    await expect(carets(page)).toHaveCount(2);
    for (const r of stub.requests.slice(4, 6)) {
      expect(r.system).toContain("in ROUND 2");
      expect(JSON.stringify(r.messages)).toContain(VERDICT1);
      expect(JSON.stringify(r.messages), "round 2 saw a sibling's round-2 answer").not.toContain("ROUND2-");
    }

    stub.release();
    stub.hold();

    // ── AND THE SECOND JUDGE IS STILL "JUDGE" ────────────────────────────────
    // A solo stage keeps one id across rounds. "judge2" would read as a second
    // judge who does not exist, and it churns ids that saved transcripts already
    // carry — so the round lives on the node, not in its name. Asserted at the
    // phase label because that is where an operator would read it.
    await expect.poll(() => stub.requests.length).toBe(7);
    await expect(phaseLine(page, "phase 5/5 · judge · judge")).toBeVisible();

    stub.release();

    await expect(page.getByText(VERDICT2)).toBeVisible();
    await expect(carets(page)).toHaveCount(0);
    expect(stub.overflow).toBe(0);
  });

  test("refuses to launch when the room lost an agent the shape names — and spends nothing", async ({
    context,
    page,
  }) => {
    await isolate(context, quadRoom(), { liveBrain: true });
    // Scripted anyway: if the refusal leaks a single call, it is recorded here
    // rather than answered by an unstubbed network.
    const stub = await stubAnthropic(context, SCRIPT);

    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await composeMultiRound(page);

    // Guards the guard: the shape is launchable RIGHT NOW. Without this, a
    // permanently-dead launch button would pass the assertion below for the
    // wrong reason.
    await page.getByLabel("Topology task").fill(TASK);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();

    // A shape is drawn once and launched later, and the room moves in between.
    // Release Oracle — stages 3 and 5 name them, so two stages break at once and
    // the strip has to join both problems onto one readable line.
    // The badge is opacity-0/pointer-events-none until its avatar is hovered.
    await page.getByTitle(/^Oracle —/).hover();
    await page.getByRole("button", { name: "Release Oracle from this room" }).click();
    await expect(page.getByText("3 in the room")).toBeVisible();

    // ── REFUSED, AND IT SAYS WHO ─────────────────────────────────────────────
    // Not "the shape is invalid" — the missing agent is named, because the fix
    // (summon them back, or edit the stage) depends on which one it is.
    await expect(page.getByText(/not in the room: "oracle"/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeDisabled();

    // ── AND IT COST NOTHING ──────────────────────────────────────────────────
    // Both halves of "nothing spent": no model call, and no task line committed
    // to the transcript that would read as a run having started.
    await page.getByLabel("Topology task").press("Enter"); // the keyboard path is gated too
    await page.waitForTimeout(400);
    expect(stub.requests, "a refused shape reached the model").toHaveLength(0);
    expect(stub.overflow).toBe(0);
    await expect(page.getByRole("log")).not.toContainText(TASK);
    await expect(page.getByText(/phase \d+\/\d+/)).toHaveCount(0);

    // Summoning them back makes it runnable again, which is what proves the
    // block was about this agent and not about the shape being unrunnable.
    await page.getByTitle(/^Summon Oracle/).click();
    await expect(page.getByText(/not in the room: "oracle"/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PRICE, WHEN A NODE ACTUALLY USES ITS TOOLS.
//
// The fixture above cannot fail the way the price can. Every scripted turn is
// text, so every node is exactly one model call, so "requests === quoted" passes
// whether the chip is an honest floor or a false promise — and the real spend
// could be four times the quote with the suite still green. A test that can only
// pass when every node takes one turn is not a test of the price.
//
// So this one makes a node do the thing the quote cannot predict: read a repo
// file. runToolLoop answers the tool_result in a SECOND call to the model, which
// is the entire reason the chip says "N+" instead of "N". The contract asserted
// here is the honest one:
//
//   · the chip is a FLOOR, shown with the "+", and it does not move afterwards
//   · the run REPORTS what it actually spent
//   · and when that exceeds the quote, the report SAYS SO — first clause, with
//     the reason, rather than leaving the operator to find it on a bill.
//
// raw.githubusercontent.com is routed here rather than in helpers.ts because
// this is the only spec that reaches it: read_repo_file goes straight to raw
// (no token is armed), and a test that let that request out would be neither
// hermetic nor honest about what it proved.
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_PROJECT = "crashkit";
const TOOL_ROOM = ["strat", "forge", "critic"];
const TOOL_SHAPE = "read-then-answer";
const TOOL_TASK = "is the parity claim in the README backed by a run?";

/** The bytes the stubbed raw.githubusercontent hands back, tagged so the
 *  follow-up request can be searched for them. */
const README_LINE = "READ-FROM-REPO: the parity sentence cites no run.";

const trioRoom = () =>
  persistedState({ channels: { [TOOL_PROJECT]: { participants: TOOL_ROOM, queue: [], messages: [] } } });

/** raw.githubusercontent, stubbed. Nothing leaves the browser. */
async function stubRepoFile(context: BrowserContext, body: string) {
  await context.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      body,
    })
  );
}

test.describe("the price chip is a floor, not a promise", () => {
  test("a node that reads the repo costs two calls — and the run says it went over", async ({
    context,
    page,
  }) => {
    await isolate(context, trioRoom(), { liveBrain: true });
    await stubRepoFile(context, README_LINE);

    // Four turns for a three-node shape. Forge's first turn asks for the file;
    // its SECOND turn is the one nothing counted before the run could measure it.
    const MGR = "SPLIT: Forge reads the README, Critic weighs the claim.";
    const FORGE_ASKING = "Let me read it rather than guess.";
    const FORGE_ANSWER = "FORGE-ANSWER: the sentence cites nothing — cut it.";
    const CRITIC_ANSWER = "CRITIC-ANSWER: agreed, and it has been unbacked since the first draft.";
    const stub = await stubAnthropic(context, [
      { text: MGR },
      { text: FORGE_ASKING, tool: { name: "read_repo_file", input: { path: "README.md" }, id: "toolu_readme" } },
      { text: FORGE_ANSWER },
      { text: CRITIC_ANSWER },
    ]);

    await gotoHub(page, `/#/p/${TOOL_PROJECT}/work`);

    // A two-stage shape, drawn the same way as any other: SINGLE manager, then
    // the two workers IN ORDER. In order, not fan-out, purely so the four wire
    // requests land in one knowable sequence — this test is about the price, and
    // concurrency is already proven above.
    await page.getByRole("button", { name: "+ new shape" }).click();
    await page.getByLabel("Shape name").fill(TOOL_SHAPE);
    await expect(page.getByLabel("Stage 1 agent 1")).toHaveValue("strat");
    await page.getByLabel("Add stage", { exact: true }).click();
    await page.getByLabel("Stage 2 kind").selectOption("sequence");
    await expect(page.getByLabel("Stage 2 role")).toHaveValue("worker");
    await expect(page.getByLabel("Stage 2 agent 1")).toHaveValue("forge");
    await expect(page.getByLabel("Stage 2 agent 2")).toHaveValue("critic");
    await expect(composerPrice(page)).toHaveText("3+ model calls");
    await page.getByRole("button", { name: "Save shape" }).click();
    await expect(page.getByTestId("shape-composer")).toHaveCount(0);

    const quoted = await priceOf(barPrice(page));
    expect(quoted).toBe(3);

    await page.getByLabel("Topology task").fill(TOOL_TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect(page.getByText(CRITIC_ANSWER)).toBeVisible({ timeout: 30_000 });
    await expect(carets(page)).toHaveCount(0);

    // ── THE FLOOR WAS A FLOOR ────────────────────────────────────────────────
    // Three nodes, four calls. This is the assertion the old fixture could not
    // even express: if the suite ever goes back to a script of pure text turns,
    // this fails and says why.
    expect(
      stub.requests.length,
      "the fixture did not make any node take a second turn — it cannot test the price"
    ).toBeGreaterThan(quoted);
    expect(stub.requests).toHaveLength(4);
    expect(stub.overflow).toBe(0);

    // The second turn exists because the first one called a tool, and the tool
    // really ran: the follow-up request carries the tool_result, the file's
    // bytes, and the untrusted-file fence readRepoFile wraps them in.
    expect(stub.requests[1].toolNames).toContain("read_repo_file");
    expect(speakerOf(stub.requests[1].system)).toBe("Forge");
    expect(speakerOf(stub.requests[2].system)).toBe("Forge");
    const followUp = JSON.stringify(stub.requests[2].messages.at(-1));
    expect(followUp).toContain("tool_result");
    expect(followUp).toContain(README_LINE);
    expect(followUp, "the file came back unfenced — the untrusted-data wrapper is gone").toContain(
      "untrusted-file"
    );

    // ── AND THE RUN CONFESSES ────────────────────────────────────────────────
    // Quoted 3, spent 4, and the line says OVER in its first clause with the
    // reason attached. An operator who reads only this line still learns the
    // true number. Since TOOL-TRACE-1 the figure is counted per-request at the
    // socket, so it is EXACT by construction — the old "may have taken it past"
    // range hedge no longer exists to assert on.
    await expect(page.getByText(spentOver(quoted, 4))).toBeVisible();
    await expect(page.getByText(/Tools are why: a node that calls one has to answer the result/)).toBeVisible();

    // ── AND THE CALL ITSELF IS VISIBLE ───────────────────────────────────────
    // TOOL-TRACE-1: the free read left its own row in the room, attributed to
    // Forge, so a worker that read the repo no longer looks identical to one
    // that answered cold. One row — Critic called nothing.
    const traceRow = page.getByTestId("tool-trace");
    await expect(traceRow).toHaveCount(1);
    await expect(traceRow).toContainText("read_repo_file(README.md)");
    await expect(traceRow).toContainText("free tool call");

    // The chip does NOT retro-fit itself to the bill. It is the floor of the
    // NEXT run too, and rewriting it to 4 would be a different lie.
    await expect(barPrice(page)).toHaveText("3+ model calls");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DOES THE CONTEXT WINDOW ACTUALLY WIDEN FOR A LONG RUN?
//
// The multi-round spec above proves a round-2 worker can see round 1 — over a
// run of eight messages, which fits inside toTurns' default 20-message window
// either way. Delete the widening in streamAgent and that spec stays green. It
// is an assertion about a promise nothing was testing.
//
// This run lays down 25 messages before round 2 speaks: the operator's task plus
// four stages of six. Reachable inside the composer's own caps (8 stages, 6
// agents per stage) and nowhere near them, so it is a shape an operator could
// actually draw. With the widening, a round-2 worker sees all 24 earlier answers
// and the task. Without it, it sees the last 20 messages — the task and the
// first four answers of ROUND 1 are gone, which is precisely the round its brief
// swears is above it.
//
// The answers are scripted BY WHO ASKED rather than by arrival order: two of
// these five stages are fan-outs, so arrival order is a scheduling detail and an
// index-keyed script would hand Oracle's line to Ops.
// ─────────────────────────────────────────────────────────────────────────────

const LONG_PROJECT = "model-drift";
// Six agents: the five globals plus Probe, who is resident in model-drift. Six
// is the composer's per-stage cap, which is what makes 25 messages reachable in
// four stages.
const LONG_ROOM = ["strat", "forge", "critic", "oracle", "ops", "probe"];
const LONG_SHAPE = "long-haul";
const LONG_TASK = "LONG-TASK: does the daily suite still separate drift from harness noise?";

const sixRoom = () =>
  persistedState({ channels: { [LONG_PROJECT]: { participants: LONG_ROOM, queue: [], messages: [] } } });

/** Every agent speaks once per stage, so the Nth thing an agent says IS stage N. */
const stageTag = (stage: number, speaker: string) => `S${stage}-${speaker.toUpperCase()}`;

/**
 * Set a whole stage: kind, role, and exactly these agents. Written as a loop
 * because the shape this spec needs is five stages wide and hand-writing 60
 * clicks would bury the one thing the test is about.
 */
async function setStage(page: Page, i: number, kind: string, role: string, agentIds: string[]) {
  const n = i + 1;
  await page.getByLabel(`Stage ${n} kind`).selectOption(kind);
  await page.getByLabel(`Stage ${n} role`).selectOption(role);
  const slots = page.getByTestId(`stage-${i}`).getByLabel(/^Stage \d+ agent \d+$/);
  for (let have = await slots.count(); have > agentIds.length; have--) {
    await page.getByLabel(`Remove agent ${have} from stage ${n}`).click();
  }
  for (let have = await slots.count(); have < agentIds.length; have++) {
    await page.getByLabel(`Add agent to stage ${n}`).click();
  }
  await expect(slots).toHaveCount(agentIds.length);
  for (const [j, id] of agentIds.entries()) {
    await page.getByLabel(`Stage ${n} agent ${j + 1}`).selectOption(id);
  }
}

test.describe("the run's context window", () => {
  test("a round-2 worker still sees round 1 after 25 messages — past the chat-sized window", async ({
    context,
    page,
  }) => {
    // 26 model calls and a five-stage shape drawn click by click. The length IS
    // the test — a run short enough to finish inside the default budget is a run
    // short enough to fit inside the window it is supposed to prove.
    test.setTimeout(150_000);
    await isolate(context, sixRoom(), { liveBrain: true });

    // Answer as whoever asked, tagged with which pass of the shape it is. Every
    // agent speaks exactly once per stage, so a per-speaker counter IS the stage
    // number — no dependence on the order a fan-out's six calls happen to land.
    const spoken = new Map<string, number>();
    const stub = await stubAnthropic(context, (request: RecordedRequest) => {
      const who = speakerOf(request.system);
      const nth = (spoken.get(who) ?? 0) + 1;
      spoken.set(who, nth);
      return { text: `${stageTag(nth, who)}: nothing here clears the noise floor yet.` };
    });

    await gotoHub(page, `/#/p/${LONG_PROJECT}/work`);
    await expect(page.getByText("6 in the room")).toBeVisible();

    await page.getByRole("button", { name: "+ new shape" }).click();
    await page.getByLabel("Shape name").fill(LONG_SHAPE);

    // Four full-width stages, then a narrow round-2 fan-out. The middle three
    // are only there to push round 1 out of a 20-message window — they are
    // different (kind, role) pairs on purpose, so each is its own round 1 and
    // stage 5 is the only stage the engine calls ROUND 2.
    await setStage(page, 0, "fanout", "worker", LONG_ROOM);
    for (const [i, [kind, role]] of [
      ["sequence", "worker"],
      ["fanout", "judge"],
      ["sequence", "judge"],
    ].entries()) {
      await page.getByLabel("Add stage", { exact: true }).click();
      await setStage(page, i + 1, kind, role, LONG_ROOM);
    }
    await page.getByLabel("Add stage", { exact: true }).click();
    await setStage(page, 4, "fanout", "worker", ["strat", "forge"]);

    // Only the last stage repeats a (kind, role) pair, so it is the only ROUND 2.
    await expect(page.getByTestId("stage-4")).toContainText("round 2");
    for (const i of [0, 1, 2, 3]) await expect(page.getByTestId(`stage-${i}`)).not.toContainText("round");
    await expect(page.getByTestId("shape-problems")).toHaveCount(0);
    await expect(composerPrice(page)).toHaveText("26+ model calls");

    await page.getByRole("button", { name: "Save shape" }).click();
    await expect(page.getByTestId("shape-composer")).toHaveCount(0);

    await page.getByLabel("Topology task").fill(LONG_TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect(page.getByText(spentInside(26, 26))).toBeVisible({ timeout: 40_000 });
    await expect(carets(page)).toHaveCount(0);
    expect(stub.requests).toHaveLength(26);
    expect(stub.overflow).toBe(0);

    // Everything said before round 2 spoke: four stages × six agents.
    const EARLIER = [1, 2, 3, 4].flatMap((stage) =>
      LONG_ROOM.map((id) => stageTag(stage, id.charAt(0).toUpperCase() + id.slice(1)))
    );

    // GUARDS THE GUARD. If this fixture ever shrinks back under the default
    // window, the assertions below stop discriminating and start passing for
    // free — so fail here instead, loudly, rather than reporting theatre as
    // coverage. 1 + 24 = 25 messages, against a 20-message default.
    expect(
      1 + EARLIER.length,
      "this run no longer exceeds toTurns' 20-message default — it cannot detect a lost window"
    ).toBeGreaterThan(20);

    const roundTwo = stub.requests.filter((r) => r.system.includes("in ROUND 2."));
    expect(roundTwo, "the last stage was not treated as a second round").toHaveLength(2);

    for (const r of roundTwo) {
      const seen = JSON.stringify(r.messages);
      // The task the whole run is about. It is the FIRST message in the room, so
      // it is the first thing a 20-message window drops — and the round-2 brief
      // does not restate it, so losing it leaves the worker revising something
      // it can no longer read.
      expect(seen, "round 2 could not see the task it is working on").toContain(LONG_TASK);
      for (const tag of EARLIER) {
        expect(seen, `round 2 was told "${tag}" was above, and it was not`).toContain(tag);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FAN-OUT WITH NOBODY TO FAN OUT TO.
//
// Not a composed shape — the built-in one, in a room of one. It belongs beside
// the composed shapes anyway, because it is the same claim: the chip is what the
// run will cost, and a shape the engine will refuse must never be priced as if
// it will run. With one agent the worker stage is empty, so the two solo manager
// stages were pure spend: "split this among your workers" with no workers, then
// "merge the workers' answers" with nothing to merge. Two model calls for a
// shape that structurally cannot do its job.
// ─────────────────────────────────────────────────────────────────────────────

const SOLO_TASK = "SOLO-TASK: what is worth doing first here?";

test.describe("the built-in fan-out", () => {
  test("costs nothing and stays dark in a room of one", async ({ context, page }) => {
    await isolate(
      context,
      persistedState({ channels: { [PROJECT]: { participants: ["critic"], queue: [], messages: [] } } }),
      { liveBrain: true }
    );
    // Scripted so that a leak is RECORDED rather than answered by the network.
    const stub = await stubAnthropic(context, [{ text: "should never be spoken" }]);

    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await expect(page.getByText("1 in the room")).toBeVisible();

    await page.getByRole("button", { name: "fan-out" }).click();
    // Not "0+ model calls" — zero is not a price. The chip has to say the room
    // cannot fill this shape, or the operator reads a dead button as a bug.
    await expect(barPrice(page)).toHaveText("nothing to run");

    // A task is typed, so the button is dark for the SHAPE's reason and not
    // because the field is empty.
    await page.getByLabel("Topology task").fill(SOLO_TASK);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeDisabled();

    // Both paths to a launch, and neither one spends.
    await page.getByLabel("Topology task").press("Enter");
    await page.waitForTimeout(400);
    expect(stub.requests, "a one-agent fan-out reached the model").toHaveLength(0);
    expect(stub.overflow).toBe(0);
    await expect(page.getByRole("log")).not.toContainText(SOLO_TASK);
    await expect(page.getByText(/phase \d+\/\d+/)).toHaveCount(0);
    await expect(page.getByText(/shape done/)).toHaveCount(0);

    // GUARDS THE GUARD: summon one more and the same shape prices and launches.
    // Without this, a fan-out that was broken for every room size would pass the
    // assertions above for entirely the wrong reason.
    await page.getByTitle(/^Summon Forge/).click();
    await expect(page.getByText("2 in the room")).toBeVisible();
    await expect(barPrice(page)).toHaveText("3+ model calls");
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();
  });
});
