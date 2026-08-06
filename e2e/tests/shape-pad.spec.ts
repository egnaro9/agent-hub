import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE GRAPH, THE FORM AND THE JSON ARE ONE SHAPE.
//
// Three editing surfaces over one `stages` array is only worth having if none
// of them can drift from the others — a picture that disagrees with the data
// the runner reads is worse than no picture. So these assert ROUND TRIPS:
// edit in one surface, read it in another, and check the price (which is
// computed from the same Topology the runner plans) moves with it.
// ─────────────────────────────────────────────────────────────────────────────

const ROOM = ["strat", "forge", "critic", "oracle"];

const quadRoom = () =>
  persistedState({ channels: { crashkit: { participants: ROOM, queue: [], messages: [] } } });

/** The composer's own controls. "graph" also matches the agent-graph project
    in the rail, so every one of these is scoped to the panel. */
const inComposer = (page: import("@playwright/test").Page, name: string) =>
  page.getByTestId("shape-composer").getByRole("button", { name, exact: true });

const openComposer = async (page: import("@playwright/test").Page) => {
  await gotoHub(page, "/#/p/crashkit/work");
  await page.getByRole("button", { name: "+ new shape" }).click();
  await expect(page.getByTestId("shape-composer")).toBeVisible();
};

test.describe("the shape pad", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context, quadRoom());
  });

  test("opens on the graph, and the graph is clickable into an inspector", async ({ page }) => {
    await openComposer(page);
    await expect(page.getByTestId("shape-pad")).toBeVisible();

    // A graph you cannot click into is a picture: selecting a node must say
    // which step it is and what that step does to who-reads-whom.
    await page.locator('[data-testid="shape-pad"] rect').first().click();
    const inspector = page.getByTestId("pad-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("step 1 of 1");
    await expect(inspector).toContainText("one agent speaks");
  });

  test("an edit in the graph is the same edit the runner will see", async ({ page }) => {
    await openComposer(page);
    await page.locator('[data-testid="shape-pad"] rect').first().click();

    // Two more agents in this step, and switch it to a fan-out.
    await inComposer(page, "+ role").click();
    await inComposer(page, "+ role").click();
    await page.getByTestId("pad-inspector").getByRole("button", { name: "fan-out" }).click();
    await expect(page.getByTestId("pad-inspector")).toContainText("none sees another");

    // THE ROUND TRIP: the JSON is the object the runner reads, so the graph's
    // edit has to be in it — three agents and the new kind.
    await inComposer(page, "json").click();
    const json = await page.getByTestId("shape-json").inputValue();
    const stages = JSON.parse(json);
    expect(stages).toHaveLength(1);
    expect(stages[0].kind).toBe("fanout");
    expect(stages[0].agentIds).toHaveLength(3);

    // ...and the price agrees, because it is callCount() over the same plan
    await expect(page.getByTestId("shape-composer").getByText(/3\+ model calls/)).toBeVisible();
  });

  test("an edit in the JSON lands in the graph and in the price", async ({ page }) => {
    await openComposer(page);
    await inComposer(page, "json").click();

    await page
      .getByTestId("shape-json")
      .fill(JSON.stringify([{ kind: "handoff", role: "worker", agentIds: ROOM.slice(0, 3) }], null, 2));

    // the graph shows what the data says
    await inComposer(page, "graph").click();
    await page.locator('[data-testid="shape-pad"] rect').first().click();
    await expect(page.getByTestId("pad-inspector")).toContainText("sees ONLY the one before");
    await expect(page.locator('[data-testid="shape-pad"] rect')).toHaveCount(3);
    await expect(page.getByTestId("shape-composer").getByText(/3\+ model calls/)).toBeVisible();
  });

  test("malformed JSON is refused with a reason, and does not corrupt the shape", async ({ page }) => {
    await openComposer(page);
    await inComposer(page, "json").click();
    await page.getByTestId("shape-json").fill("[{ this is not json");
    await expect(page.getByText("Not valid JSON yet.")).toBeVisible();

    // valid JSON, wrong shape — a step with no agentIds array
    await page.getByTestId("shape-json").fill('[{"kind":"solo","role":"worker"}]');
    await expect(page.getByText(/needs a kind, a role and an agentIds array/)).toBeVisible();

    // the graph still holds the last GOOD shape rather than an empty pad
    await inComposer(page, "graph").click();
    await expect(page.locator('[data-testid="shape-pad"] rect').first()).toBeVisible();
  });

  test("tidy says what will actually happen: an empty step goes, a lone agent is a solo", async ({ page }) => {
    await openComposer(page);
    await inComposer(page, "json").click();
    await page.getByTestId("shape-json").fill(
      JSON.stringify(
        [
          { kind: "fanout", role: "worker", agentIds: ["strat"] },
          { kind: "sequence", role: "worker", agentIds: [] },
        ],
        null,
        2
      )
    );
    await inComposer(page, "graph").click();
    await inComposer(page, "tidy").click();

    await inComposer(page, "json").click();
    const stages = JSON.parse(await page.getByTestId("shape-json").inputValue());
    expect(stages).toHaveLength(1);          // the empty step is gone
    expect(stages[0].kind).toBe("solo");     // a fan-out of one was never a fan-out
  });

  test("lock freezes the shape", async ({ page }) => {
    await openComposer(page);
    await inComposer(page, "lock").click();
    await expect(inComposer(page, "+ step")).toBeDisabled();
    await inComposer(page, "locked").click();
    await expect(inComposer(page, "+ step")).toBeEnabled();
  });
});
