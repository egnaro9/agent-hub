import { expect, test } from "@playwright/test";
import { gotoHub, isolate, settleFlow } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE CHROME — every piece of UI furniture folds away: the top bar,
// the nav rail (whole and per-section), and the galaxy HUD cluster. Preference
// persists (its own localStorage slice, outside the hub snapshot).
// ─────────────────────────────────────────────────────────────────────────────

test.describe("collapsible chrome", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("top bar, rail, sections and map controls collapse, reopen, and persist", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);

    // the galaxy HUD folds to a single chevron — buttons hide, never unmount
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse map controls" }).click();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeHidden();
    await page.getByRole("button", { name: "Expand map controls" }).click();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();

    // sidebar sections fold individually
    await page.getByRole("button", { name: /projects · \d+/ }).click();
    await expect(page.getByRole("button", { name: /^model-drift/ })).toHaveCount(0);
    await page.getByRole("button", { name: /projects · \d+/ }).click();
    await expect(page.getByRole("button", { name: /^model-drift/ })).toBeVisible();
    await page.getByRole("button", { name: /agents · \d+/ }).click();
    await expect(page.getByRole("button", { name: /^Critic/ })).toHaveCount(0);
    await page.getByRole("button", { name: /agents · \d+/ }).click();

    // the brand header folds to a slim strip
    await page.getByRole("button", { name: "Collapse header" }).click();
    await expect(page.getByText("Agent Hub")).toHaveCount(0);
    await page.getByRole("button", { name: "Expand header" }).click();
    await expect(page.getByText("Agent Hub")).toBeVisible();

    // the whole rail folds to a reopen strip
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.locator("#hub-search")).toHaveCount(0);
    await page.getByRole("button", { name: "Expand navigation" }).click();
    await expect(page.locator("#hub-search")).toBeVisible();

    // the top bar folds to a floating pill — and the choice SURVIVES a reload
    await page.getByRole("button", { name: "Collapse top bar" }).click();
    await expect(page.getByRole("button", { name: "galaxy" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand top bar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "galaxy" })).toHaveCount(0);
    await page.getByRole("button", { name: "Expand top bar" }).click();
    await expect(page.getByRole("button", { name: "galaxy" })).toBeVisible();
  });
});
