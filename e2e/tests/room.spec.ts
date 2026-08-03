import { expect, test } from "@playwright/test";
import { composer, gotoHub, isolate } from "./helpers";

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
