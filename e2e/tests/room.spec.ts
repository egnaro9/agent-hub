import { expect, test } from "@playwright/test";
import { composer, gotoHub, isolate, persistedState, say } from "./helpers";

// crashkit seeds with exactly one resident (Critic, via SEED_ASSIGNMENTS).
const roomCount = (page: import("@playwright/test").Page) => page.getByText(/\d+ in the room/);

test.describe("room membership", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("summoning an agent from the room header adds them to the count", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await expect(composer(page, "crashkit")).toBeVisible();
    await expect(roomCount(page)).toHaveText("1 in the room");

    const summonStrat = page.getByTitle(/^Summon Strat/);
    await expect(summonStrat).toBeVisible();
    await summonStrat.click();

    await expect(roomCount(page)).toHaveText("2 in the room");
    await expect(page.getByTitle(/^Summon Strat/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Release Strat from this room" })).toHaveCount(1);
  });

  test("the × release badge takes them back out", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await page.getByTitle(/^Summon Strat/).click();
    await expect(roomCount(page)).toHaveText("2 in the room");

    // The badge is opacity-0/pointer-events-none until its avatar is hovered.
    await page.getByTitle(/^Strat —/).hover();
    await page.getByRole("button", { name: "Release Strat from this room" }).click();

    await expect(roomCount(page)).toHaveText("1 in the room");
    await expect(page.getByRole("button", { name: "Release Strat from this room" })).toHaveCount(0);
    await expect(page.getByTitle(/^Summon Strat/)).toBeVisible();
  });

  test("releasing the last resident empties the room", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await expect(roomCount(page)).toHaveText("1 in the room");

    await page.getByTitle(/^Critic —/).hover();
    await page.getByRole("button", { name: "Release Critic from this room" }).click();

    await expect(page.getByText("no one here yet — summon an agent")).toBeVisible();
    await expect(roomCount(page)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BEING IN A ROOM IS BEING ON THE PROJECT.
//
// Reported from live use: Strat was talking in #crashkit while the galaxy
// drew it idle and unattached, and the project card listed no crew. Two truths
// had drifted — `channel.participants` (who is in the room) and `assignments`
// (what the map and sidebar draw). Only `summon` wrote both; an @mention, the
// default responders and a topology node wrote only the first.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("room membership and the map agree", () => {
  test("an @mention puts the agent on the project card and the sidebar crew, not just in the room", async ({
    context,
    page,
  }) => {
    // A room with nobody in it, so the only way Strat gets there is the mention.
    await isolate(
      context,
      persistedState({ channels: { crashkit: { participants: [], queue: [], messages: [] } } })
    );
    await gotoHub(page, "/#/p/crashkit/work");

    await say(page, "crashkit", "@Strat what should this arc's exit criterion be?");
    // In the room…
    await expect(page.getByText(/\[?strat\]?/i).first()).toBeVisible({ timeout: 10_000 });

    // …and therefore ON the project, everywhere the app draws that fact.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("agent-hub:state");
          return raw ? (JSON.parse(raw).state?.assignments?.strat ?? null) : null;
        })
      )
      .toBe("crashkit");

    // The galaxy's own rendering, not just the store: the project card
    // carries a crew avatar titled for the agent working there.
    await page.getByRole("button", { name: "galaxy" }).click();
    await expect(page.locator('[title*="Strat is working here"]').first()).toBeVisible();
  });
});
