import { expect, test } from "@playwright/test";
import { flowTransform, gotoHub, isolate, settleFlow, wheelOverPane } from "./helpers";

// The lock exists because trackpad scroll was resizing the constellation
// unbidden. The only honest test is the one that actually scrolls.
const lockButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /lock the view/i });

/**
 * Same real-wheel discipline as wheelOverPane, aimed at the radar. The
 * minimap runs its OWN d3-zoom instance — the flow's zoomOnScroll flags
 * never reach it — so the pane spec above proves nothing about this surface.
 */
async function wheelOverMinimap(page: import("@playwright/test").Page, deltaY = -500) {
  const box = await page.locator(".react-flow__minimap").boundingBox();
  if (!box) throw new Error("minimap has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(600);
}

/** Every node's inline translate, keyed by id — the "are things moving" probe. */
const nodeTransforms = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    JSON.stringify(
      [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((n) => [
        n.getAttribute("data-id"),
        n.style.transform,
      ])
    )
  );

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

  test("locked, the wheel over the minimap is frozen too", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);

    // control: unlocked, the radar's wheel really zooms the main viewport —
    // otherwise the locked assertion below passes for the wrong reason.
    const beforeUnlocked = await flowTransform(page);
    await wheelOverMinimap(page);
    expect(await flowTransform(page)).not.toBe(beforeUnlocked);

    await lockButton(page).click();
    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "true");

    // Locked means the zoom level stops moving on you — from EVERY surface,
    // and the radar is its own input surface.
    const beforeLocked = await flowTransform(page);
    await wheelOverMinimap(page);
    expect(await flowTransform(page)).toBe(beforeLocked);
    await wheelOverMinimap(page, 500); // and the other direction
    expect(await flowTransform(page)).toBe(beforeLocked);
  });

  test("locking mid-arrange stops the motion dead and never animates the camera", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    const restingCamera = await flowTransform(page);
    const restingNodes = await nodeTransforms(page);

    // Arrange, then lock while the 650ms tween is still in flight. Raw mouse
    // clicks on pre-measured boxes, not locator clicks: each locator click
    // pays ~250ms of actionability, and two of those eat most of the tween.
    const arrangeBox = await page
      .getByRole("button", { name: "Arrange: agents center, projects fanned" })
      .boundingBox();
    const lockBox = await lockButton(page).boundingBox();
    if (!arrangeBox || !lockBox) throw new Error("HUD buttons have no box");
    await page.mouse.click(arrangeBox.x + arrangeBox.width / 2, arrangeBox.y + arrangeBox.height / 2);
    await page.mouse.click(lockBox.x + lockBox.width / 2, lockBox.y + lockBox.height / 2);
    await expect(lockButton(page)).toHaveAttribute("aria-pressed", "true");

    // The tween dies within a frame or two of the lock. A "frame" here is a
    // dev-server React commit of 25 nodes — measured ~250ms each — so 700ms
    // buys the lock-jump its two frames; after that the map must be DEAD
    // still, through the window where the abandoned tween (650ms) and its
    // closing fitView (400ms) would still have been moving things.
    await page.waitForTimeout(700);
    const landed = await nodeTransforms(page);
    await page.waitForTimeout(500);
    expect(await nodeTransforms(page)).toBe(landed);

    // Lock stops the MOTION, not the intent: the layout the operator asked
    // for still lands (as a jump), rather than being half-applied or lost.
    expect(landed).not.toBe(restingNodes);

    // And the camera NEVER moved — the arrange's closing fitView is skipped
    // entirely under lock; the fit button stays one deliberate click away.
    // This is the assertion the pre-fix code cannot survive: its tween ran
    // to the end and then animated the camera on a locked map.
    expect(await flowTransform(page)).toBe(restingCamera);
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
