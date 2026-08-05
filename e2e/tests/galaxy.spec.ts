import { expect, test } from "@playwright/test";
import { galaxyZoom, gotoHub, isolate, settleFlow, stillGalaxy } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE GALAXY MAP — the default spatial view. Planets are DOM labels over a
// canvas (crisp text, clickable, testable); the canvas publishes camera state
// as data attributes because pixels are not assertions.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("the galaxy map", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("every seeded project has a planet label, and clicking one enters the project", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    // all 18 seed planets present, addressable by id
    await expect(page.locator(".gal-lab")).toHaveCount(18);
    await expect(page.locator('[data-planet="gradecore"]')).toBeVisible();

    // Clicking a planet flies in and raises the ARRIVAL CARD — the deliberate
    // beat between map and project — carrying the mode choice.
    await page.locator('[data-planet="crashkit"]').click();
    const card = page.getByTestId("arrival-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("crashkit");
    await expect(card).toContainText("Critic"); // crew, straight from assignments
    await card.getByRole("button", { name: "Overview" }).click();
    await expect(page).toHaveURL(/#\/p\/crashkit$/);

    // the breadcrumb walks back to the galaxy
    await page.getByRole("button", { name: "constellation" }).click();
    await expect(page.locator('[data-planet="crashkit"]')).toBeVisible();

    // WORK on the card lands straight in the workroom
    await page.locator('[data-planet="gradecore"]').click();
    await page.getByTestId("arrival-card").getByRole("button", { name: "Work" }).click();
    await expect(page).toHaveURL(/#\/p\/gradecore\/work$/);

    // ← galaxy lowers the card without entering anything
    await page.getByRole("button", { name: "constellation" }).click();
    await page.locator('[data-planet="pi-eval"]').click();
    await expect(page.getByTestId("arrival-card")).toBeVisible();
    await page.getByTestId("arrival-card").getByRole("button", { name: "← galaxy" }).click();
    await expect(page.getByTestId("arrival-card")).toHaveCount(0);
    await expect(page).not.toHaveURL(/#\/p\//);

    // while the card is up the sky sits behind the scrim, so the "click the
    // planet again" gesture lands on the scrim — and lowers the card
    await page.locator('[data-planet="crashkit"]').click();
    await expect(page.getByTestId("arrival-card")).toBeVisible();
    await page.getByTestId("arrival-scrim").click({ position: { x: 30, y: 30 } });
    await expect(page.getByTestId("arrival-card")).toHaveCount(0);

    // and the SIDEBAR raises, swaps and lowers the same card
    await page.getByRole("button", { name: /^eval-history/ }).click();
    await expect(page.getByTestId("arrival-card")).toContainText("eval-history");
    await page.getByRole("button", { name: /^model-drift/ }).click();
    await expect(page.getByTestId("arrival-card")).toContainText("model-drift");
    await page.getByRole("button", { name: /^model-drift/ }).click();
    await expect(page.getByTestId("arrival-card")).toHaveCount(0);
  });

  test("the immersive 3D mode is optional, entered and left by its own control", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    const galaxy = page.getByTestId("galaxy");
    await expect(galaxy).toHaveAttribute("data-mode", "map");

    const toggle = page.getByRole("button", { name: /toggle immersive 3d/i });
    await toggle.click();
    await expect(galaxy).toHaveAttribute("data-mode", "3d");
    await expect(toggle).toHaveText("MAP");

    // free camera: a drag must not navigate anywhere
    const box = (await galaxy.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 - 70, { steps: 8 });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$|#\/$|^(?!.*#\/p\/)/);

    await toggle.click();
    await expect(galaxy).toHaveAttribute("data-mode", "map");
  });

  test("a crewed project says so on its label — the map agrees with the store", async ({ page }) => {
    // Critic is seed-assigned to crashkit.
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    const lab = page.locator('[data-planet="crashkit"]');
    await expect(lab).toHaveAttribute("title", /Critic is working here/);
  });

  test("zoom controls actually move the camera", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    const before = await galaxyZoom(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => galaxyZoom(page)).not.toBe(before);
    await page.getByRole("button", { name: "Fit view" }).click();
    await expect.poll(() => galaxyZoom(page)).toBe(before);
  });
});
