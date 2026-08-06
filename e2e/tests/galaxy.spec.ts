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
    await page.getByRole("button", { name: "galaxy" }).click();
    await expect(page.locator('[data-planet="crashkit"]')).toBeVisible();

    // WORK on the card lands straight in the workroom
    await page.locator('[data-planet="gradecore"]').click();
    await page.getByTestId("arrival-card").getByRole("button", { name: "Work" }).click();
    await expect(page).toHaveURL(/#\/p\/gradecore\/work$/);

    // ← galaxy lowers the card without entering anything
    await page.getByRole("button", { name: "galaxy" }).click();
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

  test("the sky behind a raised card is inert — wheel and drag past the card do nothing", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    await page.locator('[data-planet="crashkit"]').click();
    await expect(page.getByTestId("arrival-card")).toBeVisible();
    const galaxy = page.getByTestId("galaxy");
    // let the fly-in land before sampling the camera
    await expect(galaxy).toHaveAttribute("data-zoom-settled", "true");
    const before = await galaxyZoom(page);
    const box = (await galaxy.boundingBox())!;

    // wheel near the top edge, well past the card — the scrim bubbles to the
    // host's wheel handler, which must refuse while the card is up
    await page.mouse.move(box.x + box.width / 2, box.y + 24);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(300);
    expect(await galaxyZoom(page)).toBe(before);

    // drag past the card must not pan: a label's x-position holds while the
    // pointer is down and moving (sampled BEFORE release — releasing on the
    // scrim is the designed lower-the-card click)
    const lab = page.locator('[data-planet="gradecore"]');
    const leftBefore = await lab.evaluate((el) => (el as HTMLElement).style.left);
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + 80, { steps: 6 });
    await page.waitForTimeout(200);
    expect(await lab.evaluate((el) => (el as HTMLElement).style.left)).toBe(leftBefore);
    await page.mouse.up();
  });

  test("the planet itself is clickable, not only its name", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);

    // Aim at the DISC — the label hangs below the planet, so going up from it
    // lands on canvas that used to be completely inert.
    const disc = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="galaxy"]')!.getBoundingClientRect();
      const lab = document.querySelector('[data-planet="gradecore"]') as HTMLElement;
      return { x: host.left + parseFloat(lab.style.left), y: host.top + parseFloat(lab.style.top) - 26 };
    });
    await page.mouse.move(disc.x, disc.y);
    await expect
      .poll(() => page.evaluate(() => (document.querySelector('[data-testid="galaxy"]') as HTMLElement).style.cursor))
      .toBe("pointer");
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("arrival-card")).toContainText("gradecore");

    // empty sky stays empty — a pick is a hit on a world, not anywhere
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("arrival-card")).toHaveCount(0);
    await settleFlow(page);
    await page.mouse.move(disc.x, disc.y - 220);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("arrival-card")).toHaveCount(0);
  });

  test("a neighbouring world can be stepped to without backing out first", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    await page.locator('[data-planet="crashkit"]').click();
    await expect(page.getByTestId("arrival-card")).toContainText("crashkit");
    await expect(page.getByTestId("galaxy")).toHaveAttribute("data-zoom-settled", "true");

    // Sweep the sky BEHIND the scrim for a world that isn't the staged one.
    // The scrim's cursor is the affordance under test as much as the click is:
    // without it nothing signals that the neighbours are still live.
    const box = (await page.getByTestId("galaxy").boundingBox())!;
    const card = (await page.getByTestId("arrival-card").boundingBox())!;
    const scrimCursor = () =>
      page.evaluate(() => (document.querySelector('[data-testid="arrival-scrim"]') as HTMLElement).style.cursor);

    // The sweep runs INSIDE the page: one round trip instead of several hundred
    // (a move + a read per probe point times a 1400x900 grid times ~50ms each
    // blows the test budget long before it finds anything).
    const hit = await page.evaluate(
      ({ card }) => {
        const scrim = document.querySelector('[data-testid="arrival-scrim"]') as HTMLElement;
        const b = scrim.getBoundingClientRect();
        for (let x = b.left + 40; x < b.right - 40; x += 22) {
          for (let y = b.top + 40; y < b.bottom - 40; y += 22) {
            // the card is a child of the scrim and stops its own clicks
            if (x > card.x - 8 && x < card.x + card.width + 8 && y > card.y - 8 && y < card.y + card.height + 8) continue;
            scrim.style.cursor = "";
            scrim.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
            if (scrim.style.cursor === "pointer") return { x, y };
          }
        }
        return null;
      },
      { card }
    );
    expect(hit, "some world is reachable behind the scrim").toBeTruthy();

    // Clicking it SWAPS the card rather than dismissing — the scrim used to
    // read every click as "leave".
    await page.mouse.click(hit!.x, hit!.y);
    await expect(page.getByTestId("arrival-card")).toBeVisible();
    await expect(page.getByTestId("arrival-card")).not.toContainText("crashkit");

    // ...and empty sky still means leave.
    await page.mouse.move(box.x + 12, box.y + 12);
    expect(await scrimCursor()).not.toBe("pointer");
    await page.mouse.click(box.x + 12, box.y + 12);
    await expect(page.getByTestId("arrival-card")).toHaveCount(0);
  });

  test("the breadcrumb's project name goes back to that world's card, from either mode", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    await page.locator('[data-planet="crashkit"]').click();
    await page.getByTestId("arrival-card").getByRole("button", { name: "Overview" }).click();
    await expect(page).toHaveURL(/#\/p\/crashkit$/);

    // It must land AT THE PLANET, not merely raise a card over the wide map:
    // this asserted only that a card appeared, and passed for a build that
    // dumped you at the far view every time.
    const atPlanet = async () => {
      // The camera must COME TO REST at the planet. Sampling zoom on its own
      // passes the instant after the click — it is still parked high from the
      // last visit and only eases away to the wide view afterwards, so the
      // settled zoom is the only honest question.
      await expect
        .poll(async () => {
          const h = page.getByTestId("galaxy");
          const settled = await h.getAttribute("data-zoom-settled");
          return settled === "true" ? Number(await galaxyZoom(page)) : null;
        }, { timeout: 10_000 })
        .toBeGreaterThan(1.5);
    };

    // from OVERVIEW: the name is the route back to the planet, not to the map
    await page.getByRole("button", { name: /Back to crashkit's world/i }).click();
    await expect(page.getByTestId("arrival-card")).toContainText("crashkit");
    await atPlanet();

    // and from WORK
    await page.getByTestId("arrival-card").getByRole("button", { name: "Work" }).click();
    await expect(page).toHaveURL(/#\/p\/crashkit\/work$/);
    await page.getByRole("button", { name: /Back to crashkit's world/i }).click();
    await expect(page.getByTestId("arrival-card")).toBeVisible();
    await atPlanet();
    // it landed on the galaxy, not still inside the project
    await expect(page).not.toHaveURL(/#\/p\//);
  });

  test("a raised card survives a resize — it never outgrows the canvas, and the world re-aims", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await stillGalaxy(page);
    await page.locator('[data-planet="crashkit"]').click();
    await expect(page.getByTestId("arrival-card")).toBeVisible();

    // The card lives in the CANVAS but used to size itself against the
    // VIEWPORT — with the rail open on a narrow window that put a 600px card
    // in a 450px canvas, clipped on both sides.
    const fits = async () => {
      const r = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="galaxy"]')!.getBoundingClientRect();
        const card = document.querySelector('[data-testid="arrival-card"]')!.getBoundingClientRect();
        return { over: Math.round(card.right - host.right), under: Math.round(card.left - host.left) };
      });
      expect(r.over).toBeLessThanOrEqual(0);
      expect(r.under).toBeGreaterThanOrEqual(0);
    };
    await fits();
    for (const width of [1000, 820, 700, 1200]) {
      await page.setViewportSize({ width, height: 860 });
      await page.waitForTimeout(250);
      await fits();
      await expect(page.getByTestId("arrival-card")).toBeVisible();
    }
    // and the trip still completes after all that
    await page.getByTestId("arrival-card").getByRole("button", { name: "Overview" }).click();
    await expect(page).toHaveURL(/#\/p\/crashkit$/);
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
