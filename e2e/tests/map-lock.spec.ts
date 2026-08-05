import { expect, test } from "@playwright/test";
import { galaxyZoom, gotoHub, isolate, settleFlow, wheelOverPane } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE LOCK, on the Galaxy Map. Its contract survives the constellation it was
// born on: trackpad scroll must not resize the view unbidden while locked, and
// unlocking restores the wheel. The only honest test is the one that actually
// scrolls. The galaxy publishes its camera zoom to data-zoom each frame,
// which is what these assertions read.
// ─────────────────────────────────────────────────────────────────────────────

const lockButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /lock the view/i });

/** The camera EASES toward its target and reports its own arrival. */
async function settleZoom(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("galaxy")).toHaveAttribute("data-zoom-settled", "true", { timeout: 10_000 });
}

test.describe("map lock", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("scroll-zoom moves the camera when unlocked and is frozen when locked", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);

    const before = await galaxyZoom(page);
    await wheelOverPane(page, -500);
    // Poll, not sample: under parallel suite load a frame can lag the wheel.
    await expect
      .poll(() => galaxyZoom(page), { timeout: 5000 })
      .not.toBe(before);

    await lockButton(page).click();
    await settleZoom(page);
    const atLock = await galaxyZoom(page);
    await wheelOverPane(page, -500);
    expect(await galaxyZoom(page), "locked wheel still zoomed").toBe(atLock);

    await page.getByRole("button", { name: /unlock the view/i }).click();
    await wheelOverPane(page, 500);
    await expect.poll(() => galaxyZoom(page), { timeout: 5000 }).not.toBe(atLock);
  });

  test("the HUD zoom buttons respect the lock too", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await lockButton(page).click();
    await settleZoom(page);
    const atLock = await galaxyZoom(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(500);
    expect(await galaxyZoom(page), "locked + button still zoomed").toBe(atLock);
  });

  test("the lock survives a reload — an operator's chosen stillness persists", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await lockButton(page).click();
    await page.reload();
    await settleFlow(page);
    await expect(page.getByRole("button", { name: /unlock the view/i })).toBeVisible();
    await settleZoom(page);
    const atLock = await galaxyZoom(page);
    await wheelOverPane(page, -500);
    expect(await galaxyZoom(page)).toBe(atLock);
  });
});
