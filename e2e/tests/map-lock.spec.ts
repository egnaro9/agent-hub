import { expect, test } from "@playwright/test";
import { flowTransform, gotoHub, isolate, settleFlow, wheelOverPane } from "./helpers";

// The lock exists because trackpad scroll was resizing the constellation
// unbidden. The only honest test is the one that actually scrolls.
const lockButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /lock the view/i });

test.describe("map lock", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("scroll-zoom moves the viewport when unlocked and is frozen when locked", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);

    // control: unlocked, the wheel must actually do something — otherwise the
    // locked assertion below would pass for the wrong reason.
    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "false");
    const beforeUnlocked = await flowTransform(page);
    await wheelOverPane(page);
    const afterUnlocked = await flowTransform(page);
    expect(afterUnlocked).not.toBe(beforeUnlocked);

    // lock it
    await lockButton(page).click();
    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(lockButton(page)).toContainText("locked");

    const beforeLocked = await flowTransform(page);
    await wheelOverPane(page);
    expect(await flowTransform(page)).toBe(beforeLocked);
    await wheelOverPane(page, 500); // and the other direction
    expect(await flowTransform(page)).toBe(beforeLocked);

    // unlocking restores it
    await lockButton(page).click();
    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "false");
    await wheelOverPane(page);
    expect(await flowTransform(page)).not.toBe(beforeLocked);
  });

  test("lock state survives a reload and still blocks the wheel", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await lockButton(page).click();
    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await settleFlow(page);

    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(lockButton(page)).toContainText("locked");
    const before = await flowTransform(page);
    await wheelOverPane(page);
    expect(await flowTransform(page)).toBe(before);
  });
});
