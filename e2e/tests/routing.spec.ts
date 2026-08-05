import { expect, test } from "@playwright/test";
import { composer, gotoHub, isolate, say, settleFlow, sidebarProject, stillGalaxy } from "./helpers";

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

  test("sidebar navigation writes the hash, and the breadcrumb walks back to the galaxy", async ({ page }) => {
    await gotoHub(page);
    await expect(page).not.toHaveURL(/#\/p\//);

    await sidebarProject(page, "gradecore").click();
    // On the galaxy a sidebar row raises the arrival card; Overview enters.
    await page.getByTestId("arrival-card").getByRole("button", { name: "Overview" }).click();
    await expect(page).toHaveURL(/#\/p\/gradecore$/);
    await expect(page.locator("header, div").filter({ hasText: "gradecore" }).first()).toBeVisible();

    await page.getByRole("button", { name: "galaxy" }).click();
    await expect(page).not.toHaveURL(/#\/p\//);
    await expect(page.getByTestId("galaxy")).toBeVisible();
  });

  test("an unknown project id in the hash leaves you on the galaxy", async ({ page }) => {
    await gotoHub(page, "/#/p/no-such-project");

    await expect(page.getByTestId("galaxy")).toBeVisible();
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
  // inside #root, so anything doing its own pointer math — the galaxy is a
  // full canvas of it — can land a click somewhere the operator did not aim.
  // A scale that makes the console legible and the map unusable is not a fix.
  // Proven at 110%, where every other spec runs at 100%.
  test("galaxy clicks and wheel-zoom still land where you aim them at 110%", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    await page.getByTestId("ui-scale").click();
    await expect(page.getByTestId("ui-scale")).toHaveText(/text 110%/);

    // Wheel over the canvas reaches the camera (coordinate space intact)…
    const before = await page.getByTestId("galaxy").getAttribute("data-zoom");
    const box = (await page.getByTestId("galaxy").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(500);
    expect(await page.getByTestId("galaxy").getAttribute("data-zoom")).not.toBe(before);

    // …and a planet click still opens exactly what was under the cursor:
    // the arrival card for THAT planet, whose Overview enters it.
    await page.locator('[data-planet="crashkit"]').click();
    await expect(page.getByTestId("arrival-card")).toContainText("crashkit");
    await page.getByRole("button", { name: "Overview" }).click();
    await expect(page).toHaveURL(/#\/p\/crashkit/);
  });
});

// The model named on the chip is only a fact while something is calling one.
test("the brain chip does not name a model in mock", async ({ page }) => {
  await gotoHub(page);
  await expect(page.getByRole("button", { name: /◈ brain: mock/ })).toContainText("no model");
  await expect(page.getByRole("button", { name: /◈ brain: mock/ })).not.toContainText("opus");
});
