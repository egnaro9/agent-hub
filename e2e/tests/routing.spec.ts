import { expect, test } from "@playwright/test";
import { composer, gotoHub, isolate, say, sidebarProject } from "./helpers";

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
