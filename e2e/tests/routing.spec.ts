import { expect, test } from "@playwright/test";
import { composer, gotoHub, isolate, say, settleFlow, sidebarProject } from "./helpers";

test.describe("deep links and mode switching", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("#/p/<id>/work lands directly in work mode with a composer", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");

    await expect(composer(page, "crashkit")).toBeVisible();
    // The tasks header always opens "tasks ·" whatever source it settled on —
    // these specs run without a GitHub stub, so the state is not theirs to pin.
    await expect(page.getByText(/^tasks ·/)).toBeVisible();
    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#\/p\/crashkit\/work$/);
  });

  test("#/p/<id> lands in overview mode, and the work tab switches without losing the room", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit");

    // overview: no composer, but the collapsed room drawer handle is there
    await expect(composer(page, "crashkit")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "# crashkit" })).toBeVisible();

    await page.getByRole("button", { name: "work", exact: true }).click();
    await expect(composer(page, "crashkit")).toBeVisible();
    await expect(page).toHaveURL(/#\/p\/crashkit\/work$/);

    await say(page, "crashkit", "hold this thought");
    await expect(page.getByText("hold this thought")).toBeVisible();

    await page.getByRole("button", { name: "overview", exact: true }).click();
    await expect(composer(page, "crashkit")).toHaveCount(0);
    await expect(page).toHaveURL(/#\/p\/crashkit$/);

    await page.getByRole("button", { name: "work", exact: true }).click();
    await expect(composer(page, "crashkit")).toBeVisible();
    await expect(page.getByText("hold this thought")).toBeVisible();
  });

  test("sidebar navigation writes the hash, and the breadcrumb walks back to the constellation", async ({ page }) => {
    await gotoHub(page);
    await expect(page).not.toHaveURL(/#\/p\//);

    await sidebarProject(page, "gradecore").click();
    await expect(page).toHaveURL(/#\/p\/gradecore$/);
    await expect(page.locator("header, div").filter({ hasText: "gradecore" }).first()).toBeVisible();

    await page.getByRole("button", { name: "constellation" }).click();
    await expect(page).not.toHaveURL(/#\/p\//);
    await expect(page.locator(".react-flow__pane")).toBeVisible();
  });

  test("an unknown project id in the hash leaves you on the constellation", async ({ page }) => {
    await gotoHub(page, "/#/p/no-such-project");

    await expect(page.locator(".react-flow__pane")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ summon agent" })).toBeDisabled();
    await expect(page.getByText(/^tasks ·/)).toHaveCount(0);
  });

  test("the brain chip reports mock with no key stored", async ({ page }) => {
    await gotoHub(page);
    await expect(page.getByRole("button", { name: /◈ brain: mock/ })).toBeVisible();
  });

  // The panel used to head itself "live brain · all agents" unconditionally —
  // a fixed feature name sitting under a chip reading `brain: mock`, so opening
  // the panel appeared to contradict the strip. Both now read the same state
  // from the same source; this pins that they can never disagree again.
  test("the brain PANEL agrees with the chip instead of contradicting it", async ({ page }) => {
    await gotoHub(page);
    await page.getByRole("button", { name: /◈ brain: mock/ }).click();

    const state = page.getByTestId("brain-panel-state");
    await expect(state).toBeVisible();
    await expect(state).toHaveText(/brain: mock/i);
    // The old wording must not survive anywhere in the open panel.
    await expect(page.getByText(/live brain · all agents/i)).toHaveCount(0);
    // And with no key, the panel says what mock actually means.
    await expect(page.getByText(/answering from canned personas, not a model/i)).toBeVisible();
  });
});

// READABILITY-1. Browser page-zoom shrinks the CSS viewport, so reading the
// console's 10px labels used to drop a desktop operator into the phone layout.
// The app's own scale must magnify WITHOUT moving the breakpoint, and must
// survive a reload — an operator who needs bigger text needs it every session.
test.describe("the text-size control", () => {
  test("scales the console, keeps the desktop layout, and persists", async ({ page }) => {
    await gotoHub(page);
    const chip = page.getByTestId("ui-scale");
    await expect(chip).toHaveText(/text 100%/);

    const rootZoom = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim());
    expect(await rootZoom()).toBe("1");

    await chip.click();
    await expect(chip).toHaveText(/text 110%/);
    expect(await rootZoom()).toBe("1.1");

    // THE POINT: bigger text, same layout. The desktop strip's own controls are
    // still the desktop ones — no hamburger swap, which is what page-zoom did.
    await expect(page.getByTestId("keys-button")).toBeVisible();
    await expect(page.getByRole("button", { name: "More controls" })).toHaveCount(0);

    // Survives a reload, and the cycle wraps back to 100%.
    await page.reload();
    await expect(page.getByTestId("ui-scale")).toHaveText(/text 110%/);
    for (let i = 0; i < 3; i++) await page.getByTestId("ui-scale").click();
    await expect(page.getByTestId("ui-scale")).toHaveText(/text 100%/);
  });

  // THE RISK the scale actually carries. `zoom` rescales the coordinate space
  // inside #root, so anything doing its own pointer math — the constellation
  // is a full canvas of it — can land a click or a drag somewhere the operator
  // did not aim. A scale that makes the console legible and the map unusable
  // is not a fix. Proven at 110%, where every other spec runs at 100%.
  test("clicks and drags still land where you aim them at 110%", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await page.getByTestId("ui-scale").click();
    await expect(page.getByTestId("ui-scale")).toHaveText(/text 110%/);

    // A drag: the node must follow the hand, not a scaled fraction of it.
    const node = page.locator('.react-flow__node[data-id="crashkit"]');
    const before = await node.boundingBox();
    if (!before) throw new Error("no crashkit node");
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await node.boundingBox();
    if (!after) throw new Error("node vanished mid-drag");
    // Screen-space delta must match the hand's, within a few px of settling.
    expect(Math.abs(after.x - before.x - 120)).toBeLessThan(12);
    expect(Math.abs(after.y - before.y - 60)).toBeLessThan(12);

    // And a click still opens what is under the cursor.
    await node.click();
    await expect(page).toHaveURL(/#\/p\/crashkit/);
  });
});

// The model named on the chip is only a fact while something is calling one.
test("the brain chip does not name a model in mock", async ({ page }) => {
  await gotoHub(page);
  await expect(page.getByRole("button", { name: /◈ brain: mock/ })).toContainText("no model");
  await expect(page.getByRole("button", { name: /◈ brain: mock/ })).not.toContainText("opus");
});
