import { expect, test } from "@playwright/test";
import { composer, gotoHub, isolate, say, sidebarProject } from "./helpers";

test.describe("persistence across a reload", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("an operator-created project, the room transcript, and the URL/stage all survive", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await expect(composer(page, "crashkit")).toBeVisible();

    await say(page, "crashkit", "new project: persist probe");
    await expect(sidebarProject(page, "persist-probe")).toBeVisible();

    await say(page, "crashkit", "ping from the operator");
    await expect(page.getByText("ping from the operator")).toBeVisible();

    await page.reload();

    // the project the operator minted
    await expect(sidebarProject(page, "persist-probe")).toBeVisible();
    // the room's history, both turns
    await expect(page.getByText("new project: persist probe")).toBeVisible();
    await expect(page.getByText("ping from the operator")).toBeVisible();
    // the URL and the stage it encodes
    await expect(page).toHaveURL(/#\/p\/crashkit\/work$/);
    await expect(composer(page, "crashkit")).toBeVisible();
    await expect(page.getByText(/^tasks ·/)).toBeVisible();
  });

  test("a project id that was never created is absent after a reload (no false positives)", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await say(page, "crashkit", "new project: persist probe");
    await expect(sidebarProject(page, "persist-probe")).toBeVisible();

    await page.reload();

    await expect(sidebarProject(page, "persist-probe")).toBeVisible();
    for (const ghost of ["never-created-project", "persist-probe-2", "phantom"]) {
      await expect(sidebarProject(page, ghost)).toHaveCount(0);
      await expect(page.getByText(ghost, { exact: true })).toHaveCount(0);
    }
  });

  test("a fresh context does NOT see the previous test's project (isolation is real)", async ({ page }) => {
    await gotoHub(page);
    await expect(page.locator("aside")).toBeVisible();
    await expect(sidebarProject(page, "persist-probe")).toHaveCount(0);
    await expect(sidebarProject(page, "bypass-probe")).toHaveCount(0);
    await expect(sidebarProject(page, "gate-probe-alpha")).toHaveCount(0);
    // …while the seeded projects are of course still there.
    await expect(sidebarProject(page, "crashkit")).toBeVisible();
  });
});
