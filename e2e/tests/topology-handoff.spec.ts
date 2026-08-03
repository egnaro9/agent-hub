import { expect, test, type Page } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { FAKE_KEY, stubAnthropic } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// AN ASSEMBLY LINE, NOT A CONVERSATION.
//
// `loop` and `pipeline` shipped as two chips running one shape: both expanded to
// the same stage list, so they planned the same phases, quoted the same price and
// handed out byte-identical briefs. Two chips side by side READ as a comparison,
// which is worse than offering one — an operator switching between them saw
// nothing change and had no way to learn that nothing had.
//
// The distinction that makes the second chip worth its code is invisible in the
// room, which is exactly why it has to be asserted at the wire:
//
//   loop     (sequence) — every agent sees the running transcript.
//   pipeline (handoff)  — every agent sees ONLY the immediately preceding
//                         agent's output. Agent 3 must not see agent 1's text.
//
// Same agents, same order, same price; only context visibility varies. That is a
// controlled experiment, and it is the only one of the two shapes in which
// telephone-game drift is observable at all — a full transcript lets a late
// agent silently repair what an early one dropped, which hides the very thing
// the shape exists to expose.
//
// WHY THE ASSERTIONS ARE ON REQUEST BODIES AND NOT ON THE ROOM. The transcript is
// deliberately unnarrowed: every link writes into the room in full, so the
// operator watches the whole line. Rendering therefore looks IDENTICAL under both
// shapes, and any assertion made against the room would have passed against the
// old duplicate implementation. The only place the difference exists is in what
// was put on the wire.
//
// And the bar is specifically "node 3 does NOT contain A1". A test that merely
// checked node 3 saw SOMETHING would have passed against the duplicate too — it
// saw everything. Absence is the whole claim.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT = "crashkit";
/** Three agents, so the chain has a head, a middle and a tail — the middle is
 *  the only position from which "cannot see one step further back" is a
 *  statement about anything. A two-node chain cannot fail this way. */
const ROOM = ["strat", "forge", "critic"];
const TASK = "TASK-ORIGIN: what has to be true before we tag the release?";

// One uniquely identifiable string per link. Chosen so no tag is a substring of
// another and none appears anywhere else in the app — a `not.toContain` is only
// as strong as the uniqueness of what it is looking for.
const A1 = "LINK1-ALPHA: the migration 0003_add_floor.sql is not in the tag.";
const A2 = "LINK2-BETA: so the tag ships a schema the running app does not have.";
const A3 = "LINK3-GAMMA: hold the tag until the migration lands, then re-cut it.";

const trioRoom = () =>
  persistedState({ channels: { [PROJECT]: { participants: ROOM, queue: [], messages: [] } } });

/** Which agent a recorded request belongs to — the persona line names them. */
const speakerOf = (system: string) => /You are (\w+) —/.exec(system)?.[1] ?? "?";

/**
 * The one-turn brief, split back off the system prompt. streamAgent prepends it
 * as `${brief}\n\n${persona}` and every brief is a single paragraph, so the first
 * block IS the brief. Asserting on it rather than on the whole system prompt
 * keeps a persona edit from quietly satisfying — or breaking — a claim about
 * what this node was told to do THIS turn.
 */
const briefOf = (system: string) => system.split("\n\n")[0];

/** What the app actually put on the wire for this node, as searchable text. */
const sentTo = (r: { messages: unknown }) => JSON.stringify(r.messages);

/** The strip's live phase line, matched WHOLE — a substring match cannot tell
 *  "3 in line" from "13 in line". */
const phaseLine = (page: Page, label: string) => page.getByText(label, { exact: true });

/** The caret the room paints on a message still being written. */
const carets = (page: Page) => page.locator('[role="log"] span.breathe');

/** The launcher's quote, scoped to the launch button's own row. */
const barPrice = (page: Page) =>
  page
    .getByRole("button", { name: "Launch topology" })
    .locator("..")
    .getByText(/^(\d+\+ model calls?|nothing to run)$/);

/** Pick a preset chip, type the task, and run it. */
async function launch(page: Page, shape: string, task: string) {
  await page.getByRole("button", { name: shape, exact: true }).click();
  await page.getByLabel("Topology task").fill(task);
  await page.getByRole("button", { name: "Launch topology" }).click();
}

test.describe("the hand-off shape", () => {
  test("shows each link ONLY its predecessor's output — node 3 never sees node 1", async ({
    context,
    page,
  }) => {
    await isolate(context, trioRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, [{ text: A1 }, { text: A2 }, { text: A3 }]);

    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await expect(page.getByText("3 in the room")).toBeVisible();

    // Priced before anything is spent, and priced the same as the loop below:
    // three nodes, three calls. If the two shapes ever stop costing the same,
    // the comparison stops being controlled.
    await page.getByRole("button", { name: "pipeline", exact: true }).click();
    await expect(barPrice(page)).toHaveText("3+ model calls");
    expect(stub.requests).toHaveLength(0);

    // Hold the first turn so the strip can be read mid-run. The strip is the
    // only surface on which the run itself tells the operator WHICH of the two
    // identically-priced shapes is executing — "in line", not "in turn".
    stub.hold();
    await launch(page, "pipeline", TASK);

    await expect.poll(() => stub.requests.length).toBe(1);
    await expect(phaseLine(page, "phase 1/1 · hand-off · 3 in line")).toBeVisible();
    stub.release();

    await expect(page.getByText(A3)).toBeVisible({ timeout: 30_000 });
    await expect(carets(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();

    expect(stub.requests).toHaveLength(3);
    expect(stub.overflow).toBe(0);
    const [n1, n2, n3] = stub.requests;

    // Three different agents, in room order — the chain is not one agent talking
    // to itself, and the assertions below are about three distinct stations.
    expect([n1, n2, n3].map((r) => speakerOf(r.system))).toEqual(["Strat", "Forge", "Critic"]);
    expect(n1.apiKey).toBe(FAKE_KEY);

    // ── EDGE 1: THE HEAD WAS HANDED NOTHING ──────────────────────────────────
    // Its context is the operator's task and NOTHING else — not the room's
    // ordinary chat memory, not a stray earlier line. Asserted as an exact
    // array rather than a `toContain`, because "the task is in there somewhere"
    // is true of every shape in the app and discriminates nothing.
    expect(n1.messages, "the first link was handed something nobody handed it").toEqual([
      { role: "user", content: TASK },
    ]);
    expect(briefOf(n1.system)).toContain("Nobody has handed you anything — the chain starts with you");
    // An opener told to work from what is "above" it invents an upstream agent,
    // and an agent that believes it missed context spends its turn asking for it.
    expect(briefOf(n1.system), "the head's brief points it at something above it").not.toContain("above");

    // ── EDGE 2: THERE IS NO BACK-CHANNEL ─────────────────────────────────────
    // In a loop an agent can leave a question for whoever speaks next, because
    // they share a transcript and can answer it. Here the next agent sees only
    // this output, so a question travels down the line AS the work and displaces
    // the artifact. Every link has to be told the output IS the deliverable.
    for (const r of [n1, n2, n3]) {
      expect(briefOf(r.system)).toContain("AS the artifact");
      expect(briefOf(r.system)).toMatch(/not a question|do not leave a question or an open decision/);
    }

    // ── THE NARROWING, LINK BY LINK ──────────────────────────────────────────
    // Link 2 gets exactly one thing: link 1's output. Not the task — restating
    // the goal at every station hands back the context the shape exists to
    // withhold, and drift stops being measurable the moment a link can check the
    // original against what it was given.
    expect(briefOf(n2.system)).toContain("Directly above you is ONE thing");
    expect(sentTo(n2), "link 2 was not handed link 1's output at all").toContain(A1);
    expect(sentTo(n2), "the task was handed back down the chain").not.toContain(TASK);
    for (const later of [A2, A3]) expect(sentTo(n2)).not.toContain(later);

    // THE ASSERTION THIS FILE EXISTS FOR. Link 3 sees link 2 and stops. The
    // duplicate implementation passed everything to everyone, so it satisfied
    // "saw A2" — it is the ABSENCE of A1 that separates a hand-off from a loop,
    // and nothing weaker than this can fail against the old shape.
    expect(sentTo(n3), "link 3 was not handed link 2's output").toContain(A2);
    expect(sentTo(n3), "THE TRANSCRIPT LEAKED BACK IN — link 3 can see link 1").not.toContain(A1);
    expect(sentTo(n3), "link 3 could still read the original task").not.toContain(TASK);
    expect(briefOf(n3.system)).toContain("cannot see anything earlier in the chain");

    // ── AND THE OPERATOR STILL SEES THE WHOLE LINE ───────────────────────────
    // Narrowing what the MODEL reads must not narrow what the HUMAN reads —
    // conflating the two would hide exactly the drift this shape is built to
    // expose. Every link writes into the room in full, in order.
    const log = await page.getByRole("log").innerText();
    for (const line of [TASK, A1, A2, A3]) {
      expect(log, `the operator cannot see "${line}" — the room was narrowed too`).toContain(line);
    }
    const at = (s: string) => log.indexOf(s);
    for (const [before, after] of [
      [TASK, A1],
      [A1, A2],
      [A2, A3],
    ]) {
      expect(at(after), `"${after}" should follow "${before}" in the room`).toBeGreaterThan(at(before));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE CONTROLLED COMPARISON.
  //
  // The test above proves the pipeline withholds. On its own that is only half
  // an experiment: a run where NOTHING reaches node 3 — a broken window, a
  // mis-set floor — would satisfy it too. This is the same three agents, the
  // same order, the same task and the same three answers, with one variable
  // changed: the chip. The loop MUST put A1 in node 3's request. Together the
  // two tests say the shapes differ where they claim to and nowhere else.
  // ───────────────────────────────────────────────────────────────────────────
  test("the loop over the same three agents DOES put node 1 in node 3's request", async ({
    context,
    page,
  }) => {
    await isolate(context, trioRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, [{ text: A1 }, { text: A2 }, { text: A3 }]);

    await gotoHub(page, `/#/p/${PROJECT}/work`);

    // Same price as the pipeline. The two shapes are separated by what a node is
    // SHOWN, and by nothing else — not by cost, not by who runs, not by order.
    await page.getByRole("button", { name: "loop", exact: true }).click();
    await expect(barPrice(page)).toHaveText("3+ model calls");

    stub.hold();
    await launch(page, "loop", TASK);
    await expect.poll(() => stub.requests.length).toBe(1);
    // "in turn", against the hand-off's "in line" — the one word on screen that
    // tells the operator which shape is running.
    await expect(phaseLine(page, "phase 1/1 · sequence · 3 in turn")).toBeVisible();
    stub.release();

    await expect(page.getByText(A3)).toBeVisible({ timeout: 30_000 });
    await expect(carets(page)).toHaveCount(0);

    expect(stub.requests).toHaveLength(3);
    expect(stub.overflow).toBe(0);
    const [n1, n2, n3] = stub.requests;
    expect([n1, n2, n3].map((r) => speakerOf(r.system))).toEqual(["Strat", "Forge", "Critic"]);

    // It is a conversation: every agent carries the task and everything said.
    expect(briefOf(n1.system)).toContain("Continue the work on");
    expect(briefOf(n1.system), "the loop started handing out hand-off briefs").not.toContain("HAND-OFF");
    for (const r of [n1, n2, n3]) {
      expect(sentTo(r), "a loop node lost the task it is working on").toContain(TASK);
    }
    expect(sentTo(n2)).toContain(A1);

    // THE COMPARISON. Same position, same agent, same answer upstream — and here
    // A1 is present. The pipeline test asserts it is absent. One of those two
    // has to fail for the shapes to be the same shape again.
    expect(sentTo(n3), "the loop stopped being a conversation").toContain(A1);
    expect(sentTo(n3)).toContain(A2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A HAND-OFF THAT ARRIVES EMPTY.
  //
  // The one failure a chain has that a conversation does not. When a link
  // produces nothing, streamAgent deletes its message — so with the floor left
  // where it was, the next link would read whatever sits above it. In a chain
  // that is the operator's task, and the link would answer as though it were the
  // first agent: a silent restart, indistinguishable in the room from a chain
  // that ran, and the exact lie the head's brief exists to prevent.
  //
  // The stated handling is an explicit empty: one ops line that is simultaneously
  // what the operator reads and the ENTIRE context the next link is given, so the
  // two can never diverge.
  // ───────────────────────────────────────────────────────────────────────────
  test("an empty answer arrives as an explicit empty hand-off, not a silent restart", async ({
    context,
    page,
  }) => {
    await isolate(context, trioRoom(), { liveBrain: true });
    // Link 2 answers with no content at all — a real thing a model does, and the
    // stub reproduces it honestly: a message with zero content blocks, not a
    // truncated stream and not an error.
    const stub = await stubAnthropic(context, [{ text: A1 }, { text: "" }, { text: A3 }]);

    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await launch(page, "pipeline", TASK);

    await expect(page.getByText(A3)).toBeVisible({ timeout: 30_000 });
    await expect(carets(page)).toHaveCount(0);

    expect(stub.requests).toHaveLength(3);
    expect(stub.overflow).toBe(0);
    const [, n2, n3] = stub.requests;

    // GUARDS THE GUARD: the chain was alive up to the gap. Without this, a run
    // that never handed anything to anyone would satisfy every assertion below.
    expect(sentTo(n2), "the chain was already broken before the empty link").toContain(A1);

    // ── THE EMPTY TRAVELS AS ITSELF ──────────────────────────────────────────
    // It names WHICH node produced nothing, because the operator's next move
    // depends on which one it was, and it says the task is not being handed back
    // so the receiving link cannot read it as a fresh start.
    const handed = sentTo(n3);
    expect(handed).toContain("produced nothing — the hand-off is EMPTY");
    expect(handed, "the empty hand-off does not say which node went quiet").toContain("h1 (forge)");
    expect(handed).toContain("the task is NOT being handed back");

    // ── AND IT IS NOT A RESTART ──────────────────────────────────────────────
    // Neither the task nor the last surviving artifact is quietly substituted.
    // Handing back A1 would be the chain skipping a station and calling it a
    // hand-off; handing back the task would be link 3 answering as a head.
    expect(handed, "the chain reached past the empty link to link 1's output").not.toContain(A1);
    expect(handed, "an empty hand-off silently restarted the chain from the task").not.toContain(TASK);
    // Still a link, not a head — the brief must not switch stories either.
    expect(briefOf(n3.system)).toContain("Directly above you is ONE thing");
    expect(briefOf(n3.system)).not.toContain("Nobody has handed you anything");

    // ── THE OPERATOR READS THE SAME LINE THE MODEL WAS GIVEN ─────────────────
    // One sentence doing both jobs is the point: the operator cannot be shown
    // one explanation while the next link is quietly given another.
    await expect(page.getByText(/hand-off · h1 \(forge\) produced nothing/)).toBeVisible();
    const log = await page.getByRole("log").innerText();
    expect(log).toContain(A1);
    expect(log).toContain(A3);
  });
});
