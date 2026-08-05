import { expect, test, type Page } from "@playwright/test";
import { gotoHub, isolate, persistedState, say, sidebarProject } from "./helpers";
import { FAKE_KEY, stubAnthropic, type AnthropicStub } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// THE LIVE PATH — the one the rest of the suite could not reach.
//
// gate.spec.ts stages a pending proposal card by writing it into persisted
// state and then clicks approve. That proves approveAction works. It proves
// nothing about the code that MINTS a card, and mutation testing said so out
// loud: change streamAgent so proposals are written `status: "approved"`
// instead of `"pending"`, drop approveAction's pending guard, and all 18 tests
// stayed green. The producer had no test.
//
// These specs drive the real producer end to end — sendToChannel → streamAgent
// → runToolLoop → @anthropic-ai/sdk → the wire — and stub only the wire, with a
// scripted SSE stream (see anthropic-stub.ts). Nothing in src/ is aware of the
// test. A fake key in localStorage is what flips the store onto the live path;
// the route stub means no request ever leaves the browser.
// ─────────────────────────────────────────────────────────────────────────────

const PROPOSED_NAME = "eval runner";
const PROPOSED_ID = "eval-runner";
const OPS_LINE = `✓ operator approved — ${PROPOSED_ID} is on the board.`;

/** An empty room with Critic present — no mock roundtable queue to talk over the test. */
const quietRoom = () =>
  persistedState({ channels: { crashkit: { participants: ["critic"], queue: [], messages: [] } } });

/** The two round trips a gated tool call really makes: propose, then be told it was gated. */
const PROPOSE_THEN_FOLLOW_UP = [
  {
    text: "That belongs on its own board rather than buried in this room.",
    tool: { name: "create_project", input: { name: PROPOSED_NAME }, id: "toolu_gate_probe" },
  },
  { text: "Proposed, not done — the approval is yours." },
];

/** The blinking caret the app paints on a message that is still being written. */
const streamCursor = (page: Page) => page.locator('[role="log"] span.breathe');

/** The one amber card: gate wording and the approve button in the same box. */
const gateCard = (page: Page) =>
  page
    .locator("div")
    .filter({ hasText: "gated · operator approval required · agents cannot self-approve" })
    .filter({ has: page.getByRole("button", { name: /^Approve create_project/ }) })
    .last();

test.describe("the live tool path", () => {
  test("a streamed reply paints with the cursor, then settles", async ({ context, page }) => {
    await isolate(context, quietRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, [
      { text: "Nothing here clears the noise floor yet. Show me the baseline first." },
    ]);

    await gotoHub(page, "/#/p/crashkit/work");

    // Hold the response open so the in-flight UI is observable rather than a
    // frame the assertions race against.
    stub.hold();
    await say(page, "crashkit", "what do you make of the latest run?");

    // Wait for the request to have LEFT the app before asserting anything about
    // the in-flight UI. Past this line the response is provably still held, so
    // "the reply has not arrived yet" is a fact rather than a race we won.
    await expect.poll(() => stub.requests.length).toBe(1);

    // Mid-stream: a caret on the message, the composer saying an agent is
    // writing, and not one character of the reply on screen.
    await expect(streamCursor(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send — an agent is writing" })).toContainText("writing…");
    await expect(page.getByText("Nothing here clears the noise floor yet.")).toHaveCount(0);

    stub.release();

    // Settled: the text landed, the caret is gone, the composer is idle again.
    await expect(
      page.getByText("Nothing here clears the noise floor yet. Show me the baseline first.")
    ).toBeVisible();
    await expect(streamCursor(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();

    // The app really made the request, with its real key header and its real
    // tool list — so a passing assertion above cannot be the offline persona
    // path wearing the live path's clothes.
    expect(stub.requests).toHaveLength(1);
    expect(stub.overflow).toBe(0);
    expect(stub.requests[0].apiKey).toBe(FAKE_KEY);
    expect(stub.requests[0].toolNames).toContain("create_project");
    expect(stub.requests[0].system).toContain("You are Critic");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE MUTATION TEST. This is the one that has to die when streamAgent writes
  // proposals as "approved" instead of "pending".
  // ───────────────────────────────────────────────────────────────────────────
  test("a create_project tool call renders a PENDING card and creates nothing", async ({ context, page }) => {
    await isolate(context, quietRoom(), { liveBrain: true });
    const stub = await stubAnthropic(context, PROPOSE_THEN_FOLLOW_UP);

    await gotoHub(page, "/#/p/crashkit/work");
    await say(page, "crashkit", "we need somewhere to put the eval runner");

    const card = gateCard(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/border-amber-300/);
    await expect(card).toContainText(`create_project(${PROPOSED_NAME})`);

    // PENDING is the whole assertion: the card must still be waiting on a human.
    // Both affordances present, and the resolved wording absent — an "approved"
    // card renders the wording instead of the buttons, so this fails either way.
    await expect(card.getByRole("button", { name: /^Approve create_project/ })).toBeVisible();
    await expect(card.getByRole("button", { name: /^Dismiss create_project/ })).toBeVisible();
    await expect(page.getByText("✓ approved by operator")).toHaveCount(0);
    await expect(page.getByText("dismissed by operator")).toHaveCount(0);

    // …and proposing did not do it. Nowhere, on any surface.
    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(0);
    await expect(page.getByText(OPS_LINE)).toHaveCount(0);
    await page.getByRole("button", { name: "galaxy" }).click();
    await expect(page.locator(`[data-planet="${PROPOSED_ID}"]`)).toHaveCount(0);

    // The gate is also enforced back at the protocol boundary: the model was
    // told the call was gated and NOT executed, so it cannot claim otherwise.
    expect(stub.requests).toHaveLength(2);
    expect(stub.overflow).toBe(0);
    const toolResult = JSON.stringify(stub.requests[1].messages.at(-1));
    expect(toolResult).toContain("tool_result");
    expect(toolResult).toContain("GATED");
    expect(toolResult).toContain("NOT executed");
  });

  test("approve executes it — sidebar, canvas, and an Ops announcement", async ({ context, page }) => {
    await isolate(context, quietRoom(), { liveBrain: true });
    await stubAnthropic(context, PROPOSE_THEN_FOLLOW_UP);

    await gotoHub(page, "/#/p/crashkit/work");
    await say(page, "crashkit", "we need somewhere to put the eval runner");
    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(0);

    await page.getByRole("button", { name: /^Approve create_project/ }).click();

    await expect(page.getByText("✓ approved by operator")).toBeVisible();
    await expect(page.getByText(OPS_LINE)).toBeVisible();
    await expect(sidebarProject(page, PROPOSED_ID)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve create_project/ })).toHaveCount(0);

    await page.getByRole("button", { name: "galaxy" }).click();
    await expect(page.locator(`[data-planet="${PROPOSED_ID}"]`)).toHaveCount(1);
  });

  test("a resolved card cannot be approved twice", async ({ context, page }) => {
    await isolate(context, quietRoom(), { liveBrain: true });
    await stubAnthropic(context, PROPOSE_THEN_FOLLOW_UP);

    await gotoHub(page, "/#/p/crashkit/work");
    await say(page, "crashkit", "we need somewhere to put the eval runner");
    await expect(page.getByRole("button", { name: /^Approve create_project/ })).toBeVisible();

    // Two clicks inside ONE task, which is the race a jumpy operator actually
    // produces and the reason approveAction guards on status === "pending".
    // Playwright's own second click would find nothing to click, so this has to
    // go through the DOM: React has not re-rendered between the two calls, so
    // the button is still mounted and the second click still reaches the store.
    const stillMountedBetweenClicks = await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>('[aria-label^="Approve create_project"]');
      if (!btn) throw new Error("no approve button to double-click");
      btn.click();
      const attached = btn.isConnected;
      btn.click();
      return attached;
    });
    // Guards the guard: if React ever starts flushing between the two clicks,
    // the second one stops reaching the reducer and this test quietly becomes a
    // tautology. Fail instead, so we know to find another way to race it.
    expect(
      stillMountedBetweenClicks,
      "the second click no longer reaches the reducer — this test no longer exercises the double-approve race"
    ).toBe(true);

    // Approving twice must land exactly once, everywhere.
    await expect(page.getByText(OPS_LINE)).toHaveCount(1);
    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(1);
    await expect(page.getByText("✓ approved by operator")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Approve create_project/ })).toHaveCount(0);

    // And it stays landed exactly once after a reload — the second approval was
    // refused, not merely un-rendered.
    await page.reload();
    await expect(page.getByText(OPS_LINE)).toHaveCount(1);
    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Approve create_project/ })).toHaveCount(0);
  });
});
